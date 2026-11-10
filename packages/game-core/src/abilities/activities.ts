/**
 * Les activités du jeu où un talent peut agir.
 */

/**
 * Activités où un talent peut agir. `breeding` : parents en pension et assistant de la Pension ;
 * `incubator` : assistant de la couveuse ; `museum` : assistant du Musée ; `center` : Pokémon
 * soigné au Centre Pokémon et assistant du Centre ; `farm` : assistant de la ferme à baies ;
 * `transfer` : Pokémon transféré.
 */
export type AbilityActivity =
  | 'expedition'
  | 'quest'
  | 'battle'
  | 'dungeon'
  | 'breeding'
  | 'incubator'
  | 'museum'
  | 'center'
  | 'farm'
  | 'transfer';

export const ABILITY_ACTIVITY_LABELS: Record<AbilityActivity, string> = {
  expedition: 'expéditions',
  quest: 'légendaires',
  battle: 'combats de dresseurs',
  dungeon: 'donjons',
  breeding: 'pension (parents et assistant)',
  incubator: 'couveuse (assistant)',
  museum: 'Musée (assistant)',
  center: 'Centre Pokémon (soigné et assistant)',
  farm: 'ferme à baies (assistant)',
  transfer: 'transfert',
};
