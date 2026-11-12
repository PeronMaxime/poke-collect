import type { GameContext, PlayerProgress } from '@poke/game-core';
import type { DaycareResponse } from '@poke/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { anyPending, daycareReadyCount, lockedTabsOf, tabFromHash, tabPending } from './menu';
import type { TabCounts } from './menu';

const NONE: TabCounts = {
  finished: 0,
  battleActive: false,
  dungeonActive: false,
  daycareReady: 0,
  koWaiting: 0,
  fossilsReady: 0,
  berriesReady: 0,
  questsReady: 0,
  shopNew: 0,
  rewardsReady: 0,
  evolutionsReady: 0,
};

describe('tabFromHash', () => {
  const at = (hash: string) => vi.stubGlobal('window', { location: { hash } });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lit l’onglet en tête de l’ancre, cible de la page comprise', () => {
    at('#battles/brock');
    expect(tabFromHash()).toBe('battles');
  });

  it('revient aux expéditions pour une ancre inconnue ou vide', () => {
    at('#nulle-part');
    expect(tabFromHash()).toBe('expeditions');
    at('');
    expect(tabFromHash()).toBe('expeditions');
  });
});

describe('tabPending et anyPending', () => {
  it('rien n’attend le joueur', () => {
    expect(anyPending(NONE)).toBe(false);
    expect(tabPending('expeditions', NONE)).toBe(false);
  });

  it('chaque compteur allume son onglet, et lui seul', () => {
    const c = { ...NONE, koWaiting: 2 };
    expect(tabPending('center', c)).toBe(true);
    expect(tabPending('daycare', c)).toBe(false);
    expect(anyPending(c)).toBe(true);
  });

  it('un combat ou un donjon en cours allume son onglet', () => {
    expect(tabPending('battles', { ...NONE, battleActive: true })).toBe(true);
    expect(tabPending('dungeons', { ...NONE, dungeonActive: true })).toBe(true);
    expect(anyPending({ ...NONE, dungeonActive: true })).toBe(true);
  });

  it('les évolutions prêtes allument le PC, les récompenses le Pokédex', () => {
    expect(tabPending('pc', { ...NONE, evolutionsReady: 1 })).toBe(true);
    expect(tabPending('pokedex', { ...NONE, rewardsReady: 1 })).toBe(true);
  });
});

describe('daycareReadyCount', () => {
  const NOW = Date.parse('2026-11-11T12:00:00Z');
  const daycare = (eggs: string[], bagEggs: number, maxEggs: number) =>
    ({
      eggs: eggs.map((hatchAt) => ({ hatchAt })),
      bagEggs: Array.from({ length: bagEggs }, () => ({})),
      maxEggs,
      pensions: [],
    }) as unknown as DaycareResponse;

  it('rien avant le chargement', () => {
    expect(daycareReadyCount(undefined, undefined, NOW)).toBe(0);
  });

  it('compte les œufs éclos et les œufs du sac qui ont une place libre dans la couveuse', () => {
    const d = daycare(['2026-11-11T11:00:00Z', '2026-11-11T13:00:00Z'], 5, 4);
    // 1 œuf éclos, puis 2 places libres pour 5 œufs du sac.
    expect(daycareReadyCount(undefined, d, NOW)).toBe(3);
  });

  it('couveuse pleine : les œufs du sac n’attendent rien', () => {
    expect(daycareReadyCount(undefined, daycare([], 3, 0), NOW)).toBe(0);
  });
});

describe('lockedTabsOf', () => {
  it('ne verrouille rien tant que l’avancement charge', () => {
    const locked = lockedTabsOf({} as GameContext, {} as PlayerProgress, {
      pokedex: undefined,
      battles: undefined,
      daycare: undefined,
      quests: undefined,
      museum: undefined,
      farm: undefined,
      dungeons: undefined,
    });
    expect(locked.size).toBe(0);
  });
});
