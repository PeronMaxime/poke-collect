import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { guildMessages, playerProfiles } from '@poke/db';
import type { GuildMessagesResponse, GuildStateResponse } from '@poke/shared';
import { purgeOldGuildMessages } from '../../src/game/guilds';
import { testApi } from '../support/api';
import type { Call } from '../support/api';

const api = testApi({ start: '2026-11-24T10:00:00Z' });
const { handle } = api;

/** Avance l'horloge du test de `seconds` secondes. */
const advanceSeconds = (seconds: number) => {
  api.clock = new Date(api.clock.getTime() + seconds * 1000);
};

describe('discussion de guilde : débit et conservation', () => {
  let leader: Call;
  let guildId: string;

  beforeAll(async () => {
    const misty = await api.newPlayer('misty@example.com', 'Misty');
    leader = misty.call;
    await handle.db
      .update(playerProfiles)
      .set({ currency: 500_000 })
      .where(eq(playerProfiles.userId, misty.userId));
    const created = await leader<GuildStateResponse>('POST', '/api/guilds', {
      name: 'Azuria',
      description: '',
      joinMode: 'open',
    });
    expect(created.status).toBe(201);
    guildId = created.body.guild!.id;
  });

  const post = (body: string) => leader('POST', '/api/guild/messages', { body });

  it('un message au plus toutes les 3 s', async () => {
    expect((await post('Premier')).status).toBe(204);
    const refused = await post('Trop vite');
    expect(refused).toMatchObject({
      status: 429,
      body: { error: 'GUILD_MESSAGE_RATE_LIMITED', retryAfter: 3 },
    });
    advanceSeconds(3);
    expect((await post('Après la pause')).status).toBe(204);
  });

  it('au plus 20 messages sur 10 minutes', async () => {
    advanceSeconds(600);
    for (let i = 0; i < 20; i++) {
      expect((await post(`Message ${i}`)).status).toBe(204);
      advanceSeconds(5);
    }
    // Le premier des 20 date de 100 s : il sort de la fenêtre dans 500 s.
    const refused = await post('Un de trop');
    expect(refused).toMatchObject({ status: 429, body: { retryAfter: 500 } });
    advanceSeconds(500);
    expect((await post('De nouveau permis')).status).toBe(204);
  });

  it('purge les messages de plus de 90 jours', async () => {
    const old = new Date(api.clock.getTime() - 91 * 24 * 3_600_000);
    await handle.db
      .insert(guildMessages)
      .values({ guildId, userId: null, body: 'Ancien', createdAt: old });
    const removed = await purgeOldGuildMessages(handle.db, await api.content.get(), api.clock);
    expect(removed).toBe(1);
    const { messages } = (await leader<GuildMessagesResponse>('GET', '/api/guild/messages')).body;
    expect(messages.map((m) => m.body)).not.toContain('Ancien');
    expect(messages.map((m) => m.body)).toContain('De nouveau permis');
  });
});
