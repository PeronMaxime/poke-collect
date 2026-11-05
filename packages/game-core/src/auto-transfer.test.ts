import { describe, expect, it } from 'vitest';
import { hiddenEscapeIndexes } from './auto-transfer';
import type { EncounterResult } from './expedition';

const IVS = { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 };

function met(
  speciesId: number,
  outcome: 'captured' | 'escaped',
  extra: Partial<EncounterResult> = {},
): EncounterResult {
  const base = { speciesId, formId: null, level: 5, isShiny: false, captureChance: 0.5 };
  return outcome === 'captured'
    ? {
        ...base,
        outcome,
        pokemon: { speciesId, formId: null, level: 5, isShiny: false, ivs: IVS } as never,
        ...extra,
      }
    : { ...base, outcome, ...extra };
}

describe('échappés résumés au retour', () => {
  it('masque les déjà capturés, pas les nouveaux, chromatiques ni fuyards', () => {
    const encounters = [
      met(16, 'escaped'), // Roucool absent du Pokédex : nouveau, affiché
      met(19, 'escaped'), // Rattata déjà capturé : masqué
      met(19, 'escaped', { isShiny: true }), // chromatique : affiché
      met(19, 'escaped', { questId: 'fuyard' }), // fuyard : affiché
      met(19, 'captured'), // capture : jamais masquée ici
    ];
    const caught = { speciesIds: new Set([19]), formIds: new Set<number>() };
    expect([...hiddenEscapeIndexes(encounters, caught)]).toEqual([1]);
  });

  it('un échappé devient connu une fois son espèce capturée dans l’expédition', () => {
    const encounters = [met(16, 'escaped'), met(16, 'captured'), met(16, 'escaped')];
    const caught = { speciesIds: new Set<number>(), formIds: new Set<number>() };
    expect([...hiddenEscapeIndexes(encounters, caught)]).toEqual([2]);
  });
});
