import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { charmMultiplier, createGameContext, isHealing, pokemonEvolutions } from '@poke/game-core';
import type {
  ClaimedRewards,
  DexCatches,
  EvolutionCheck,
  GameContext,
  PlayerProgress,
} from '@poke/game-core';
import type {
  AssistantDto,
  BattlesResponse,
  CandyDto,
  DungeonsResponse,
  DaycareResponse,
  ExpeditionsResponse,
  FarmResponse,
  GuildLeaderboardResponse,
  GuildProfileResponse,
  GuildStateResponse,
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
import { api } from './api';

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
  dungeons: ['dungeons'],
  shop: ['shop'],
  progression: ['progression'],
  quests: ['quests'],
  trainerCard: ['trainer-card'],
  guild: ['guild'],
  /** Profil (argent) : voir `App`. */
  me: ['me'],
} as const;

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
  keys.dungeons,
  keys.shop,
  keys.progression,
  keys.quests,
  keys.trainerCard,
  keys.guild,
  keys.me,
];

/** Contenu publié, transformé en contexte `game-core` (affichage uniquement : le serveur décide). */
export function useGameContext(): GameContext | undefined {
  const content = useQuery({
    queryKey: keys.content,
    queryFn: () => api<PublicContentDto>('/api/content'),
    staleTime: 5 * 60_000,
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

export const useInventory = () =>
  useQuery({
    queryKey: keys.inventory,
    queryFn: () => api<InventoryEntryDto[]>('/api/inventory'),
  });

export const useExpeditions = () =>
  useQuery({
    queryKey: keys.expeditions,
    queryFn: () => api<ExpeditionsResponse>('/api/expeditions'),
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

/** Donjon en cours, dernière tentative et bilan de chaque donjon. */
export const useDungeons = () =>
  useQuery({ queryKey: keys.dungeons, queryFn: () => api<DungeonsResponse>('/api/dungeons') });

export const useShop = () =>
  useQuery({ queryKey: keys.shop, queryFn: () => api<ShopResponse>('/api/shop') });

/** Guilde du joueur (membres, quêtes du jour et de la semaine), ou ses candidatures s'il n'en a pas. */
export const useGuild = () =>
  useQuery({ queryKey: keys.guild, queryFn: () => api<GuildStateResponse>('/api/guild') });

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
export const useTrainerCard = () =>
  useQuery({
    queryKey: keys.trainerCard,
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
  return useMemo(
    () => ({
      caughtSpeciesIds: new Set(pokedex.data?.filter((d) => d.caught).map((d) => d.speciesId)),
      defeatedTrainerIds: new Set(
        battles.data?.records.filter((r) => r.wins > 0).map((r) => r.trainerId),
      ),
      eggsHatched: daycare.data?.eggsHatched ?? 0,
      questSteps: new Map(quests.data?.quests.map((q) => [q.questId, q.step])),
    }),
    [pokedex.data, battles.data, daycare.data, quests.data],
  );
}

/** Pokédex normal et shiny (paliers et collections). */
export function useDexCatches(): Required<DexCatches> {
  const pokedex = usePokedex();
  return useMemo(
    () => ({
      caughtSpeciesIds: new Set(pokedex.data?.filter((d) => d.caught).map((d) => d.speciesId)),
      caughtShinySpeciesIds: new Set(
        pokedex.data?.filter((d) => d.caughtShiny).map((d) => d.speciesId),
      ),
    }),
    [pokedex.data],
  );
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
export function centerState(ctx: GameContext, pokemon: readonly PokemonDto[], now: number) {
  const healing = pokemon
    .filter((p) => isHealing(p.healUntil, now))
    .sort((a, b) => Date.parse(a.healUntil!) - Date.parse(b.healUntil!));
  const knockedOut = pokemon.filter((p) => p.knockedOut);
  const { slots } = ctx.balance.center;
  return { slots, healing, knockedOut, free: Math.max(0, slots - healing.length) };
}

/** Envoie des Pokémon K.O. au Centre Pokémon. */
export function useHeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pokemonIds: string[]) =>
      api<PokemonDto[]>('/api/center', { method: 'POST', json: { pokemonIds } }),
    onSuccess: () =>
      Promise.all(PLAYER_STATE_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey }))),
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
    onSuccess: () =>
      Promise.all(PLAYER_STATE_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey }))),
  });
}

export const useProgression = () =>
  useQuery({
    queryKey: keys.progression,
    queryFn: () => api<ProgressionResponse>('/api/progression'),
  });

/** Récompenses de progression déjà réclamées (paliers, collections). */
export function useClaimedRewards(): ClaimedRewards {
  const progression = useProgression();
  return useMemo(() => {
    const claims = progression.data?.claims ?? [];
    const ids = (kind: string) =>
      new Set(claims.filter((c) => c.kind === kind).map((c) => c.rewardId));
    return { milestoneIds: ids('milestone'), collectionIds: ids('collection') };
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
