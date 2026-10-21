import { describe, expect, it } from 'vitest';
import { species } from '@poke/data';
import { ABILITY_PROPOSALS } from './ability-proposals';
import { contentIssues } from './integrity';
import { abilitySchema } from './schemas';
import { seedContent } from './seed';

describe('propositions de talents', () => {
  it('sont valides et sans erreur de cohérence', () => {
    for (const ability of ABILITY_PROPOSALS) {
      expect(abilitySchema.parse(ability), ability.id).toEqual(ability);
    }
    const issues = contentIssues({ ...seedContent, abilities: ABILITY_PROPOSALS });
    expect(issues.filter((i) => i.entity === 'ability')).toEqual([]);
  });

  it('couvrent tous les talents des Pokémon de Kanto et Johto', () => {
    const wanted = new Set(
      species.filter((s) => s.id <= 251).flatMap((s) => s.abilities.map((a) => a.name)),
    );
    const proposed = new Set(ABILITY_PROPOSALS.map((a) => a.id));
    expect([...wanted].filter((id) => !proposed.has(id))).toEqual([]);
  });
});
