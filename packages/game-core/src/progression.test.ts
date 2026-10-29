import { describe, expect, it } from 'vitest';
import { seedContent } from '@poke/content';
import { createGameContext, playableContent } from './context';
import { captureProbability, resolveExpedition } from './expedition';
import { buildBattleSetup, resolveBattle } from './battle';
import {
  NO_CLAIMS,
  claimableRewardCount,
  collectionState,
  dexProgress,
  playerBonuses,
  playerSlots,
} from './progression';
import { member, testContext } from './test-helpers';

const ctx = testContext();
const caught = (...ids: number[]) => ({ caughtSpeciesIds: new Set(ids) });
const evoli = ctx.content.collections.find((c) => c.id === 'formes-evoli')!;
/** Évoli et sa forme Partenaire capturés. */
const withEvoliForms = (...ids: number[]) => ({
  caughtSpeciesIds: new Set([...ids, 133]),
  caughtFormIds: new Set(evoli.formIds),
});
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);
const claims = (collections: string[] = []) => ({ collectionIds: new Set(collections) });

describe('Pokédex', () => {
  it('mesure un Pokédex régional ou national', () => {
    expect(dexProgress(ctx, 'kanto', caught(1, 2, 3)).caught).toBe(3);
    // National : toutes les espèces des régions (Hisui reprend des espèces d'autres régions).
    const national = new Set(ctx.regions.flatMap((r) => r.speciesIds)).size;
    expect(dexProgress(ctx, null, caught(1, 2, 3, 999)).total).toBe(national);
  });

  it('mesure le Pokédex shiny sur les captures shiny', () => {
    const ids = new Set(range(1, 8));
    expect(dexProgress(ctx, 'kanto', { caughtSpeciesIds: ids }, true).caught).toBe(0);
    expect(
      dexProgress(ctx, 'kanto', { caughtSpeciesIds: ids, caughtShinySpeciesIds: ids }, true).caught,
    ).toBe(8);
  });
});

describe('collections', () => {
  it('se complète quand toutes les espèces et formes sont capturées', () => {
    expect(evoli.formIds.length).toBeGreaterThan(0);
    expect(collectionState(evoli, caught(133), NO_CLAIMS)).toBe('locked');
    expect(collectionState(evoli, withEvoliForms(), NO_CLAIMS)).toBe('claimable');
    expect(
      collectionState(
        evoli,
        { caughtSpeciesIds: new Set(), caughtFormIds: new Set(evoli.formIds) },
        NO_CLAIMS,
      ),
    ).toBe('locked');
  });

  it('range chaque collection dans une région, masquée si la région est désactivée', () => {
    expect(evoli.regionId).toBe('kanto');
    expect(ctx.content.collections.find((c) => c.id === 'formes-zarbi')?.regionId).toBe('johto');
    expect(
      createGameContext(playableContent({ versionId: 1, ...seedContent })).content.collections.some(
        (c) => c.id === 'formes-motisma',
      ),
    ).toBe(false); // Sinnoh désactivée
  });

  it('compte les récompenses à réclamer', () => {
    const progress = withEvoliForms(...range(1, 16));
    expect(claimableRewardCount(ctx, progress, NO_CLAIMS)).toBe(1); // Évoli
    expect(claimableRewardCount(ctx, progress, claims(['formes-evoli']))).toBe(0);
  });
});

describe('emplacements et bonus', () => {
  it('ajoute les emplacements réclamés', () => {
    const custom = testContext((c) => {
      c.collections[0]!.rewards.expeditionSlots = 1;
      c.collections[0]!.rewards.daycareSlots = 2;
    });
    expect(playerSlots(custom, NO_CLAIMS)).toEqual({ expeditions: 2, daycare: 1 });
    expect(playerSlots(custom, claims([custom.content.collections[0]!.id]))).toEqual({
      expeditions: 3,
      daycare: 3,
    });
  });

  it('ignore une récompense réclamée puis supprimée du contenu', () => {
    expect(playerSlots(ctx, claims(['collection-supprimee'])).expeditions).toBe(2);
  });

  it('cumule les bonus permanents', () => {
    expect(playerBonuses(ctx, NO_CLAIMS)).toEqual({ capture: 1, xp: 1, money: 1, shiny: 1 });
    expect(playerBonuses(ctx, claims(['formes-pikachu', 'formes-evoli', 'formes-zarbi']))).toEqual({
      capture: 1.03,
      xp: 1.03,
      money: 1.01,
      shiny: 1,
    });
  });

  it('applique les bonus à la capture, à l’XP et à l’argent', () => {
    const base = captureProbability(ctx, { captureRate: 45, ballMultiplier: 1 });
    expect(
      captureProbability(ctx, { captureRate: 45, ballMultiplier: 1, bonusMultiplier: 1.5 }),
    ).toBeCloseTo(base * 1.5);

    const zone = ctx.zone('route-1')!;
    const input = {
      zone,
      durationMinutes: 60,
      seed: 42,
      team: [member('a', 4, 10)],
      balls: null,
      berries: null,
      pity: {},
    };
    const plain = resolveExpedition(ctx, input);
    const boosted = resolveExpedition(ctx, {
      ...input,
      bonuses: { capture: 1, xp: 2, money: 1, shiny: 1 },
    });
    expect(boosted.xpPerMember).toBeGreaterThan(plain.xpPerMember);
    expect(boosted.encounters.map((e) => e.speciesId)).toEqual(
      plain.encounters.map((e) => e.speciesId),
    );

    const trainer = ctx.trainer('gamin-tom')!;
    const team = [member('a', 6, 60)];
    const setup = buildBattleSetup(
      ctx,
      trainer,
      team.map((m) => ({ ...m, move: null })),
      1,
      null,
      new Date('2026-10-07T12:00:00Z'),
    );
    const battle = { trainer, setup, commands: [], fledAtMs: null, team };
    const win = resolveBattle(ctx, battle);
    expect(win.outcome).toBe('win');
    const rich = resolveBattle(ctx, {
      ...battle,
      bonuses: { capture: 1, xp: 1, money: 1.1, shiny: 1 },
    });
    expect(rich.money).toBe(Math.floor(trainer.money * 1.1));
  });
});
