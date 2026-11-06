import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '@poke/db';
import type { ContentCache } from './content-cache';

vi.mock('./game/battles', () => ({ settleFinishedBattle: vi.fn() }));
vi.mock('./game/dungeons', () => ({ settleFinishedDungeonRun: vi.fn() }));
vi.mock('./game/legendary', () => ({ settleFinishedLegendaryBattle: vi.fn() }));
vi.mock('./game/closed-places', () => ({ settleClosedPlaces: vi.fn() }));
vi.mock('./game/expeditions', () => ({
  settleExpeditionBalls: vi.fn(),
  nextExpeditionThrow: vi.fn(),
}));

import { settleFinishedBattle } from './game/battles';
import { settleClosedPlaces } from './game/closed-places';
import { settleFinishedDungeonRun } from './game/dungeons';
import { nextExpeditionThrow, settleExpeditionBalls } from './game/expeditions';
import { settleFinishedLegendaryBattle } from './game/legendary';
import { PlayerSettler } from './game/settle';

const db = {} as Db;
const content = {} as ContentCache;
let clock = new Date('2026-11-04T10:00:00Z');
const advance = (ms: number) => (clock = new Date(clock.getTime() + ms));

beforeEach(() => {
  vi.resetAllMocks();
  clock = new Date('2026-11-04T10:00:00Z');
  vi.mocked(settleFinishedBattle).mockResolvedValue(false);
  vi.mocked(settleFinishedDungeonRun).mockResolvedValue(false);
  vi.mocked(settleFinishedLegendaryBattle).mockResolvedValue(false);
  vi.mocked(nextExpeditionThrow).mockResolvedValue(null);
});

const settler = () => new PlayerSettler(db, content, () => clock);

describe('rattrapage des joueurs', () => {
  it('ne revérifie pas la base avant 30 s quand rien n’est en attente', async () => {
    const s = settler();
    await s.settle('a', 'all');
    await s.settle('a', 'all');
    await s.settle('a');
    expect(settleExpeditionBalls).toHaveBeenCalledTimes(1);
    expect(settleClosedPlaces).toHaveBeenCalledTimes(1);
    advance(31_000);
    await s.settle('a', 'all');
    expect(settleExpeditionBalls).toHaveBeenCalledTimes(2);
  });

  it('les appels simultanés d’un joueur partagent un seul rattrapage', async () => {
    const s = settler();
    await Promise.all([s.settle('a', 'all'), s.settle('a', 'all'), s.settle('a', 'all')]);
    expect(settleFinishedBattle).toHaveBeenCalledTimes(1);
    await Promise.all([s.settle('b', 'all'), s.settle('c', 'all')]);
    expect(settleFinishedBattle).toHaveBeenCalledTimes(3);
  });

  it('le rattrapage des Balls ne réclame ni combat ni donjon', async () => {
    await settler().settle('a');
    expect(settleFinishedBattle).not.toHaveBeenCalled();
    expect(settleFinishedDungeonRun).not.toHaveBeenCalled();
    expect(settleClosedPlaces).not.toHaveBeenCalled();
    expect(settleExpeditionBalls).toHaveBeenCalledTimes(1);
  });

  it('revérifie à chaque appel tant qu’un combat est en cours', async () => {
    vi.mocked(settleFinishedBattle).mockResolvedValue(true);
    const s = settler();
    await s.settle('a', 'all');
    await s.settle('a', 'all');
    expect(settleFinishedBattle).toHaveBeenCalledTimes(2);
  });

  it('revient à la prochaine rencontre d’expédition, avant les 30 s', async () => {
    vi.mocked(nextExpeditionThrow).mockResolvedValueOnce(new Date(clock.getTime() + 5_000));
    const s = settler();
    await s.settle('a');
    advance(4_000);
    await s.settle('a');
    expect(settleExpeditionBalls).toHaveBeenCalledTimes(1);
    advance(2_000);
    await s.settle('a');
    expect(settleExpeditionBalls).toHaveBeenCalledTimes(2);
  });

  it('invalidate force une nouvelle vérification', async () => {
    const s = settler();
    await s.settle('a', 'all');
    s.invalidate('a');
    await s.settle('a', 'all');
    expect(settleExpeditionBalls).toHaveBeenCalledTimes(2);
  });

  it('après un échec, le prochain appel réessaie', async () => {
    vi.mocked(settleExpeditionBalls).mockRejectedValueOnce(new Error('base injoignable'));
    const s = settler();
    await expect(s.settle('a')).rejects.toThrow('base injoignable');
    await s.settle('a');
    expect(settleExpeditionBalls).toHaveBeenCalledTimes(2);
  });
});
