/**
 * La couche de données du jeu : tout ce qu'un écran lit ou demande à l'API passe par ici.
 *
 * - `keys.ts` : les clés de cache et ce que chaque famille d'actions recharge ;
 * - `cache.ts` : les retouches du cache après une action, sans relire le serveur ;
 * - un fichier par domaine : ses lectures (`useExpeditions()`…) et ses requêtes d'action.
 *
 * Un écran importe depuis `lib/queries` et n'écrit aucune adresse de l'API.
 */

export * from './keys';
export * from './clock';
export * from './cache';
export * from './player';
export * from './pokemon';
export * from './pokedex';
export * from './inventory';
export * from './expeditions';
export * from './buildings';
export * from './combat';
export * from './shop';
export * from './guild';
export * from './quests';
export * from './trainers';
export * from './settings';
