import { describe, expect, it } from 'vitest';
import { autoTeam } from './auto-team';
import { member, testContext } from './test-helpers';

const ctx = testContext();

// Carapuce (Eau), Salamèche (Feu), Bulbizarre (Plante/Poison), Pikachu (Électrik).
const squirtle = member('carapuce', 7, 20);
const bigSquirtle = member('carapuce-fort', 7, 40);
const charmander = member('salameche', 4, 60);
const bulbasaur = member('bulbizarre', 1, 50);
const pikachu = member('pikachu', 25, 10);
const pc = [squirtle, bigSquirtle, charmander, bulbasaur, pikachu];

describe('autoTeam', () => {
  it('les plus forts en affinité d’abord, puis les plus forts sans affinité', () => {
    expect(autoTeam(ctx, pc, { size: 4, affinityTypes: ['water'] })).toEqual([
      'carapuce-fort',
      'carapuce',
      'salameche',
      'bulbizarre',
    ]);
  });

  it('sans affinité : les plus forts', () => {
    expect(autoTeam(ctx, pc, { size: 2, affinityTypes: [] })).toEqual(['salameche', 'bulbizarre']);
  });

  it('sert les types requis avant le reste', () => {
    expect(
      autoTeam(ctx, pc, {
        size: 2,
        affinityTypes: ['water'],
        requiredTypes: [{ type: 'electric', count: 1 }],
      }),
    ).toEqual(['carapuce-fort', 'pikachu']);
  });

  it('écarte les types interdits et les niveaux trop hauts', () => {
    expect(
      autoTeam(ctx, pc, { size: 6, affinityTypes: [], forbiddenTypes: ['fire'], maxLevel: 45 }),
    ).toEqual(['carapuce-fort', 'carapuce', 'pikachu']);
  });

  it('un seul Méga-Évolué', () => {
    const megaX = member('mega-x', 6, 50, { formId: 10034 });
    const megaY = member('mega-y', 6, 50, { formId: 10035 });
    const team = autoTeam(ctx, [megaX, megaY, pikachu], { size: 3, affinityTypes: [] });
    expect(team).toHaveLength(2);
    expect(team).toContain('pikachu');
  });

  it('prend l’équipe la plus forte si l’affinité ne suffit pas à la PE minimale', () => {
    const strongest = autoTeam(ctx, pc, { size: 1, affinityTypes: [] });
    const minPower = 10_000_000;
    expect(autoTeam(ctx, pc, { size: 1, affinityTypes: ['water'], minPower })).toEqual(strongest);
  });
});
