import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { seedContent } from '@poke/content/seed';
import { inventory, pokedex } from '@poke/db';
import type {
  ClaimExpeditionResponse,
  ExpeditionDto,
  ExpeditionsResponse,
  PokemonDto,
} from '@poke/shared';
import { testApi } from '../support/api';

// Taux de base 1/3 : avec le Charme Chroma (×3), toutes les rencontres sont shiny.
const content = structuredClone(seedContent);
content.balance.shiny.baseRateDenominator = 3;

const api = testApi({ start: '2026-10-07T10:00:00Z', content: content });
const { handle, advance, newPlayer } = api;

describe('shinies', () => {
  let call: Awaited<ReturnType<typeof newPlayer>>['call'];
  let userId: string;
  let starter: PokemonDto;

  beforeAll(async () => {
    ({ call, userId, starter } = await newPlayer('shiny@example.com', 'Chroma', 4));
  });

  /** Lance une expédition de 15 min sur la Route 1, puis la récupère. */
  async function run(ballItemId: string | null = null) {
    const started = await call<ExpeditionDto>('POST', '/api/expeditions', {
      zoneId: 'route-1',
      team: [starter.id],
      balls: { new: ballItemId, shiny: ballItemId, caught: ballItemId },
      berryItemId: null,
    });
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    advance(15);
    const claimed = await call<ClaimExpeditionResponse>(
      'POST',
      `/api/expeditions/${started.body.id}/claim`,
    );
    expect(claimed.status).toBe(200);
    return { started: started.body, result: claimed.body.expedition.result! };
  }

  it('fait monter la chaîne de zone en relançant la même zone dans le délai', async () => {
    const first = await run();
    expect(first.started.shinyChain).toBe(0);
    expect(first.result.shinyChance).toBeCloseTo(1 / 3);

    const list = await call<ExpeditionsResponse>('GET', '/api/expeditions');
    expect(list.body.chains).toEqual([
      {
        zoneId: 'route-1',
        chain: 1,
        expiresAt: new Date(api.clock.getTime() + 120 * 60_000).toISOString(),
      },
    ]);

    advance(30);
    const second = await run();
    expect(second.started.shinyChain).toBe(1);
    expect(second.result.shinyChance).toBeCloseTo(1.25 / 3);
  });

  it('remet la chaîne à 0 une fois le délai passé', async () => {
    advance(121);
    expect((await call<ExpeditionsResponse>('GET', '/api/expeditions')).body.chains).toEqual([]);
    expect((await run()).started.shinyChain).toBe(0);
  });

  it('applique le Charme Chroma possédé et remplit le Pokédex shiny', async () => {
    advance(200);
    await handle.db.insert(inventory).values([
      { ownerId: userId, itemId: 'shiny-charm', quantity: 1 },
      { ownerId: userId, itemId: 'ultra-ball', quantity: 50 },
    ]);
    const { result } = await run('ultra-ball');
    expect(result.shinyChance).toBe(1);
    expect(result.encounters.every((e) => e.isShiny)).toBe(true);
    const captured = result.encounters.filter((e) => e.outcome === 'captured');
    const dex = await handle.db.select().from(pokedex).where(eq(pokedex.ownerId, userId));
    for (const e of captured) {
      expect(dex.find((d) => d.speciesId === e.speciesId)?.caughtShiny).toBe(true);
    }
  });
});
