/**
 * Expéditions : une équipe part dans une zone pour une durée libre, y fait des rencontres à une
 * cadence qui ralentit d'heure en heure, tente de les capturer avec les Balls prévues, et rapporte butin et XP.
 *
 * Le résultat est entièrement déterminé par l'entrée (`ExpeditionInput`) et sa graine : le jeu
 * n'affiche que des aperçus (probabilités, durée, cadence), le serveur rejoue l'expédition.
 *
 * Ordre de lecture : `clock.ts` (combien de rencontres en combien de temps), `capture.ts`
 * (qui est rencontré, avec quelle chance de capture), `balls.ts` (quelle Ball est lancée),
 * `team.ts` (ce qu'une équipe vaut dans une zone), `run.ts` (le déroulement), `xp.ts` et
 * `loot.ts` (ce que l'expédition rapporte).
 */

export * from './clock';
export * from './capture';
export * from './loot';
export * from './team';
export * from './filter';
export * from './balls';
export * from './run';
export * from './xp';
