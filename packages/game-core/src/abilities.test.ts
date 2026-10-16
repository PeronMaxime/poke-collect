import { describe, expect, it } from 'vitest';
import type { AbilityEffect, GameAbility } from '@poke/content';
import {
  abilityBonuses,
  abilityEffectSummary,
  abilityEffectText,
  effectiveAbility,
  memberPower,
} from './abilities';
import {
  battleEnv,
  battleRealDurationMinutes,
  estimateBattle,
  resolveBattle,
  trainerPower,
} from './battle';
import { expeditionEnv, expeditionPlan, resolveExpedition } from './expedition';
import type { ExpeditionInput } from './expedition';
import { pokemonPower } from './pokemon';
import { NO_BONUSES } from './progression';
import { member, testContext } from './test-helpers';

const MEGA_X = 10034;

const modifier = (
  param: Extract<AbilityEffect, { type: 'modifier' }>['param'],
  value: number,
  extra: Partial<Extract<AbilityEffect, { type: 'modifier' }>> = {},
): AbilityEffect => ({ type: 'modifier', param, value, scope: 'team', conditions: [], ...extra });

const ABILITIES: GameAbility[] = [
  { id: 'blaze', description: '', effects: [modifier('power', 10, { scope: 'self' })] },
  {
    id: 'pickup',
    description: 'Ramasse des Poké Dollars en chemin.',
    effects: [modifier('money', 20), modifier('xp', 5)],
  },
  // Talent de Méga-Dracaufeu X.
  { id: 'tough-claws', description: '', effects: [modifier('capture', 50)] },
  {
    id: 'illuminate',
    description: '',
    effects: [modifier('encounters', 50), modifier('expeditionDuration', -25)],
  },
  { id: 'pressure', description: '', effects: [modifier('wildLevel', 5)] },
  {
    id: 'intimidate',
    description: '',
    effects: [modifier('opponentPower', -20), modifier('battleDuration', -50)],
  },
  {
    id: 'natural-cure',
    description: '',
    effects: [modifier('koDuration', -50, { scope: 'self' })],
  },
  {
    id: 'insomnia',
    description: '',
    effects: [
      modifier('power', 100, { scope: 'self', conditions: [{ type: 'timeOfDay', time: 'night' }] }),
    ],
  },
  {
    id: 'synchronize',
    description: '',
    effects: [{ type: 'syncNature', chance: 1, conditions: [] }],
  },
];

const ctx = testContext((c) => {
  c.abilities = ABILITIES;
});

const zone = ctx.zone('route-1')!;
const expedition = (team: ExpeditionInput['team'], extra: Partial<ExpeditionInput> = {}) =>
  resolveExpedition(ctx, {
    zone,
    durationMinutes: 60,
    seed: 42,
    team,
    balls: { itemId: 'poke-ball', quantity: 50 },
    berries: null,
    pity: {},
    ...extra,
  });

describe('talents : PE', () => {
  it('augmente la PE du Pokémon qui a le talent, pas celle des autres', () => {
    const charizard = member('a', 6, 50, { ability: 'blaze' });
    const base = pokemonPower(ctx.species(6)!, charizard);
    expect(memberPower(ctx, charizard)).toBe(Math.round(base * 1.1));
    const env = expeditionEnv(zone, [charizard, member('b', 6, 50)]);
    expect(memberPower(ctx, member('b', 6, 50), env, 1)).toBe(base);
  });

  it('respecte les conditions (de nuit seulement)', () => {
    const p = member('a', 6, 50, { ability: 'insomnia' });
    const base = pokemonPower(ctx.species(6)!, p);
    // Au PC (sans contexte), un effet conditionnel ne compte pas.
    expect(memberPower(ctx, p)).toBe(base);
    expect(memberPower(ctx, p, expeditionEnv(zone, [p], 23))).toBe(base * 2);
    expect(memberPower(ctx, p, expeditionEnv(zone, [p], 12))).toBe(base);
    expect(memberPower(ctx, p, expeditionEnv(zone, [p], null))).toBe(base);
  });

  it('prend le talent de la forme Méga pendant une Méga-Évolution', () => {
    const mega = member('a', 6, 50, { ability: 'blaze', formId: MEGA_X });
    expect(effectiveAbility(ctx, mega)).toBe('tough-claws');
    expect(abilityBonuses(ctx, expeditionEnv(zone, [mega]), NO_BONUSES).capture).toBe(1.5);
    expect(memberPower(ctx, mega)).toBe(pokemonPower(ctx.species(6, MEGA_X)!, mega));
  });
});

describe('talents : expéditions', () => {
  it('cumule les bonus d’équipe avec ceux du joueur, selon l’activité', () => {
    const team = [
      member('a', 6, 50, { ability: 'pickup' }),
      member('b', 6, 50, { ability: 'pickup' }),
    ];
    const env = battleEnv(ctx, ctx.trainer('gamin-tom')!, team);
    expect(abilityBonuses(ctx, env, { ...NO_BONUSES, money: 1.1 })).toEqual({
      capture: 1,
      xp: 1.1,
      money: 1.5,
    });
    // L'argent ne compte pas en expédition.
    expect(abilityBonuses(ctx, expeditionEnv(zone, team), NO_BONUSES).money).toBe(1);
  });

  it('modifie la durée réelle et le nombre de rencontres', () => {
    const team = [member('a', 6, 50, { ability: 'illuminate' })];
    const base = expeditionPlan(ctx, 120);
    const plan = expeditionPlan(ctx, 120, expeditionEnv(zone, team));
    expect(plan.realDurationMinutes).toBe(90);
    expect(plan.encounters).toBe(Math.round(base.encounters * 1.5));
    expect(expedition(team).encounters).toHaveLength(
      Math.round(expeditionPlan(ctx, 60).encounters * 1.5),
    );
  });

  it('augmente le niveau des sauvages sans changer les tirages', () => {
    const plain = expedition([member('a', 6, 50)]);
    const pressure = expedition([member('a', 6, 50, { ability: 'pressure' })]);
    expect(pressure.encounters.map((e) => e.speciesId)).toEqual(
      plain.encounters.map((e) => e.speciesId),
    );
    expect(pressure.encounters.map((e) => e.level)).toEqual(
      plain.encounters.map((e) => Math.min(100, e.level + 5)),
    );
  });

  it('Synchro donne sa nature aux sauvages ; sans talent, les seeds sont inchangés', () => {
    const plain = expedition([member('a', 6, 50)]);
    expect(expedition([member('a', 6, 50, { ability: 'none' })])).toEqual(plain);
    const synced = expedition([member('a', 6, 50, { ability: 'synchronize', nature: 'timid' })]);
    const captured = synced.encounters.flatMap((e) => (e.pokemon ? [e.pokemon] : []));
    expect(captured.length).toBeGreaterThan(0);
    expect(captured.every((p) => p.nature === 'timid')).toBe(true);
  });
});

describe('talents : combats', () => {
  const trainer = ctx.trainer('gamin-tom')!;

  it('réduit la PE adverse et la durée du combat', () => {
    const plain = estimateBattle(ctx, trainer, [member('a', 6, 30)]);
    const scary = estimateBattle(ctx, trainer, [member('a', 6, 30, { ability: 'intimidate' })]);
    expect(scary.trainerPower).toBe(Math.round(plain.trainerPower * 0.8));
    expect(scary.winProbability).toBeGreaterThanOrEqual(plain.winProbability);
    expect(
      battleRealDurationMinutes(ctx, trainer, [member('a', 6, 30, { ability: 'intimidate' })]),
    ).toBe(
      Math.max(
        1,
        Math.round((trainer.durationMinutes ?? ctx.balance.battles.defaultDurationMinutes) * 0.5),
      ),
    );
  });

  it('raccourcit le K.O. du seul Pokémon qui a le talent', () => {
    const team = [member('a', 10, 2, { ability: 'natural-cure' }), member('b', 10, 2)];
    const champion = [...ctx.trainers].sort(
      (x, y) => trainerPower(ctx, y) - trainerPower(ctx, x),
    )[0]!;
    const result = resolveBattle(ctx, { trainer: champion, team, seed: 1 });
    expect(result.outcome).toBe('loss');
    expect(result.team.map((m) => m.koMinutes)).toEqual([
      Math.round(result.koMinutes * 0.5),
      result.koMinutes,
    ]);
  });

  it('applique le bonus d’argent en combat', () => {
    const team = [member('a', 6, 60, { ability: 'pickup' })];
    expect(resolveBattle(ctx, { trainer, team, seed: 1 }).money).toBe(
      Math.floor(trainer.money * 1.2),
    );
  });
});

describe('talents : textes', () => {
  it('explique l’effet au joueur', () => {
    expect(abilityEffectText(modifier('power', -5, { scope: 'self' }))).toBe('−5 % PE (lui)');
    expect(
      abilityEffectText(
        modifier('wildLevel', 5, { conditions: [{ type: 'timeOfDay', time: 'night' }] }),
      ),
    ).toBe('+5 niv. Niveau des sauvages, de nuit');
    expect(abilityEffectSummary(ctx, 'blaze')).toBe('+10 % PE (lui)');
    expect(abilityEffectSummary(ctx, 'pickup')).toBe('Ramasse des Poké Dollars en chemin.');
    expect(abilityEffectSummary(ctx, 'overgrow')).toBeNull();
  });
});
