/**
 * L'état d'un joueur en base, tel que tous les domaines du jeu le lisent et l'écrivent : ses
 * Pokémon (`pokemon.ts`), son Sac (`inventory.ts`), son Pokédex (`pokedex.ts`) et son avancement
 * (`progress.ts`).
 *
 * Ces fonctions ne prennent aucun verrou elles-mêmes : une action qui écrit les appelle depuis
 * `playerTransaction` (voir `../tx.ts`), en leur passant la transaction à la place de `db`.
 */

export * from './pokemon';
export * from './progress';
export * from './inventory';
export * from './pokedex';
