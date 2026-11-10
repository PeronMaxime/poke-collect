import { useMemo } from 'react';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import {
  ASSISTANT_POST_PLACES,
  charmMultiplier,
  createGameContext,
  facilityPlaces,
  isHealing,
  pokemonEvolutions,
} from '@poke/game-core';
import type {
  AssistantPost,
  ClaimedRewards,
  DexCatches,
  EvolutionCheck,
  GameContext,
  PlayerProgress,
} from '@poke/game-core';
import type {
  AssistantDto,
  BattlesResponse,
  LegendaryBattlesResponse,
  CandyDto,
  DungeonsResponse,
  DaycareResponse,
  ExpeditionsResponse,
  FarmResponse,
  GuildLeaderboardResponse,
  GuildProfileResponse,
  GuildStateResponse,
  MeResponse,
  InventoryEntryDto,
  LeaderboardKind,
  LeaderboardResponse,
  MuseumResponse,
  PokedexEntryDto,
  PokedexFormEntryDto,
  PokemonDto,
  PokemonTagDto,
  PokemonTeamDto,
  ProgressionResponse,
  PublicContentDto,
  QuestsResponse,
  ShopResponse,
  TrainerCardResponse,
  TrainerPokedexResponse,
  TrainerProfileResponse,
  TrainerSearchResultDto,
} from '@poke/shared';
import { ApiError, api } from './api';

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

/**
 * Profil du joueur (`null` : non connecté). Tous les `useQuery` de `keys.me` partent de ces
 * options : une invalidation relance la requête avec les options du dernier abonné, qui doit
 * donc toujours savoir la charger (un abonné en `skipToken` la faisait échouer).
 */
export const meQuery = queryOptions({
  queryKey: keys.me,
  queryFn: async (): Promise<MeResponse | null> => {
    try {
      return await api<MeResponse>('/api/me');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return null;
      throw err;
    }
  },
});

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

/** Remplace un Pokémon dans la liste en cache (la réponse de l'action le renvoie à jour). */
export function patchPokemon(queryClient: QueryClient, updated: PokemonDto) {
  queryClient.setQueryData<PokemonDto[]>(keys.pokemon, (list) =>
    list?.map((p) => (p.id === updated.id ? updated : p)),
  );
}

/** Retire des Pokémon de la liste en cache (transférés). */
function removePokemon(queryClient: QueryClient, ids: Iterable<string>) {
  const gone = new Set(ids);
  queryClient.setQueryData<PokemonDto[]>(keys.pokemon, (list) =>
    list?.filter((p) => !gone.has(p.id)),
  );
}

/** Ajoute des Bonbons gagnés aux totaux en cache. */
export function addCandies(queryClient: QueryClient, gained: readonly CandyDto[]) {
  queryClient.setQueryData<CandyDto[]>(keys.candies, (list) => {
    if (!list) return list;
    const next = new Map(list.map((c) => [c.lineageId, c.quantity]));
    for (const g of gained) next.set(g.lineageId, (next.get(g.lineageId) ?? 0) + g.quantity);
    return [...next].map(([lineageId, quantity]) => ({ lineageId, quantity }));
  });
}

/** Fixe la quantité d'un objet du sac (le serveur renvoie ce qu'il reste). */
export function setItemQuantity(queryClient: QueryClient, itemId: string, quantity: number) {
  queryClient.setQueryData<InventoryEntryDto[]>(keys.inventory, (list) => {
    if (!list) return list;
    return list.some((i) => i.itemId === itemId)
      ? list.map((i) => (i.itemId === itemId ? { ...i, quantity } : i))
      : [...list, { itemId, quantity }];
  });
}

/**
 * Après un transfert : retire les Pokémon et ajoute les Bonbons sans relire la collection. Le
 * sac n'est relu que si une Méga-Gemme tenue y est revenue ; les équipes enregistrées filtrent
 * elles-mêmes les Pokémon disparus.
 */
export function applyTransfer(
  queryClient: QueryClient,
  transferred: readonly PokemonDto[],
  gained: readonly CandyDto[],
) {
  removePokemon(
    queryClient,
    transferred.map((p) => p.id),
  );
  addCandies(queryClient, gained);
  return refresh(
    queryClient,
    keys.teams,
    keys.trainerCard,
    ...(transferred.some((p) => p.megaStone) ? [keys.inventory] : []),
  );
}

/** Contenu publié, transformé en contexte `game-core` (affichage uniquement : le serveur décide). */
export function useGameContext(): GameContext | undefined {
  const content = useQuery({
    queryKey: keys.content,
    queryFn: () => api<PublicContentDto>('/api/content'),
    // Le contenu publié ne change qu'à une nouvelle version : `App` le recharge quand le numéro
    // de version renvoyé par `/api/me` ne correspond plus (voir `useContentVersionWatch`).
    staleTime: Infinity,
  });
  return useMemo(
    () => (content.data ? createGameContext(content.data) : undefined),
    [content.data],
  );
}

export const usePokemon = () =>
  useQuery({ queryKey: keys.pokemon, queryFn: () => api<PokemonDto[]>('/api/pokemon') });

/** Étiquettes du joueur, dans leur ordre de création. */
export const useTags = () =>
  useQuery({ queryKey: keys.tags, queryFn: () => api<PokemonTagDto[]>('/api/tags') });

/** Équipes enregistrées du joueur (page « Équipe Pkmn »), dans leur ordre de création. */
export const useTeams = () =>
  useQuery({ queryKey: keys.teams, queryFn: () => api<PokemonTeamDto[]>('/api/teams') });

export const usePokedex = () =>
  useQuery({ queryKey: keys.pokedex, queryFn: () => api<PokedexEntryDto[]>('/api/pokedex') });

export const usePokedexForms = () =>
  useQuery({
    queryKey: [...keys.pokedex, 'forms'],
    queryFn: () => api<PokedexFormEntryDto[]>('/api/pokedex/forms'),
  });

// Les Balls des expéditions en cours sont retirées du sac au fil des rencontres : sac et
// expéditions se rechargent régulièrement pour suivre le stock.
export const useInventory = () =>
  useQuery({
    queryKey: keys.inventory,
    queryFn: () => api<InventoryEntryDto[]>('/api/inventory'),
    refetchInterval: 60_000,
  });

export const useExpeditions = () =>
  useQuery({
    queryKey: keys.expeditions,
    queryFn: () => api<ExpeditionsResponse>('/api/expeditions'),
    refetchInterval: 60_000,
  });

export const useDaycare = () =>
  useQuery({ queryKey: keys.daycare, queryFn: () => api<DaycareResponse>('/api/daycare') });

export const useMuseum = () =>
  useQuery({ queryKey: keys.museum, queryFn: () => api<MuseumResponse>('/api/museum') });

export const useFarm = () =>
  useQuery({ queryKey: keys.farm, queryFn: () => api<FarmResponse>('/api/farm') });

/** Assistants de la Pension, de la couveuse, du Musée, du Centre Pokémon et de la ferme. */
export const useAssistants = () =>
  useQuery({ queryKey: keys.assistants, queryFn: () => api<AssistantDto[]>('/api/assistants') });

export const useBattles = () =>
  useQuery({ queryKey: keys.battles, queryFn: () => api<BattlesResponse>('/api/battles') });

/** Combat légendaire en cours, dernier combat réglé et état de chaque légendaire à combattre. */
export const useLegendaryBattles = () =>
  useQuery({
    queryKey: keys.legendaryBattles,
    queryFn: () => api<LegendaryBattlesResponse>('/api/legendary-battles'),
  });

/** Donjon en cours, dernière tentative et bilan de chaque donjon. */
export const useDungeons = () =>
  useQuery({ queryKey: keys.dungeons, queryFn: () => api<DungeonsResponse>('/api/dungeons') });

export const useShop = () =>
  useQuery({ queryKey: keys.shop, queryFn: () => api<ShopResponse>('/api/shop') });

/** Guilde du joueur (membres, quêtes du jour et de la semaine), ou ses candidatures s'il n'en a pas. */
export const useGuild = () =>
  useQuery({
    queryKey: keys.guild,
    queryFn: () => api<GuildStateResponse>('/api/guild'),
    // Garde à jour la présence des membres.
    refetchInterval: 60_000,
  });

/** Fiche publique d'une guilde. */
export const useGuildProfile = (id: string) =>
  useQuery({
    queryKey: [...keys.guild, 'profile', id],
    queryFn: () => api<GuildProfileResponse>(`/api/guilds/${encodeURIComponent(id)}`),
  });

/** Classement des guildes (rafraîchi au plus toutes les minutes). */
export const useGuildLeaderboard = (enabled: boolean) =>
  useQuery({
    queryKey: ['leaderboard', 'guilds'],
    queryFn: () => api<GuildLeaderboardResponse>('/api/guilds/leaderboard'),
    staleTime: 60_000,
    enabled,
  });

/** Quêtes visibles et leur avancement (calculé et enregistré par le serveur). */
export const useQuests = () =>
  useQuery({ queryKey: keys.quests, queryFn: () => api<QuestsResponse>('/api/quests') });

/** Statistiques cumulées de la Fiche Dresseur. */
export const useTrainerCard = (enabled = true) =>
  useQuery({
    queryKey: keys.trainerCard,
    enabled,
    queryFn: () => api<TrainerCardResponse>('/api/trainer-card'),
  });

/** Classement entre joueurs (rafraîchi au plus toutes les minutes). */
export const useLeaderboard = (kind: LeaderboardKind, enabled = true) =>
  useQuery({
    queryKey: ['leaderboard', kind],
    queryFn: () => api<LeaderboardResponse>(`/api/leaderboard/${kind}`),
    staleTime: 60_000,
    enabled,
  });

/** Fiche Dresseur d'un joueur, retrouvé par son nom. */
export const useTrainerProfile = (name: string) =>
  useQuery({
    queryKey: ['trainers', name.toLowerCase()],
    queryFn: () => api<TrainerProfileResponse>(`/api/trainers/${encodeURIComponent(name)}`),
    staleTime: 60_000,
  });

/** Pokédex d'un autre joueur (lecture seule). */
export const useTrainerPokedex = (name: string) =>
  useQuery({
    queryKey: ['trainers', name.toLowerCase(), 'pokedex'],
    queryFn: () => api<TrainerPokedexResponse>(`/api/trainers/${encodeURIComponent(name)}/pokedex`),
    staleTime: 60_000,
  });

/** Dresseurs dont le nom contient la recherche. */
export const useTrainerSearch = (query: string) =>
  useQuery({
    queryKey: ['trainers', 'search', query.toLowerCase()],
    queryFn: () => api<TrainerSearchResultDto[]>(`/api/trainers?q=${encodeURIComponent(query)}`),
    enabled: query.length > 0,
    staleTime: 30_000,
  });

/**
 * Avancement du joueur pour les déblocages (Pokédex, dresseurs battus, œufs éclos, étapes de
 * quête validées).
 */
export function usePlayerProgress(): PlayerProgress {
  const pokedex = usePokedex();
  const battles = useBattles();
  const daycare = useDaycare();
  const quests = useQuests();
  // Profil du joueur, déjà chargé par l'application : pas de nouvelle requête à l'affichage.
  const me = useQuery({ ...meQuery, refetchOnMount: false });
  const opened = me.data?.profile?.openedRegions;
  return useMemo(
    () => ({
      caughtSpeciesIds: new Set(pokedex.data?.filter((d) => d.caught).map((d) => d.speciesId)),
      defeatedTrainerIds: new Set(
        battles.data?.records.filter((r) => r.wins > 0).map((r) => r.trainerId),
      ),
      eggsHatched: daycare.data?.eggsHatched ?? 0,
      questSteps: new Map(quests.data?.quests.map((q) => [q.questId, q.step])),
      openedRegionIds: new Set(opened),
    }),
    [pokedex.data, battles.data, daycare.data, quests.data, opened],
  );
}

/** Pokédex normal et shiny et formes capturées (collections, complétions d'expédition). */
export function useDexCatches(): Required<DexCatches> {
  const pokedex = usePokedex();
  const forms = usePokedexForms();
  return useMemo(
    () => ({
      caughtSpeciesIds: new Set(pokedex.data?.filter((d) => d.caught).map((d) => d.speciesId)),
      caughtShinySpeciesIds: new Set(
        pokedex.data?.filter((d) => d.caughtShiny).map((d) => d.speciesId),
      ),
      caughtFormIds: new Set(forms.data?.map((f) => f.formId)),
      caughtShinyFormIds: new Set(forms.data?.filter((f) => f.caughtShiny).map((f) => f.formId)),
    }),
    [pokedex.data, forms.data],
  );
}

/** Pokédex indexé : entrée par espèce, entrée par forme, quantité par objet du sac. */
export function useDexIndex() {
  const pokedex = usePokedex();
  const forms = usePokedexForms();
  return useMemo(
    () => ({
      bySpecies: new Map((pokedex.data ?? []).map((e) => [e.speciesId, e])),
      byForm: new Map((forms.data ?? []).map((f) => [f.formId, f])),
    }),
    [pokedex.data, forms.data],
  );
}

/** Quantité possédée de chaque objet du sac (0 si absent). */
export function useItemQuantities(): (itemId: string) => number {
  const inventory = useInventory();
  return useMemo(() => {
    const stock = new Map((inventory.data ?? []).map((i) => [i.itemId, i.quantity]));
    return (itemId: string) => stock.get(itemId) ?? 0;
  }, [inventory.data]);
}

/** Multiplicateur du Charme Chroma possédé (1 = aucun). */
export function useShinyCharm(ctx: GameContext | undefined): number {
  const inventory = useInventory();
  return useMemo(
    () =>
      ctx
        ? charmMultiplier(
            ctx,
            (inventory.data ?? []).filter((i) => i.quantity > 0).map((i) => i.itemId),
          )
        : 1,
    [ctx, inventory.data],
  );
}

/** Pokémon engageable : ni occupé, ni K.O., ni en soins (le serveur vérifie de nouveau). */
export const isUsable = (p: PokemonDto, now: number) =>
  !p.busy && !p.knockedOut && !isHealing(p.healUntil, now);

/**
 * Centre Pokémon : Pokémon en soins (par fin de soins), Pokémon K.O. qui attendent et places
 * libres (affichage : le serveur vérifie de nouveau).
 */
export function centerState(
  ctx: GameContext,
  pokemon: readonly PokemonDto[],
  now: number,
  progress: PlayerProgress,
) {
  const healing = pokemon
    .filter((p) => isHealing(p.healUntil, now))
    .sort((a, b) => Date.parse(a.healUntil!) - Date.parse(b.healUntil!));
  const knockedOut = pokemon.filter((p) => p.knockedOut);
  const slots = facilityPlaces(ctx, 'center', progress);
  const takenOpen = healing.filter((p) => (p.healSlot ?? 0) < slots).length;
  return { slots, healing, knockedOut, free: slots - takenOpen };
}

/**
 * Places à afficher : ouvertes, plus celles encore occupées au-delà (réglage baissé), pour que le
 * joueur puisse toujours les récupérer.
 */
export const shownPlaces = (open: number, taken: readonly number[]) =>
  Math.max(open, ...taken.map((place) => place + 1));

/** Première place couverte par chaque assistant d'un poste (voir `shownPlaces`). */
export const assistantPlaces = (
  assistants: readonly AssistantDto[] | undefined,
  post: AssistantPost,
) =>
  (assistants ?? [])
    .filter((a) => a.post === post)
    .map((a) => a.slot * ASSISTANT_POST_PLACES[post]);

/** Envoie des Pokémon K.O. au Centre Pokémon. */
export function useHeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pokemonIds: string[]) =>
      api<PokemonDto[]>('/api/center', { method: 'POST', json: { pokemonIds } }),
    onSuccess: () => refresh(queryClient, keys.pokemon),
  });
}

/** Rappels du sac (objets `revive`), avec leur quantité. */
export function useReviveStacks(ctx: GameContext) {
  const inventory = useInventory();
  return (inventory.data ?? []).filter((s) => s.quantity > 0 && ctx.itemEffect(s.itemId, 'revive'));
}

/** Ranime des Pokémon K.O. avec un Rappel chacun. */
export function useRevive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { itemId: string; pokemonIds: string[] }) =>
      api<PokemonDto[]>('/api/center/revive', { method: 'POST', json: input }),
    onSuccess: () => refresh(queryClient, keys.pokemon, keys.inventory),
  });
}

const useProgression = () =>
  useQuery({
    queryKey: keys.progression,
    queryFn: () => api<ProgressionResponse>('/api/progression'),
  });

/** Bonus permanent de chance shiny (récompenses réclamées : complétions…), 1 = aucun. */
export function useShinyBonus(): number {
  return useProgression().data?.bonuses.shiny ?? 1;
}

/** Récompenses de progression déjà réclamées (collections, complétions d'expédition). */
export function useClaimedRewards(): ClaimedRewards {
  const progression = useProgression();
  return useMemo(() => {
    const claims = progression.data?.claims ?? [];
    const ids = (kind: string) =>
      new Set(claims.filter((c) => c.kind === kind).map((c) => c.rewardId));
    return {
      collectionIds: ids('collection'),
      completionIds: ids('completion'),
    };
  }, [progression.data]);
}

/** Décalage de l'heure locale par rapport à UTC, envoyé au serveur (évolutions jour / nuit). */
export const utcOffsetMinutes = () => -new Date().getTimezoneOffset();

/**
 * Évolutions possibles de chaque Pokémon, avec l'inventaire et l'heure locale (affichage :
 * le serveur vérifie de nouveau).
 */
export function useEvolutionChecker(ctx: GameContext | undefined) {
  const inventory = useInventory();
  const hour = new Date().getHours();
  return useMemo(() => {
    const stock = new Map(inventory.data?.map((i) => [i.itemId, i.quantity]));
    const env = { itemQuantity: (id: string) => stock.get(id) ?? 0, hour };
    return (p: PokemonDto): EvolutionCheck[] => (ctx ? pokemonEvolutions(ctx, p, env) : []);
  }, [ctx, inventory.data, hour]);
}

/**
 * Le Pokémon peut-il évoluer maintenant vers une espèce ou forme qui manque encore au Pokédex ?
 * (pastille « Évol. » du PC et compteur de l'onglet).
 */
export function useNewEvolutionChecker(ctx: GameContext | undefined) {
  const evolutionsOf = useEvolutionChecker(ctx);
  const { caughtSpeciesIds } = useDexCatches();
  const forms = usePokedexForms();
  return useMemo(() => {
    const caughtFormIds = new Set(forms.data?.map((f) => f.formId));
    return (p: PokemonDto) =>
      evolutionsOf(p).some(
        ({ option, method }) =>
          method &&
          (option.toFormId === null
            ? !caughtSpeciesIds.has(option.toSpeciesId)
            : !caughtFormIds.has(option.toFormId)),
      );
  }, [evolutionsOf, caughtSpeciesIds, forms.data]);
}

/**
 * Repère, au fil d'une liste de Pokémon obtenus, le premier de chaque espèce ou forme (régionale,
 * Méga…) nouvelle au Pokédex, pour n'afficher « Nouveau ! » qu'une fois.
 */
export function newInDexTracker(dex: { newSpeciesIds: number[]; newFormIds?: number[] }) {
  const species = new Set(dex.newSpeciesIds);
  const forms = new Set(dex.newFormIds ?? []);
  return (p: { speciesId: number; formId?: number | null }) => {
    if (p.formId != null && forms.delete(p.formId)) {
      species.delete(p.speciesId);
      return true;
    }
    return species.delete(p.speciesId);
  };
}

export const useCandies = () =>
  useQuery({ queryKey: keys.candies, queryFn: () => api<CandyDto[]>('/api/candies') });

/** Décalage entre l'horloge du serveur et celle du navigateur (comptes à rebours justes). */
export function serverOffset(data: { serverTime: string } | undefined, updatedAt: number) {
  return data ? Date.parse(data.serverTime) - updatedAt : 0;
}
