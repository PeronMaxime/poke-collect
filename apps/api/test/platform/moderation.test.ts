import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { adminAuditLog, playerProfiles, sessions } from '@poke/db';
import type {
  AccountSuspensionDto,
  AdminPlayerDetailResponse,
  BetaProfilesResponse,
  GuildMessagesResponse,
  GuildStateResponse,
  ModerationGuildDetailResponse,
  ModerationGuildDto,
} from '@poke/shared';
import { mergeCookies, testApi } from '../support/api';
import type { Call } from '../support/api';

const api = testApi({ start: '2026-11-24T10:00:00Z' });
const { handle } = api;

const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'motdepasse-solide';

/** Nouvelle session par le mot de passe (après une suspension, les anciennes sont fermées). */
async function signIn(email: string): Promise<{ call: Call; cookie: string }> {
  const res = await api.app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    payload: { email, password: PASSWORD },
  });
  expect(res.statusCode, res.body).toBe(200);
  const cookie = mergeCookies('', res.headers['set-cookie']);
  return { call: api.client(cookie), cookie };
}

/** Dernière action `action` du journal de l'administration sur `entityId`. */
async function audit(action: string, entityId: string) {
  const rows = await handle.db
    .select()
    .from(adminAuditLog)
    .where(and(eq(adminAuditLog.action, action), eq(adminAuditLog.entityId, entityId)));
  return rows.at(-1);
}

const suspensionUrl = (userId: string) => `/api/admin/moderation/players/${userId}/suspension`;

describe('modération', () => {
  let admin: Call;
  let adminId: string;

  beforeAll(async () => {
    const chen = await api.newPlayer('chen@example.com', 'Chen');
    adminId = chen.userId;
    admin = (await api.promoteAdmin(chen.userId, chen.cookie)).call;
  });

  it('suspend un compte : déconnecté, refusé jusqu’à la fin, journalisé', async () => {
    const sacha = await api.newPlayer('sacha@example.com', 'Sacha');
    expect((await sacha.call('GET', '/api/me')).status).toBe(200);

    const suspended = await admin<AccountSuspensionDto>('POST', suspensionUrl(sacha.userId), {
      hours: 24,
      reason: 'Propos injurieux',
    });
    expect(suspended.status).toBe(200);
    expect(suspended.body).toEqual({
      until: '2026-11-25T10:00:00.000Z',
      permanent: false,
      reason: 'Propos injurieux',
    });

    // Sessions fermées ; le cookie encore en cache (5 min) est refusé quand même.
    const open = await handle.db.select().from(sessions).where(eq(sessions.userId, sacha.userId));
    expect(open).toHaveLength(0);
    const refused = await sacha.call('GET', '/api/me');
    expect(refused.status).toBe(403);
    expect(refused.body).toEqual({ error: 'ACCOUNT_SUSPENDED', ...suspended.body });

    // La connexion reste possible : le jeu affiche alors la suspension.
    const { call: again } = await signIn('sacha@example.com');
    expect((await again('GET', '/api/pokemon')).status).toBe(403);

    const detail = await admin<AdminPlayerDetailResponse>(
      'GET',
      `/api/admin/players/${sacha.userId}`,
    );
    expect(detail.body.player.suspension).toEqual(suspended.body);
    expect(await audit('moderation.suspend', sacha.userId)).toMatchObject({
      adminId,
      before: null,
      after: { reason: 'Propos injurieux', hours: 24 },
    });

    // Fin de la suspension : le jeu rouvre de lui-même.
    api.advance(24 * 60 + 1);
    expect((await again('GET', '/api/me')).status).toBe(200);
    expect(
      (await admin<AdminPlayerDetailResponse>('GET', `/api/admin/players/${sacha.userId}`)).body
        .player.suspension,
    ).toBeNull();
  });

  it('suspension définitive, puis levée', async () => {
    const ondine = await api.newPlayer('ondine@example.com', 'Ondine');
    const forever = await admin<AccountSuspensionDto>('POST', suspensionUrl(ondine.userId), {
      hours: null,
      reason: 'Triche',
    });
    expect(forever.body).toMatchObject({ permanent: true, until: '9999-12-31T00:00:00.000Z' });
    const { call: session } = await signIn('ondine@example.com');
    expect((await session('GET', '/api/me')).status).toBe(403);

    expect((await admin('DELETE', suspensionUrl(ondine.userId))).status).toBe(204);
    expect((await session('GET', '/api/me')).status).toBe(200);
    expect(await audit('moderation.unsuspend', ondine.userId)).toMatchObject({
      before: { reason: 'Triche', permanent: true },
    });
  });

  it('suspendre le compte coupe aussi ses profils secondaires', async () => {
    const pierre = await api.newPlayer('pierre@example.com', 'Pierre');
    const created = await api.app.inject({
      method: 'POST',
      url: '/api/beta/profiles',
      headers: { origin: ORIGIN, cookie: pierre.cookie },
    });
    expect(created.statusCode, created.body).toBe(201);
    const alt = created.json<BetaProfilesResponse>().profiles.find((p) => !p.main)!;
    const onAlt = api.client(mergeCookies(pierre.cookie, created.headers['set-cookie']));
    expect((await onAlt('GET', '/api/me')).status).toBe(200);

    await admin('POST', suspensionUrl(pierre.userId), { hours: 1, reason: 'Spam' });
    expect((await onAlt('GET', '/api/me')).status).toBe(403);
    await admin('DELETE', suspensionUrl(pierre.userId));

    // Un profil secondaire suspendu seul ne coupe que lui.
    await admin('POST', suspensionUrl(alt.id), { hours: 1, reason: 'Nom de profil' });
    const main = await signIn('pierre@example.com');
    expect((await main.call('GET', '/api/me')).status).toBe(200);
    const altAgain = await api.app.inject({
      method: 'POST',
      url: '/api/beta/profiles/active',
      headers: { origin: ORIGIN, cookie: main.cookie, 'content-type': 'application/json' },
      payload: { profileId: alt.id },
    });
    expect(altAgain.statusCode, altAgain.body).toBe(200);
    const onAltAgain = api.client(mergeCookies(main.cookie, altAgain.headers['set-cookie']));
    expect((await onAltAgain('GET', '/api/me')).body).toMatchObject({
      error: 'ACCOUNT_SUSPENDED',
      reason: 'Nom de profil',
    });
  });

  it('refuse de suspendre un administrateur ou un compte inconnu', async () => {
    const self = await admin('POST', suspensionUrl(adminId), { hours: 1, reason: 'Essai' });
    expect(self).toMatchObject({ status: 409, body: { error: 'CANNOT_SUSPEND_ADMIN' } });
    const unknown = await admin('POST', suspensionUrl('inconnu'), { hours: 1, reason: 'Essai' });
    expect(unknown.status).toBe(404);
    const noReason = await admin('POST', suspensionUrl('inconnu'), { hours: 1, reason: '' });
    expect(noReason.status).toBe(400);
  });

  it('renomme un dresseur, avec les règles des noms', async () => {
    const regis = await api.newPlayer('regis@example.com', 'Regis');
    const url = `/api/admin/moderation/players/${regis.userId}/trainer-name`;
    expect((await admin('PUT', url, { trainerName: 'Dresseur 42' })).status).toBe(200);
    const [profile] = await handle.db
      .select({ trainerName: playerProfiles.trainerName })
      .from(playerProfiles)
      .where(eq(playerProfiles.userId, regis.userId));
    expect(profile?.trainerName).toBe('Dresseur 42');
    expect(await audit('moderation.rename_trainer', regis.userId)).toMatchObject({
      before: { trainerName: 'Regis' },
      after: { trainerName: 'Dresseur 42' },
    });
    // Changer la casse de son propre nom est permis, prendre celui d'un autre non.
    expect((await admin('PUT', url, { trainerName: 'dresseur 42' })).status).toBe(200);
    const taken = await admin('PUT', url, { trainerName: 'chen' });
    expect(taken).toMatchObject({ status: 409, body: { error: 'TRAINER_NAME_TAKEN' } });
    expect((await admin('PUT', url, { trainerName: 'x' })).status).toBe(400);
  });

  it('guildes : liste, fiche, correction, suppression d’un message', async () => {
    const flora = await api.newPlayer('flora@example.com', 'Flora');
    await handle.db
      .update(playerProfiles)
      .set({ currency: 500_000 })
      .where(eq(playerProfiles.userId, flora.userId));
    const created = await flora.call<GuildStateResponse>('POST', '/api/guilds', {
      name: 'Nom Grossier',
      description: 'Description grossière',
      joinMode: 'open',
    });
    expect(created.status).toBe(201);
    const guildId = created.body.guild!.id;
    expect(
      (await flora.call('POST', '/api/guild/messages', { body: 'Message à retirer' })).status,
    ).toBe(204);

    const list = await admin<ModerationGuildDto[]>('GET', '/api/admin/moderation/guilds?q=gross');
    expect(list.body.map((g) => g.name)).toEqual(['Nom Grossier']);
    expect(list.body[0]).toMatchObject({ memberCount: 1, leaderName: 'Flora' });
    expect(list.body[0]!.lastMessageAt).not.toBeNull();

    const detail = await admin<ModerationGuildDetailResponse>(
      'GET',
      `/api/admin/moderation/guilds/${guildId}`,
    );
    expect(detail.body.members).toEqual([
      { userId: flora.userId, trainerName: 'Flora', role: 'leader' },
    ]);
    const message = detail.body.messages.find((m) => m.body === 'Message à retirer')!;
    expect(message).toMatchObject({ userId: flora.userId, trainerName: 'Flora' });

    const guildUrl = `/api/admin/moderation/guilds/${guildId}`;
    expect((await admin('PATCH', guildUrl, { name: 'Guilde 1', description: '' })).status).toBe(
      204,
    );
    const state = await flora.call<GuildStateResponse>('GET', '/api/guild');
    expect(state.body.guild).toMatchObject({ name: 'Guilde 1', description: '' });
    expect(await audit('moderation.guild_update', guildId)).toMatchObject({
      before: { name: 'Nom Grossier', description: 'Description grossière' },
      after: { name: 'Guilde 1', description: '' },
    });
    expect((await admin('PATCH', guildUrl, {})).status).toBe(400);

    expect((await admin('DELETE', `${guildUrl}/messages/${message.id}`)).status).toBe(204);
    const messages = await flora.call<GuildMessagesResponse>('GET', '/api/guild/messages');
    expect(messages.body.messages.map((m) => m.body)).not.toContain('Message à retirer');
    expect(await audit('moderation.delete_message', message.id)).toMatchObject({
      before: { guildId, body: 'Message à retirer', userId: flora.userId },
    });
    expect((await admin('DELETE', `${guildUrl}/messages/${message.id}`)).status).toBe(404);
    expect((await admin('GET', '/api/admin/moderation/guilds/pas-un-uuid')).status).toBe(400);
  });

  it('réservée aux administrateurs', async () => {
    const joueur = await api.newPlayer('joueur@example.com', 'Joueur');
    expect((await joueur.call('GET', '/api/admin/moderation/guilds')).status).toBe(403);
    const self = await joueur.call('POST', suspensionUrl(adminId), { hours: 1, reason: 'Abus' });
    expect(self.status).toBe(403);
  });
});
