import { describe, expect, it } from 'vitest';
import type { AbilityEffect } from '@poke/content';
import { abilityEffectSummary, helpsAsAssistant } from './abilities';
import { healMinutes, isHealing } from './center';
import { testContext } from './test-helpers';

const koDuration = (value: number, scope: 'self' | 'team'): AbilityEffect => ({
  type: 'modifier',
  param: 'koDuration',
  value,
  scope,
  conditions: [],
});

const ctx = testContext((c) => {
  c.abilities = [
    { id: 'natural-cure', description: '', effects: [koDuration(-50, 'self')] },
    { id: 'healer', description: '', effects: [koDuration(-20, 'team')] },
  ];
});

const holder = (ability: string) => ({ speciesId: 25, formId: null, ability });

describe('Centre Pokémon', () => {
  it('détecte un Pokémon en soins', () => {
    const now = new Date('2026-10-07T12:00:00Z');
    expect(isHealing(null, now)).toBe(false);
    expect(isHealing('2026-10-07T12:30:00Z', now)).toBe(true);
    expect(isHealing(new Date('2026-10-07T11:00:00Z'), now)).toBe(false);
  });

  it('soigne en 30 minutes, talents du soigné et de l’assistant compris', () => {
    expect(ctx.balance.center).toEqual({ slots: 6, healMinutes: 30 });
    expect(healMinutes(ctx, holder('none'), null)).toBe(30);
    expect(healMinutes(ctx, holder('natural-cure'), null)).toBe(15);
    expect(healMinutes(ctx, holder('none'), holder('healer'))).toBe(24);
    // Médic Nature ne vise que son porteur : sans effet chez l'assistant.
    expect(healMinutes(ctx, holder('none'), holder('natural-cure'))).toBe(30);
  });

  it('ne compte comme utiles chez l’assistant que les effets sur toute l’équipe', () => {
    expect(helpsAsAssistant(koDuration(-50, 'self'), 'center')).toBe(false);
    expect(helpsAsAssistant(koDuration(-20, 'team'), 'center')).toBe(true);
    expect(abilityEffectSummary(ctx, 'natural-cure', ['center'], true)).toBeNull();
    expect(abilityEffectSummary(ctx, 'natural-cure', ['center'])).not.toBeNull();
  });
});
