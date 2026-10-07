import { describe, expect, it } from 'vitest';
import {
  checkBattleTeam,
  estimateBattle,
  isKnockedOut,
  resolveBattle,
  trainerPower,
  trainerStatus,
  typeAdvantage,
  typeEffectiveness,
  winProbabilityForRatio,
} from './battle';
import { member, testContext } from './test-helpers';

const ctx = testContext();
const pierre = ctx.trainer('pierre')!;
const progress = (defeated: string[] = [], caught = 1) => ({
  caughtSpeciesIds: new Set(Array.from({ length: caught }, (_, i) => i + 1)),
  defeatedTrainerIds: new Set(defeated),
  eggsHatched: 0,
});

describe('table des types', () => {
  it('multiplie les efficacités sur chaque type du défenseur', () => {
    expect(typeEffectiveness('water', ['fire'])).toBe(2);
    expect(typeEffectiveness('water', ['rock', 'ground'])).toBe(4);
    expect(typeEffectiveness('electric', ['ground'])).toBe(0);
    expect(typeEffectiveness('fire', ['water', 'grass'])).toBe(1);
    expect(typeEffectiveness('inconnu', ['water'])).toBe(1);
  });

  it('calcule l’avantage d’équipe entre −1 et +1', () => {
    const water = [member('a', 7, 10)];
    const fire = [member('b', 4, 10)];
    expect(typeAdvantage(ctx, water, pierre.team)).toBeGreaterThan(0.5);
    expect(typeAdvantage(ctx, fire, pierre.team)).toBeLessThan(-0.5);
    expect(typeAdvantage(ctx, [member('c', 19, 5)], [{ speciesId: 19 }])).toBe(0);
    for (const v of [typeAdvantage(ctx, water, pierre.team), typeAdvantage(ctx, fire, pierre.team)])
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
  });
});

describe('probabilité de victoire', () => {
  it('suit la sigmoïde du plan : 50 % à PE égale, ~90 % à ×1,5, ~10 % à ×0,67', () => {
    expect(winProbabilityForRatio(ctx, 1)).toBeCloseTo(0.5);
    expect(winProbabilityForRatio(ctx, 1.5)).toBeCloseTo(0.9, 1);
    expect(winProbabilityForRatio(ctx, 1 / 1.5)).toBeCloseTo(0.1, 1);
  });

  it('est bornée entre le plancher et le plafond', () => {
    expect(winProbabilityForRatio(ctx, 100)).toBe(0.95);
    expect(winProbabilityForRatio(ctx, 0.01)).toBe(0.05);
    expect(winProbabilityForRatio(ctx, 0)).toBe(0.05);
  });

  it('calcule la PE d’un dresseur sans aléatoire', () => {
    expect(trainerPower(ctx, pierre)).toBe(293);
    const strong = testContext((c) => {
      c.balance.battles.defaultTrainerIv = 31;
    });
    expect(trainerPower(strong, pierre)).toBeGreaterThan(293);
  });

  it('applique l’avantage de types à la PE effective', () => {
    const estimate = estimateBattle(ctx, pierre, [member('a', 7, 20)]);
    expect(estimate.advantage).toBeGreaterThan(0);
    expect(estimate.effectivePower).toBeGreaterThan(estimate.playerPower);
    expect(estimate.effectivePower).toBeLessThanOrEqual(estimate.playerPower * 1.1);
    expect(estimateBattle(ctx, pierre, []).winProbability).toBe(0);
  });
});

describe('conditions d’équipe', () => {
  const leo = ctx.trainer('campeur-leo')!;

  it('vérifie le niveau maximal, les types et la PE minimale', () => {
    expect(checkBattleTeam(ctx, leo, [member('a', 4, 20)])).toContainEqual({
      code: 'LEVEL_TOO_HIGH',
      maxLevel: 15,
    });
    const strict = {
      ...pierre,
      rules: {
        teamSize: 2,
        maxLevel: null,
        requiredTypes: [{ type: 'water', count: 1 }],
        forbiddenTypes: ['fire'],
        minPower: 10_000,
      },
    };
    const codes = checkBattleTeam(ctx, strict, [member('a', 4, 10)]).map((e) => e.code);
    expect(codes).toEqual(['TEAM_SIZE', 'FORBIDDEN_TYPES', 'MISSING_TYPES', 'POWER_TOO_LOW']);
    expect(checkBattleTeam(ctx, pierre, [])).toContainEqual({ code: 'TEAM_EMPTY' });
    expect(checkBattleTeam(ctx, pierre, [member('a', 7, 10)])).toEqual([]);
  });
});

describe('résolution', () => {
  const team = [member('a', 7, 18), member('b', 1, 18)];

  it('est déterministe pour un seed donné', () => {
    const input = { trainer: pierre, team, seed: 42 };
    expect(resolveBattle(ctx, input)).toEqual(resolveBattle(ctx, input));
  });

  it('gagne selon la probabilité estimée', () => {
    const estimate = estimateBattle(ctx, pierre, team);
    const runs = 2000;
    let wins = 0;
    for (let seed = 0; seed < runs; seed++) {
      if (resolveBattle(ctx, { trainer: pierre, team, seed }).outcome === 'win') wins++;
    }
    expect(wins / runs).toBeCloseTo(estimate.winProbability, 1);
  });

  it('récompense une victoire et met K.O. en cas de défaite', () => {
    const results = Array.from({ length: 200 }, (_, seed) =>
      resolveBattle(ctx, { trainer: pierre, team, seed }),
    );
    const win = results.find((r) => r.outcome === 'win')!;
    const loss = results.find((r) => r.outcome === 'loss')!;
    expect(win).toMatchObject({ money: 1200, koMinutes: 0 });
    expect(win.roll).toBeLessThan(win.estimate.winProbability);
    expect(win.team[0]!.happinessAfter).toBe(70 + 3);
    expect(results.some((r) => r.loot.length > 0)).toBe(true);

    expect(loss).toMatchObject({ money: 0, loot: [], koMinutes: 60 });
    expect(loss.xpPerMember).toBe(Math.floor(win.xpPerMember * 0.25));
    expect(loss.team[0]!.happinessAfter).toBe(70 - 2);
  });
});

describe('disponibilité', () => {
  const now = new Date('2026-10-07T12:00:00Z');

  it('détecte un Pokémon K.O.', () => {
    expect(isKnockedOut(null, now)).toBe(false);
    expect(isKnockedOut('2026-10-07T12:30:00Z', now)).toBe(true);
    expect(isKnockedOut(new Date('2026-10-07T11:00:00Z'), now)).toBe(false);
  });

  it('calcule l’état d’un dresseur (verrouillé, recharge, battu)', () => {
    const tom = ctx.trainer('gamin-tom')!;
    expect(trainerStatus(ctx, pierre, progress(), undefined, now)).toEqual({ state: 'locked' });
    expect(trainerStatus(ctx, pierre, progress(['scout-rick']), undefined, now)).toEqual({
      state: 'available',
    });
    expect(
      trainerStatus(
        ctx,
        pierre,
        progress(['scout-rick', 'pierre']),
        { wins: 1, lastWinAt: now },
        now,
      ),
    ).toEqual({ state: 'defeated' });
    const recent = { wins: 1, lastWinAt: new Date(now.getTime() - 60 * 60_000) };
    expect(trainerStatus(ctx, tom, progress(['gamin-tom']), recent, now)).toEqual({
      state: 'cooldown',
      until: new Date(now.getTime() + 3 * 60 * 60_000),
    });
    const old = { wins: 3, lastWinAt: new Date(now.getTime() - 5 * 60 * 60_000) };
    expect(trainerStatus(ctx, tom, progress(['gamin-tom']), old, now)).toEqual({
      state: 'available',
    });
  });
});
