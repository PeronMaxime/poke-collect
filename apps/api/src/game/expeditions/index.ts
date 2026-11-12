/**
 * Expéditions côté serveur : départ, Balls lancées au fil de l'eau, annulation, réclamation.
 *
 * Une expédition est entièrement déterminée par ce qui est enregistré à son départ (graine,
 * équipe, zone, version du contenu, heure) : le serveur la **rejoue** avec `@poke/game-core` chaque
 * fois qu'il en a besoin, et n'enregistre son résultat qu'à la réclamation.
 *
 * Ordre de lecture : `start.ts` (départ, annulation), `balls.ts` (Balls retirées du sac pendant
 * l'expédition), `claim.ts` (réclamation), `state.ts` et `views.ts` (ce que la page affiche).
 */

export * from './basics';
export * from './state';
export * from './balls';
export * from './start';
export * from './claim';
export * from './views';
