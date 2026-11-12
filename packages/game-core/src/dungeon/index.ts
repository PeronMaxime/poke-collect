/**
 * Combats en temps réel contre une suite d'adversaires : donjons (jusqu'au boss, une
 * Méga-Évolution) et dresseurs (voir `battle.ts`). Un seul Pokémon de chaque camp combat à la
 * fois ; chacun attaque à son rythme (selon sa Vitesse) avec l'attaque unique d'un de ses types.
 *
 * Le combat est entièrement déterminé par sa mise en place (`DungeonSetup`, figée au départ),
 * son seed et les changements de Pokémon du joueur (`DungeonCommand`, horodatés depuis le
 * départ) : le serveur et le navigateur calculent le même état à n'importe quel instant.
 *
 * Ordre de lecture : `types.ts` (ce qu'est un combat), `setup.ts` (comment on le prépare),
 * `rules.ts` (cadence et dégâts), `simulation.ts` (le déroulement), `result.ts` (ce qu'il
 * rapporte). `traits.ts`, `status.ts` et `combat.ts` sont internes au dossier.
 */

export * from './moves';
export * from './types';
export * from './commands';
export * from './setup';
export * from './rules';
export * from './state';
export * from './simulation';
export * from './access';
export * from './result';
