import { describe, expect, it } from 'vitest';
import { seedContent } from '@poke/content/seed';
import type { FarmResponse, PokemonDto } from '@poke/shared';
import { addItems } from '../../src/game/store';
import { testApi } from '../support/api';

// Onglets tous ouverts ; 12 parcelles au départ, soit deux champs (9 + 3).
const api = testApi({
  start: '2026-10-08T10:00:00Z',
  content: {
    ...seedContent,
    balance: { ...seedContent.balance, tabUnlocks: {}, farm: { initialPlots: 12 } },
  },
});
const { handle, newPlayer } = api;

describe('Champs de la ferme', () => {
  it('au-delà de 9 parcelles, un nouveau champ avec ses propres assistants', async () => {
    const { call, userId } = await newPlayer('champs@test.fr', 'Agriculteur', 7);
    await addItems(handle.db, userId, [{ itemId: 'razz-berry', quantity: 2 }]);
    const waterId = (await call<PokemonDto[]>('GET', '/api/pokemon')).body[0]!.id;
    const planted = async () => (await call<FarmResponse>('GET', '/api/farm')).body.planted;

    // Deux champs : postes 0 et 1, pas de troisième.
    expect(
      (await call('PUT', '/api/assistants/farm/2', { pokemonId: waterId })).body,
    ).toMatchObject({ error: 'NO_SUCH_SLOT' });

    for (const plotIndex of [0, 10]) {
      expect((await call('POST', '/api/farm', { plotIndex, itemId: 'razz-berry' })).status).toBe(
        201,
      );
    }
    // L'arroseur du 2e champ n'arrose que ses parcelles (9 à 17).
    expect((await call('PUT', '/api/assistants/farm/1', { pokemonId: waterId })).status).toBe(200);
    let [first, second] = await planted();
    expect(first).toMatchObject({ plotIndex: 0, readyAt: null });
    expect(Date.parse(second!.readyAt!) - api.clock.getTime()).toBe(3_600_000);

    expect((await call('DELETE', '/api/assistants/farm/1')).status).toBe(204);
    [first, second] = await planted();
    expect(first).toMatchObject({ plotIndex: 0, readyAt: null, remainingMs: 3_600_000 });
    expect(second).toMatchObject({ plotIndex: 10, readyAt: null, remainingMs: 3_600_000 });

    // Arrosé, le 1er champ pousse sans toucher au 2e.
    expect((await call('PUT', '/api/assistants/farm/0', { pokemonId: waterId })).status).toBe(200);
    [first, second] = await planted();
    expect(first!.readyAt).not.toBeNull();
    expect(second!.readyAt).toBeNull();
  });
});
