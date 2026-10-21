import { describe, expect, it } from 'vitest';
import {
  battleMaxXp,
  buildBattleSetup,
  checkBattleTeam,
  isKnockedOut,
  resolveBattle,
  trainerEnemies,
  trainerPower,
  trainerStatus,
  typeEffectiveness,
} from './battle';
import type { TeamMember } from './expedition';
import type { Trainer } from '@poke/content';
import type { GameContext } from './context';
import { member, testContext } from './test-helpers';

const ctx = testContext();
const pierre = ctx.trainer('pierre')!;
const progress = (defeated: string[] = [], caught = 1) => ({
  caughtSpeciesIds: new Set(Array.from({ length: caught }, (_, i) => i + 1)),
  defeatedTrainerIds: new Set(defeated),
  eggsHatched: 0,
});
const startedAt = new Date('2026-10-07T12:00:00Z');

/** Combat laissé à lui-même (relais automatiques), sans fuite. */
function fight(
  c: GameContext,
  trainer: Trainer,
  team: TeamMember[],
  seed = 42,
  extra: { bonuses?: { capture: number; xp: number; money: number } } = {},
) {
  const setup = buildBattleSetup(
    c,
    trainer,
    team.map((m) => ({ ...m, move: null })),
    seed,
    null,
    startedAt,
  );
  return resolveBattle(c, { trainer, setup, commands: [], fledAtMs: null, team, ...extra });
}

describe('table des types', () => {
  it('multiplie les efficacités sur chaque type du défenseur', () => {
    expect(typeEffectiveness('water', ['fire'])).toBe(2);
    expect(typeEffectiveness('water', ['rock', 'ground'])).toBe(4);
    expect(typeEffectiveness('electric', ['ground'])).toBe(0);
    expect(typeEffectiveness('fire', ['water', 'grass'])).toBe(1);
    expect(typeEffectiveness('inconnu', ['water'])).toBe(1);
  });
});

describe('équipe du dresseur', () => {
  it('calcule la PE d’un dresseur sans aléatoire', () => {
    expect(trainerPower(ctx, pierre)).toBe(293);
    const strong = testContext((c) => {
      c.balance.battles.defaultTrainerIv = 31;
    });
    expect(trainerPower(strong, pierre)).toBeGreaterThan(293);
  });

  it('aligne ses Pokémon dans l’ordre, sans multiplicateur de PV', () => {
    const enemies = trainerEnemies(ctx, pierre);
    expect(enemies.map((e) => e.speciesId)).toEqual(pierre.team.map((m) => m.speciesId));
    expect(enemies.every((e) => e.attackType === null)).toBe(true);
    expect(enemies.at(-1)!.maxHp).toBe(enemies.at(-1)!.stats.hp);
  });

  it('fige la mise en place : temps imparti du dresseur, réglages de combat communs', () => {
    const setup = buildBattleSetup(
      ctx,
      pierre,
      [{ ...member('a', 7, 18), move: null }],
      1,
      12,
      startedAt,
    );
    expect(setup.timeLimitMs).toBe(pierre.timeLimitSeconds * 1000);
    expect(setup.settings.damageMultiplier).toBe(ctx.balance.combat.damageMultiplier);
    expect(setup.team[0]!.attackType).toBe('water');
    expect(setup.hour).toBe(12);
  });
});

describe('conditions d’équipe', () => {
  const leo = ctx.trainer('campeur-leo')!;

  it('vérifie le niveau maximal, les types, la PE minimale et les attaques', () => {
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
    // Pierre : combat à 2 contre 2.
    expect(checkBattleTeam(ctx, pierre, [member('a', 7, 14), member('b', 1, 14)])).toEqual([]);
    expect(checkBattleTeam(ctx, pierre, [member('a', 7, 14), member('b', 152, 14)])).toEqual([
      { code: 'WRONG_REGION', regionId: 'kanto', speciesIds: [152] },
    ]);
    const badMove = { ...member('a', 7, 14), move: { type: 'fire', category: 'special' as const } };
    expect(checkBattleTeam(ctx, pierre, [badMove, member('b', 1, 14)])).toEqual([
      { code: 'INVALID_MOVE' },
    ]);
  });
});

describe('résolution', () => {
  const strong = [member('a', 7, 40), member('b', 1, 40)];
  const weak = [member('a', 10, 3)];

  it('est déterministe pour un seed donné', () => {
    expect(fight(ctx, pierre, strong, 7)).toEqual(fight(ctx, pierre, strong, 7));
  });

  it('récompense une victoire : argent, XP de toute l’équipe adverse, bonheur', () => {
    const win = fight(ctx, pierre, strong);
    expect(win.outcome).toBe('win');
    expect(win).toMatchObject({ money: pierre.money, knockedOut: [] });
    expect(win.defeated).toBe(pierre.team.length);
    expect(win.xpPerMember).toBe(battleMaxXp(ctx, pierre));
    expect(win.team[0]!.happinessAfter).toBe(70 + 3);
    expect(win.endedAtMs).toBeLessThan(pierre.timeLimitSeconds * 1000);
  });

  it('en cas de défaite : XP des seuls vaincus, aucune récompense, K.O.', () => {
    const loss = fight(ctx, pierre, weak);
    expect(loss.outcome).toBe('loss');
    expect(loss).toMatchObject({ money: 0, loot: [], knockedOut: ['a'] });
    expect(loss.xpPerMember).toBeLessThan(battleMaxXp(ctx, pierre));
    expect(loss.team[0]!.koMinutes).toBe(pierre.koMinutes ?? ctx.balance.battles.koMinutes);
    expect(loss.team[0]!.happinessAfter).toBe(70 - 2);
  });

  it('ne donne rien en cas de fuite', () => {
    const setup = buildBattleSetup(
      ctx,
      pierre,
      strong.map((m) => ({ ...m, move: null })),
      1,
      null,
      startedAt,
    );
    const fled = resolveBattle(ctx, {
      trainer: pierre,
      setup,
      commands: [],
      fledAtMs: 100,
      team: strong,
    });
    expect(fled).toMatchObject({ outcome: 'fled', xpPerMember: 0, money: 0, loot: [] });
  });
});

describe('disponibilité', () => {
  const now = new Date('2026-10-07T12:00:00Z');

  it('détecte un Pokémon K.O.', () => {
    expect(isKnockedOut(null, now)).toBe(false);
    expect(isKnockedOut('2026-10-07T12:30:00Z', now)).toBe(true);
    expect(isKnockedOut(new Date('2026-10-07T11:00:00Z'), now)).toBe(false);
  });

  it('calcule l’état d’un dresseur (verrouillé, recharge après chaque combat, battu)', () => {
    const tom = ctx.trainer('gamin-tom')!;
    expect(trainerStatus(ctx, pierre, progress(), undefined, now)).toEqual({ state: 'locked' });
    expect(trainerStatus(ctx, pierre, progress(['scout-rick']), undefined, now)).toEqual({
      state: 'available',
    });
    // Unique : se retente aussitôt après une défaite.
    const lost = { wins: 0, lastEndedAt: now };
    expect(trainerStatus(ctx, pierre, progress(['scout-rick']), lost, now)).toEqual({
      state: 'available',
    });
    expect(
      trainerStatus(
        ctx,
        pierre,
        progress(['scout-rick', 'pierre']),
        { wins: 1, lastEndedAt: now },
        now,
      ),
    ).toEqual({ state: 'defeated' });
    // Répétable : recharge après chaque combat, même perdu.
    const recent = { wins: 0, lastEndedAt: new Date(now.getTime() - 60 * 60_000) };
    expect(trainerStatus(ctx, tom, progress(['gamin-tom']), recent, now)).toEqual({
      state: 'cooldown',
      until: new Date(now.getTime() + 3 * 60 * 60_000),
    });
    const old = { wins: 3, lastEndedAt: new Date(now.getTime() - 5 * 60 * 60_000) };
    expect(trainerStatus(ctx, tom, progress(['gamin-tom']), old, now)).toEqual({
      state: 'available',
    });
  });
});
