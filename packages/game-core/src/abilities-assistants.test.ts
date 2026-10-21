import { describe, expect, it } from 'vitest';
import type { AbilityEffect, GameAbility } from '@poke/content';
import {
  breedingEnv,
  eggCycleMinutes,
  hatchMinutes,
  inheritanceRules,
  resolveEgg,
  transferCandies,
} from './breeding';
import type { DaycareParent } from './breeding';
import { perfectIvCount } from './expedition';
import { restoreMinutes, reviveFossil } from './museum';
import { member, testContext } from './test-helpers';

const modifier = (
  param: Extract<AbilityEffect, { type: 'modifier' }>['param'],
  value: number,
): AbilityEffect => ({ type: 'modifier', param, value, scope: 'team', conditions: [] });

const ABILITIES: GameAbility[] = [
  { id: 'flame-body', description: '', effects: [modifier('hatchTime', -50)] },
  { id: 'cute-charm', description: '', effects: [modifier('eggSpeed', 100)] },
  {
    id: 'compound-eyes',
    description: '',
    effects: [modifier('perfectIvs', 3), modifier('inheritedIvs', 2)],
  },
  { id: 'analytic', description: '', effects: [modifier('restoreTime', -25)] },
  { id: 'pickup', description: '', effects: [modifier('candies', 50)] },
  {
    id: 'synchronize',
    description: '',
    effects: [{ type: 'syncNature', chance: 1, conditions: [] }],
  },
];

const plainCtx = testContext();
const ctx = testContext((c) => {
  c.abilities = ABILITIES;
});

const helper = (ability: string, extra: Partial<DaycareParent> = {}) => {
  const { id: _, ...p } = member('h', 25, 30, { ability, ...extra });
  return p;
};

function parent(speciesId: number, gender: DaycareParent['gender']): DaycareParent {
  const { id: _, ...instance } = member('x', speciesId, 20, { gender });
  return { ...instance, heldItemId: null };
}

const parents: [DaycareParent, DaycareParent] = [parent(3, 'male'), parent(29, 'female')];
const egg = { seed: 7, speciesId: 29, parents, motherIndex: 1 as const };

describe('talents : pension et couveuse', () => {
  it('accélère la ponte et l’éclosion', () => {
    const base = ctx.balance.breeding.eggMinutes;
    expect(eggCycleMinutes(ctx)).toBe(base);
    expect(eggCycleMinutes(ctx, breedingEnv(parents, helper('cute-charm')))).toBe(base / 2);
    expect(hatchMinutes(ctx, 29, helper('flame-body'))).toBe(hatchMinutes(ctx, 29) / 2);
  });

  it('transmet plus d’IV et garantit des IV parfaits', () => {
    const env = breedingEnv(parents, helper('compound-eyes'));
    expect(inheritanceRules(ctx, [null, null], env).ivCount).toBe(
      ctx.balance.breeding.inheritedIvCount + 2,
    );
    const child = resolveEgg(ctx, { ...egg, helper: helper('compound-eyes') });
    expect(perfectIvCount(child)).toBeGreaterThanOrEqual(3);
  });

  it('Synchro : l’assistant donne sa nature à l’œuf', () => {
    const child = resolveEgg(ctx, { ...egg, helper: helper('synchronize', { nature: 'bold' }) });
    expect(child.nature).toBe('bold');
  });

  it('sans talent qui joue, les œufs déjà pondus restent identiques', () => {
    expect(resolveEgg(ctx, { ...egg, helper: helper('overgrow') })).toEqual(
      resolveEgg(plainCtx, egg),
    );
  });
});

describe('talents : Musée et transfert', () => {
  const fossil = { seed: 42, speciesId: 142, formId: null, level: 10 };

  it('raccourcit la restauration et améliore le fossile ranimé', () => {
    expect(restoreMinutes(ctx, { minutes: 240 }, helper('analytic'))).toBe(180);
    expect(restoreMinutes(ctx, { minutes: 240 })).toBe(240);
    const revived = reviveFossil(ctx, { ...fossil, helper: helper('compound-eyes') });
    expect(perfectIvCount(revived)).toBeGreaterThanOrEqual(3);
    expect(reviveFossil(ctx, { ...fossil, helper: helper('overgrow') })).toEqual(
      reviveFossil(plainCtx, fossil),
    );
  });

  it('donne plus de Bonbons au transfert', () => {
    const p = member('a', 25, 10);
    expect(transferCandies(ctx, { ...p, ability: 'pickup' })).toBe(
      Math.round(transferCandies(ctx, p) * 1.5),
    );
  });
});
