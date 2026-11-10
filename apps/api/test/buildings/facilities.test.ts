import { describe, expect, it } from 'vitest';
import { seedContent } from '@poke/content/seed';
import { trainerProgress } from '@poke/db';
import type { FarmResponse, MuseumResponse, ProgressionResponse } from '@poke/shared';
import { addItems } from '../../src/game/store';
import { testApi } from '../support/api';

const beatPierre = { amount: 2, unlock: { type: 'trainerDefeated' as const, trainerId: 'pierre' } };

// Onglets tous ouverts ; 3 parcelles au départ, puis des places en plus après Pierre.
const api = testApi({
  start: '2026-10-08T10:00:00Z',
  content: {
    ...seedContent,
    balance: {
      ...seedContent.balance,
      tabUnlocks: {},
      farm: { initialPlots: 3 },
      facilityUnlocks: {
        expedition: [],
        daycare: [],
        incubator: [],
        museum: [beatPierre],
        farm: [beatPierre],
        center: [{ ...beatPierre, amount: 1 }],
      },
    },
  },
});
const { handle, newPlayer } = api;

describe('Bâtiments à débloquer', () => {
  it('ouvre les places d’un palier dès que sa condition est remplie', async () => {
    const { call, userId } = await newPlayer('batiments@test.fr', 'Bâtisseur');
    await addItems(handle.db, userId, [{ itemId: 'razz-berry', quantity: 1 }]);
    const { museum, center } = seedContent.balance;

    expect((await call<FarmResponse>('GET', '/api/farm')).body.plots).toBe(3);
    expect(
      (await call('POST', '/api/farm', { plotIndex: 3, itemId: 'razz-berry' })).body,
    ).toMatchObject({ error: 'NO_SUCH_SLOT' });
    expect((await call<MuseumResponse>('GET', '/api/museum')).body.slots).toBe(museum.slots);

    await handle.db
      .insert(trainerProgress)
      .values({ ownerId: userId, trainerId: 'pierre', wins: 1 });

    expect((await call<FarmResponse>('GET', '/api/farm')).body.plots).toBe(5);
    expect((await call('POST', '/api/farm', { plotIndex: 3, itemId: 'razz-berry' })).status).toBe(
      201,
    );
    expect((await call<MuseumResponse>('GET', '/api/museum')).body.slots).toBe(museum.slots + 2);
    const { facilities } = (await call<ProgressionResponse>('GET', '/api/progression')).body;
    // Un Centre en plus : 6 places.
    expect(facilities).toMatchObject({ farm: 5, center: center.slots + 6 });
  });
});
