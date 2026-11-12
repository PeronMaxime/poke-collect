import type { QueryClient } from '@tanstack/react-query';

/**
 * Clés de cache (TanStack Query) de l'état du joueur, et rechargements après une action.
 *
 * Règle : après une action, on ne recharge que ce qu'elle a pu changer (`refresh` avec les clés
 * voulues, ou l'une des fonctions `refreshAfter…`), jamais toutes les données.
 */

/** Clés TanStack Query de l'état du joueur (invalidées après chaque action). */
export const keys = {
  content: ['content'],
  pokemon: ['pokemon'],
  tags: ['tags'],
  teams: ['teams'],
  pokedex: ['pokedex'],
  inventory: ['inventory'],
  expeditions: ['expeditions'],
  daycare: ['daycare'],
  museum: ['museum'],
  farm: ['farm'],
  assistants: ['assistants'],
  candies: ['candies'],
  battles: ['battles'],
  legendaryBattles: ['legendary-battles'],
  dungeons: ['dungeons'],
  shop: ['shop'],
  progression: ['progression'],
  quests: ['quests'],
  trainerCard: ['trainer-card'],
  guild: ['guild'],
  /** Profil (argent) : voir `App`. */
  me: ['me'],
} as const;

/** Toutes les données du joueur : réservé aux changements qui touchent tout (choix du starter). */
export const PLAYER_STATE_KEYS = [
  keys.pokemon,
  keys.teams,
  keys.pokedex,
  keys.inventory,
  keys.expeditions,
  keys.daycare,
  keys.museum,
  keys.farm,
  keys.assistants,
  keys.candies,
  keys.battles,
  keys.legendaryBattles,
  keys.dungeons,
  keys.shop,
  keys.progression,
  keys.quests,
  keys.trainerCard,
  keys.guild,
  keys.me,
];

/**
 * Données qui dérivent de l'avancement du joueur (Pokédex, quêtes, dresseurs battus, œufs
 * éclos) : à recharger avec toute action qui peut faire avancer l'une d'elles.
 */
export const PROGRESS_KEYS = [
  keys.pokedex,
  keys.quests,
  keys.shop,
  keys.progression,
  keys.trainerCard,
];

type QueryKey = readonly unknown[];

/**
 * Recharge seulement les données qu'une action a modifiées (voir `PROGRESS_KEYS`). `keys.me`
 * n'est à lister que si l'argent ou la région change : ni transfert, ni favori, ni objet.
 * Une donnée que personne n'affiche n'est pas rechargée tout de suite, seulement marquée
 * périmée pour son prochain affichage.
 */
export function refresh(queryClient: QueryClient, ...queryKeys: readonly QueryKey[]) {
  return Promise.all(queryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

/** Départ d'une expédition : équipe occupée, baies de départ retirées du sac. */
export const refreshAfterExpeditionStart = (queryClient: QueryClient) =>
  refresh(queryClient, keys.expeditions, keys.pokemon, keys.inventory);

/**
 * Récupération d'une expédition : captures, butin, Bonbons du transfert automatique, Pokédex,
 * quêtes, guilde. Pas d'argent : `me` reste en cache.
 */
export const refreshAfterExpeditionClaim = (queryClient: QueryClient) =>
  refresh(
    queryClient,
    keys.expeditions,
    keys.pokemon,
    keys.inventory,
    keys.candies,
    keys.teams,
    ...PROGRESS_KEYS,
    keys.guild,
  );

/**
 * Fin d'un combat de dresseur ou de donjon (`queryKey` : `keys.battles` ou `keys.dungeons`) :
 * argent, expérience, K.O., butin et avancement.
 */
export const refreshAfterCombat = (queryClient: QueryClient, queryKey: QueryKey) =>
  refresh(
    queryClient,
    queryKey,
    keys.pokemon,
    keys.inventory,
    keys.me,
    ...PROGRESS_KEYS,
    keys.guild,
  );

/**
 * Récompense de quête, de collection ou de complétion : argent, objets, bonus et places
 * (expéditions, pensions, couveuses, Musée, parcelles).
 */
export const refreshAfterReward = (queryClient: QueryClient) =>
  refresh(
    queryClient,
    keys.me,
    keys.inventory,
    keys.progression,
    keys.quests,
    keys.shop,
    keys.trainerCard,
    keys.expeditions,
    keys.daycare,
    keys.museum,
    keys.farm,
  );
