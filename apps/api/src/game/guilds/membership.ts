import { and, eq, sql } from 'drizzle-orm';
import { guildJoinRequests, guildMembers, guilds, playerProfiles } from '@poke/db';
import type { Db } from '@poke/db';
import type { GameContext, GuildRole } from '@poke/game-core';
import type { CreateGuildInput, UpdateGuildInput } from '@poke/shared';
import type { ContentCache } from '../../content-cache';
import { GameError } from '../errors';
import { requireStartedProfile } from '../expeditions';
import { playerTransaction } from '../tx';
import {
  ROLE_RANK,
  assertNoCooldown,
  lockGuild,
  lockProfile,
  memberCount,
  membership,
  requireMembership,
  systemMessage,
  trainerName,
  userByName,
} from './common';
import type { GuildMemberRow } from './common';
import { raiseQuestTargets } from './quests';
import { guildState } from './reads';

/**
 * Composition d'une guilde : création, adhésion (libre ou sur demande), départ, exclusion, rôles
 * et réglages.
 */

/** Ajoute le joueur à la guilde (places vérifiées) et retire ses autres candidatures. */
async function addMember(
  db: Db,
  ctx: GameContext,
  guildId: string,
  userId: string,
  role: GuildRole,
  now: Date,
) {
  if ((await memberCount(db, guildId)) >= ctx.balance.guilds.maxMembers) {
    throw new GameError(409, 'GUILD_FULL');
  }
  await db.insert(guildMembers).values({ userId, guildId, role, joinedAt: now });
  await db.delete(guildJoinRequests).where(eq(guildJoinRequests.userId, userId));
  await raiseQuestTargets(db, ctx, guildId, now);
}

export async function createGuild(
  db: Db,
  content: ContentCache,
  userId: string,
  input: CreateGuildInput,
  now: Date,
) {
  const ctx = await content.get();
  await requireStartedProfile(db, userId);
  const cost = ctx.balance.guilds.creationCost;
  await playerTransaction(db, userId, async (tx) => {
    const profile = await lockProfile(tx, userId);
    if (await membership(tx, userId)) throw new GameError(409, 'ALREADY_IN_GUILD');
    assertNoCooldown(ctx, profile.guildLeftAt, now);
    if (profile.currency < cost) throw new GameError(409, 'NOT_ENOUGH_MONEY', { cost });
    const [taken] = await tx
      .select({ id: guilds.id })
      .from(guilds)
      .where(sql`lower(${guilds.name}) = lower(${input.name})`);
    if (taken) throw new GameError(409, 'GUILD_NAME_TAKEN');
    const [guild] = await tx
      .insert(guilds)
      .values({ ...input, createdAt: now })
      .returning({ id: guilds.id });
    await addMember(tx, ctx, guild!.id, userId, 'leader', now);
    await tx
      .update(playerProfiles)
      .set({ currency: sql`${playerProfiles.currency} - ${cost}` })
      .where(eq(playerProfiles.userId, userId));
    const name = await trainerName(tx, userId);
    await systemMessage(tx, guild!.id, `${name} a fondé la guilde « ${input.name} ».`, now);
  });
  return guildState(db, content, userId, now);
}

/** Rejoint une guilde ouverte, ou y dépose une candidature. */
export async function joinGuild(
  db: Db,
  content: ContentCache,
  userId: string,
  guildId: string,
  now: Date,
): Promise<{ joined: boolean }> {
  const ctx = await content.get();
  await requireStartedProfile(db, userId);
  return playerTransaction(db, userId, async (tx) => {
    const profile = await lockProfile(tx, userId);
    if (await membership(tx, userId)) throw new GameError(409, 'ALREADY_IN_GUILD');
    assertNoCooldown(ctx, profile.guildLeftAt, now);
    const guild = await lockGuild(tx, guildId);
    if (guild.joinMode === 'request') {
      await tx
        .insert(guildJoinRequests)
        .values({ guildId, userId, createdAt: now })
        .onConflictDoNothing();
      return { joined: false };
    }
    await addMember(tx, ctx, guildId, userId, 'member', now);
    await systemMessage(tx, guildId, `${await trainerName(tx, userId)} a rejoint la guilde.`, now);
    return { joined: true };
  });
}

export async function cancelJoinRequest(db: Db, userId: string, guildId: string) {
  await db
    .delete(guildJoinRequests)
    .where(and(eq(guildJoinRequests.guildId, guildId), eq(guildJoinRequests.userId, userId)));
}

/** Chef ou officier : accepte (ou refuse) la candidature d'un dresseur. */
export async function answerJoinRequest(
  db: Db,
  content: ContentCache,
  userId: string,
  name: string,
  accept: boolean,
  now: Date,
) {
  const ctx = await content.get();
  const member = await requireMembership(db, userId, ['leader', 'officer']);
  const candidateId = await userByName(db, name);
  await playerTransaction(db, userId, async (tx) => {
    const [request] = await tx
      .delete(guildJoinRequests)
      .where(
        and(
          eq(guildJoinRequests.guildId, member.guildId),
          eq(guildJoinRequests.userId, candidateId),
        ),
      )
      .returning();
    if (!request) throw new GameError(404, 'REQUEST_NOT_FOUND');
    if (!accept) return;
    const profile = await lockProfile(tx, candidateId);
    if (await membership(tx, candidateId)) throw new GameError(409, 'ALREADY_IN_GUILD');
    assertNoCooldown(ctx, profile.guildLeftAt, now);
    await lockGuild(tx, member.guildId);
    await addMember(tx, ctx, member.guildId, candidateId, 'member', now);
    await systemMessage(
      tx,
      member.guildId,
      `${await trainerName(tx, candidateId)} a rejoint la guilde.`,
      now,
    );
  });
}

/**
 * Quitte la guilde (délai avant d'en rejoindre une autre). Le chef passe la main à l'officier le
 * plus ancien, sinon au membre le plus ancien ; le dernier membre dissout la guilde.
 */
export async function leaveGuild(db: Db, userId: string, now: Date) {
  const member = await requireMembership(db, userId);
  await playerTransaction(db, userId, async (tx) => {
    await lockGuild(tx, member.guildId);
    await tx.delete(guildMembers).where(eq(guildMembers.userId, userId));
    await tx
      .update(playerProfiles)
      .set({ guildLeftAt: now })
      .where(eq(playerProfiles.userId, userId));
    const remaining = await tx
      .select()
      .from(guildMembers)
      .where(eq(guildMembers.guildId, member.guildId));
    if (remaining.length === 0) {
      await tx.delete(guilds).where(eq(guilds.id, member.guildId));
      return;
    }
    const name = await trainerName(tx, userId);
    await systemMessage(tx, member.guildId, `${name} a quitté la guilde.`, now);
    if (member.role !== 'leader') return;
    const [heir] = remaining.sort(
      (a, b) =>
        ROLE_RANK[a.role] - ROLE_RANK[b.role] || a.joinedAt.getTime() - b.joinedAt.getTime(),
    );
    await tx
      .update(guildMembers)
      .set({ role: 'leader' })
      .where(eq(guildMembers.userId, heir!.userId));
    await systemMessage(
      tx,
      member.guildId,
      `${await trainerName(tx, heir!.userId)} devient chef de la guilde.`,
      now,
    );
  });
}

/** Membre de la même guilde que l'acteur, désigné par son nom de dresseur. */
async function targetMember(db: Db, actor: GuildMemberRow, name: string) {
  const targetId = await userByName(db, name);
  const target = await membership(db, targetId);
  if (!target || target.guildId !== actor.guildId) throw new GameError(404, 'MEMBER_NOT_FOUND');
  if (target.userId === actor.userId) throw new GameError(400, 'CANNOT_TARGET_SELF');
  return target;
}

/** Exclusion : le chef exclut n'importe qui, un officier seulement les simples membres. */
export async function kickMember(db: Db, userId: string, name: string, now: Date) {
  const actor = await requireMembership(db, userId, ['leader', 'officer']);
  const target = await targetMember(db, actor, name);
  if (ROLE_RANK[target.role] <= ROLE_RANK[actor.role]) throw new GameError(403, 'GUILD_FORBIDDEN');
  await playerTransaction(db, userId, async (tx) => {
    await tx.delete(guildMembers).where(eq(guildMembers.userId, target.userId));
    await systemMessage(
      tx,
      actor.guildId,
      `${await trainerName(tx, target.userId)} a été exclu de la guilde.`,
      now,
    );
  });
}

/** Chef : nomme un officier, le rétrograde, ou passe la main (il devient officier). */
export async function setMemberRole(
  db: Db,
  userId: string,
  name: string,
  role: GuildRole,
  now: Date,
) {
  const actor = await requireMembership(db, userId, ['leader']);
  const target = await targetMember(db, actor, name);
  await playerTransaction(db, userId, async (tx) => {
    await tx.update(guildMembers).set({ role }).where(eq(guildMembers.userId, target.userId));
    if (role !== 'leader') return;
    await tx.update(guildMembers).set({ role: 'officer' }).where(eq(guildMembers.userId, userId));
    await systemMessage(
      tx,
      actor.guildId,
      `${await trainerName(tx, target.userId)} devient chef de la guilde.`,
      now,
    );
  });
}

/** Chef : description et mode d'adhésion. */
export async function updateGuild(db: Db, userId: string, input: UpdateGuildInput) {
  const actor = await requireMembership(db, userId, ['leader']);
  if (input.description === undefined && input.joinMode === undefined) return;
  await db.update(guilds).set(input).where(eq(guilds.id, actor.guildId));
}
