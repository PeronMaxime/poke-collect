import { z } from 'zod';
import { slugSchema } from '@poke/content';
import type {
  ChestRarity,
  ContentIssue,
  FacilityId,
  GameContent,
  GuildObjective,
  GuildQuestDifficulty,
  GuildQuestPeriod,
  ItemStack,
  ProgressReward,
  QuestReward,
} from '@poke/content';
import { STAT_NAMES } from '@poke/data';
import type { StatName, Stats } from '@poke/data';
import type {
  BattleError,
  BattleResult,
  BreedingError,
  CaptureFilter,
  DungeonCommand,
  DungeonMove,
  DungeonOutcome,
  DungeonResult,
  DungeonSetup,
  DungeonTeamError,
  ExpeditionError,
  ExpeditionResult,
  Gender,
  GuildJoinMode,
  GuildRole,
  PlayerBonuses,
  PlayerSlots,
  QuestStatus,
  RewardKind,
  ShopEntryState,
} from '@poke/game-core';
import {
  GUILD_DESCRIPTION_MAX,
  GUILD_MESSAGE_MAX,
  GUILD_NAME_MAX,
  GUILD_NAME_MIN,
  MAX_LOTS_PER_PURCHASE,
  MOVE_CATEGORIES,
} from '@poke/game-core';

/** Schémas et types de l'API, partagés entre `apps/api`, `apps/web` et `apps/admin`. */

export const userRoleSchema = z.enum(['player', 'admin']);
export type UserRole = z.infer<typeof userRoleSchema>;

// --- Profil dresseur ----------------------------------------------------------

export const trainerNameSchema = z
  .string()
  .trim()
  .min(3, 'Au moins 3 caractères')
  .max(16, 'Au plus 16 caractères')
  .regex(/^[\p{L}\p{N} _-]+$/u, 'Lettres, chiffres, espaces, - et _ uniquement');

export const createProfileInputSchema = z.object({
  trainerName: trainerNameSchema,
});
export type CreateProfileInput = z.infer<typeof createProfileInputSchema>;

export interface PlayerProfileDto {
  trainerName: string;
  regionUnlocked: string;
  /** Null tant que le starter n'a pas été choisi. */
  starterSpeciesId: number | null;
  /** Starter choisi dans chaque région suivante (identifiant de région → espèce). */
  regionStarters: Record<string, number>;
  currency: number;
  createdAt: string;
}

export const chooseStarterInputSchema = z.object({ speciesId: z.int().positive() });
export type ChooseStarterInput = z.infer<typeof chooseStarterInputSchema>;

// --- Pokémon, Pokédex, inventaire -------------------------------------------------

export type PokemonOrigin = 'starter' | 'capture' | 'egg' | 'quest' | 'fossil' | 'admin';

export interface PokemonDto {
  id: string;
  speciesId: number;
  /** Forme alternative ou régionale ; null = forme par défaut. */
  formId: number | null;
  level: number;
  xp: number;
  ivs: Stats;
  nature: string;
  ability: string;
  isShiny: boolean;
  gender: Gender;
  happiness: number;
  /** Nature d'origine, quand un Aromate a changé la nature effective (`nature`). */
  originalNature: string | null;
  origin: PokemonOrigin;
  originRegion: string | null;
  caughtAt: string;
  locked: boolean;
  /** Occupé (expédition, combat, pension) : indisponible pour une autre activité. */
  busy: boolean;
  activity: PokemonActivity | null;
  /** K.O. après une défaite : indisponible tant qu'il n'est pas soigné au Centre Pokémon. */
  knockedOut: boolean;
  /** En soins au Centre Pokémon jusqu'à cette date (comparer à l'heure du serveur). */
  healUntil: string | null;
  /** Place du Centre Pokémon occupée pendant les soins. */
  healSlot: number | null;
  /** Étiquettes du joueur (identifiants de `PokemonTagDto`). */
  tagIds: string[];
  /** Attaque enregistrée pour les donjons ; null = choix par défaut. */
  dungeonMove: DungeonMove | null;
  /** Méga-Gemme tenue : le Pokémon est Méga-Évolué (`formId` = sa forme Méga). */
  megaStone: string | null;
}

export type PokemonActivity = 'expedition' | 'battle' | 'daycare' | 'dungeon' | 'assistant';

// --- Assistants ------------------------------------------------------------------------

/**
 * Pokémon affecté à une place d'un bâtiment (`daycare`, `incubator`, `museum`, `center`, `farm`) : son
 * talent agit sur ce qui occupe cette place.
 */
export interface AssistantDto {
  post: 'daycare' | 'incubator' | 'museum' | 'center' | 'farm' | 'harvest';
  /** Place du bâtiment (pension, place de la couveuse, du Musée ou du Centre). */
  slot: number;
  pokemonId: string;
}

export const assignAssistantInputSchema = z.object({ pokemonId: z.uuid() });
export type AssignAssistantInput = z.infer<typeof assignAssistantInputSchema>;

// --- Centre Pokémon ----------------------------------------------------------------------

/** Pokémon K.O. à soigner (dans la limite des places libres du Centre). */
export const healPokemonInputSchema = z.object({ pokemonIds: z.array(z.uuid()).min(1).max(999) });
export type HealPokemonInput = z.infer<typeof healPokemonInputSchema>;

/** Pokémon K.O. ranimés par un objet `revive` (un objet par Pokémon). */
export const revivePokemonInputSchema = z.object({
  itemId: slugSchema,
  pokemonIds: z.array(z.uuid()).min(1).max(100),
});
export type RevivePokemonInput = z.infer<typeof revivePokemonInputSchema>;

// --- Étiquettes (tags) -----------------------------------------------------------------

export const TAG_LABEL_MAX = 10;
export const MAX_TAGS = 50;

export const updatePokemonInputSchema = z
  .object({ locked: z.boolean(), tagIds: z.array(z.uuid()).max(MAX_TAGS) })
  .partial()
  .refine((v) => v.locked !== undefined || v.tagIds !== undefined, 'Rien à modifier');
export type UpdatePokemonInput = z.infer<typeof updatePokemonInputSchema>;

export const tagInputSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, 'Texte obligatoire')
    .max(TAG_LABEL_MAX, `Au plus ${TAG_LABEL_MAX} caractères`),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, 'Couleur invalide'),
});
export type TagInput = z.infer<typeof tagInputSchema>;

/** Étiquette collée sur des Pokémon du joueur (plusieurs possibles par Pokémon). */
export interface PokemonTagDto {
  id: string;
  label: string;
  /** Couleur de fond, `#rrggbb`. */
  color: string;
}

export const TEAM_NAME_MAX = 20;
export const MAX_TEAMS = 30;
/** Taille maximale d'une équipe enregistrée (celle d'une équipe d'expédition, de combat ou de donjon). */
export const TEAM_MAX_SIZE = 6;

export const teamInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Nom obligatoire')
    .max(TEAM_NAME_MAX, `Au plus ${TEAM_NAME_MAX} caractères`),
  pokemonIds: z
    .array(z.uuid())
    .max(TEAM_MAX_SIZE)
    .refine((ids) => new Set(ids).size === ids.length, 'Pokémon en double'),
});
export type TeamInput = z.infer<typeof teamInputSchema>;

/**
 * Équipe enregistrée (page « Équipe Pkmn ») : un Pokémon n'appartient qu'à une équipe à la fois.
 * Les Pokémon transférés depuis sont déjà retirés de `pokemonIds`.
 */
export interface PokemonTeamDto {
  id: string;
  name: string;
  pokemonIds: string[];
}

export interface PokedexEntryDto {
  speciesId: number;
  seen: boolean;
  caught: boolean;
  caughtShiny: boolean;
  /** Version shiny déjà rencontrée (capturée ou non). */
  seenShiny: boolean;
  /** Formes de l'espèce déjà rencontrées (capturées ou non). */
  seenFormIds: number[];
  /** Formes déjà rencontrées en version shiny. */
  seenShinyFormIds: number[];
  firstCaughtAt: string | null;
}

/** Forme capturée (régionale, Méga, Gigamax…). */
export interface PokedexFormEntryDto {
  formId: number;
  caughtShiny: boolean;
  firstCaughtAt: string;
}

export interface InventoryEntryDto {
  itemId: string;
  quantity: number;
}

// --- Évolutions -----------------------------------------------------------------------

/** Décalage de l'heure locale du joueur par rapport à UTC, en minutes. */
const utcOffsetSchema = z
  .int()
  .min(-14 * 60)
  .max(14 * 60);

export const evolveInputSchema = z.object({
  toSpeciesId: z.int().positive(),
  /** Forme d'arrivée (Raichu d'Alola) ; absente = première évolution vers l'espèce. */
  toFormId: z.int().positive().nullish(),
  /** Décalage de l'heure locale du joueur par rapport à UTC (évolutions de jour ou de nuit). */
  utcOffsetMinutes: utcOffsetSchema,
});
export type EvolveInput = z.infer<typeof evolveInputSchema>;

export interface EvolveResponse {
  pokemon: PokemonDto;
  fromSpeciesId: number;
  fromFormId: number | null;
  /** Objet consommé (pierre, Câble Link…). */
  consumedItemId: string | null;
  /** Espèces obtenues pour la première fois. */
  newSpeciesIds: number[];
  /** Formes (régionales, Méga…) obtenues pour la première fois. */
  newFormIds: number[];
}

// --- Progression : collections et complétions d'expédition -----------------------------

export interface RewardClaimDto {
  kind: RewardKind;
  rewardId: string;
  claimedAt: string;
}

export interface ProgressionResponse {
  claims: RewardClaimDto[];
  /** Emplacements débloqués (départ + récompenses réclamées et paliers des bâtiments). */
  slots: PlayerSlots;
  /**
   * Places ouvertes de chaque bâtiment (départ + paliers remplis, + récompenses pour les
   * expéditions, les pensions et les couveuses).
   */
  facilities: Record<FacilityId, number>;
  /** Multiplicateurs permanents (1 = aucun bonus). */
  bonuses: PlayerBonuses;
}

export const claimRewardInputSchema = z.object({
  kind: z.enum(['collection', 'completion']),
  rewardId: slugSchema,
  /** Complétion d'expédition : l'expédition ou la région complétée. */
  targetId: slugSchema.optional(),
});
export type ClaimRewardInput = z.infer<typeof claimRewardInputSchema>;

export interface ClaimRewardResponse {
  kind: RewardKind;
  rewardId: string;
  targetId?: string;
  rewards: ProgressReward;
  /** Solde après la récompense. */
  currency: number;
  slots: PlayerSlots;
}

// --- Fiche Dresseur -----------------------------------------------------------------------

/** Statistiques cumulées du joueur (calculées à partir de son historique). */
export interface TrainerCardResponse {
  /** Pokémon capturés en expédition (transférés compris). */
  captures: number;
  /** Pokémon actuellement possédés, dont chromatiques. */
  pokemonOwned: number;
  shiniesOwned: number;
  /** Pokémon chromatiques rencontrés en expédition mais pas capturés. */
  shiniesMissed: number;
  expeditionsCompleted: number;
  battlesWon: number;
  battlesLost: number;
  /** Dresseurs différents battus au moins une fois. */
  trainersDefeated: number;
  eggsHatched: number;
  fossilsRevived: number;
  questsCompleted: number;
  /** Poké Dollars dépensés en boutique. */
  moneySpent: number;
  /** Donjons réussis au total (toutes victoires confondues). */
  dungeonsCleared: number;
  /** Méga-Gemmes différentes possédées (sac ou tenues par un Pokémon). */
  megaStonesOwned: number;
  /** Pokémon mis en avant, dans l'ordre choisi (les Pokémon transférés en sont retirés). */
  featured: FeaturedPokemonDto[];
  /** Guilde du dresseur. */
  guild: { id: string; name: string } | null;
}

export const FEATURED_POKEMON_MAX = 6;

export const featuredPokemonInputSchema = z.object({
  pokemonIds: z
    .array(z.uuid())
    .max(FEATURED_POKEMON_MAX)
    .refine((ids) => new Set(ids).size === ids.length, 'Pokémon en double'),
});
export type FeaturedPokemonInput = z.infer<typeof featuredPokemonInputSchema>;

/** Pokémon du PC mis en avant sur la Fiche Dresseur (visible des autres joueurs). */
export interface FeaturedPokemonDto {
  id: string;
  speciesId: number;
  formId: number | null;
  level: number;
  isShiny: boolean;
  gender: Gender;
  nature: string;
  ability: string;
  ivs: Stats;
  caughtAt: string;
}

/** Résultat de la recherche d'un dresseur par son nom. */
export interface TrainerSearchResultDto {
  trainerName: string;
  starterSpeciesId: number | null;
}

export const trainerSearchQuerySchema = z.object({ q: z.string().trim().min(1).max(16) });

/** Fiche Dresseur d'un joueur (la sienne ou celle d'un autre). */
export interface TrainerProfileResponse {
  trainerName: string;
  starterSpeciesId: number | null;
  createdAt: string;
  currency: number;
  isMe: boolean;
  /** Avancement, pour les badges et les régions débloquées. */
  progress: {
    caughtSpeciesIds: number[];
    caughtShinySpeciesIds: number[];
    defeatedTrainerIds: string[];
    eggsHatched: number;
    /** Étapes validées de chaque quête commencée. */
    questSteps: Record<string, number>;
  };
  card: TrainerCardResponse;
}

/** Pokédex d'un autre joueur (lecture seule). */
export interface TrainerPokedexResponse {
  entries: PokedexEntryDto[];
  forms: PokedexFormEntryDto[];
}

// --- Classement ---------------------------------------------------------------------------

/** Classements entre joueurs : espèces capturées, argent, badges, espèces chromatiques. */
export const leaderboardKindSchema = z.enum(['species', 'money', 'badges', 'shiny']);
export type LeaderboardKind = z.infer<typeof leaderboardKindSchema>;

export interface LeaderboardEntryDto {
  /** Rang (ex æquo : même rang, le suivant saute d'autant). */
  rank: number;
  trainerName: string;
  starterSpeciesId: number | null;
  value: number;
  isMe: boolean;
}

export interface LeaderboardResponse {
  kind: LeaderboardKind;
  /** Premiers du classement. */
  entries: LeaderboardEntryDto[];
  /** Place du joueur, même hors des premiers (null sans starter choisi). */
  me: LeaderboardEntryDto | null;
  /** Dresseurs classés. */
  total: number;
}

// --- Quêtes -------------------------------------------------------------------------------

/** Avancement d'une quête visible (débloquée ou commencée) ; les quêtes absentes sont verrouillées. */
export interface QuestProgressDto {
  questId: string;
  status: Exclude<QuestStatus, 'locked'>;
  /** Étapes validées (= index de l'étape en cours). */
  step: number;
  /** Compteur de l'étape en cours (captures, expéditions). */
  count: number;
  stepStartedAt: string;
  completedAt: string | null;
  claimedAt: string | null;
  /** Pokémon de la récompense déjà capturés en expédition légendaire. */
  pokemonCaught: number;
}

export interface QuestsResponse {
  quests: QuestProgressDto[];
}

export interface ClaimQuestResponse {
  questId: string;
  /** Les Pokémon de la récompense se capturent ensuite en expédition légendaire. */
  rewards: QuestReward;
  currency: number;
  slots: PlayerSlots;
}

// --- Objets utilisés sur un Pokémon (Capsules, Aromates, Pilule / Patch Talent) ---------

export const useItemInputSchema = z.object({
  itemId: slugSchema,
  /** Capsule d'Argent : statistique à monter à 31. */
  stat: z.enum(STAT_NAMES as [StatName, ...StatName[]]).optional(),
});
export type UseItemInput = z.infer<typeof useItemInputSchema>;

/** Méga-Évolution : Méga-Gemme du sac donnée à tenir au Pokémon. */
export const megaEvolveInputSchema = z.object({ itemId: slugSchema });
export type MegaEvolveInput = z.infer<typeof megaEvolveInputSchema>;

export interface UseItemResponse {
  pokemon: PokemonDto;
  itemId: string;
  /** Quantité restante dans le sac. */
  remaining: number;
}

// --- Transfert et Bonbons de lignée ---------------------------------------------------

/** Pokémon transférables par requête : au-delà, le client découpe en lots. */
export const TRANSFER_BATCH_MAX = 1000;
export const transferPokemonInputSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(TRANSFER_BATCH_MAX),
});
export type TransferPokemonInput = z.infer<typeof transferPokemonInputSchema>;

export interface CandyDto {
  /** Chaîne d'évolution PokéAPI. */
  lineageId: number;
  quantity: number;
}

export interface TransferPokemonResponse {
  transferred: number;
  /** Bonbons gagnés, par lignée. */
  gained: CandyDto[];
}

export const feedCandiesInputSchema = z.object({ count: z.int().min(1).max(10_000) });
export type FeedCandiesInput = z.infer<typeof feedCandiesInputSchema>;

// --- Pension et œufs ---------------------------------------------------------------------

export const depositDaycareInputSchema = z.object({
  parentAId: z.uuid(),
  parentBId: z.uuid(),
  heldItemAId: slugSchema.nullable(),
  heldItemBId: slugSchema.nullable(),
  /** Pension choisie ; par défaut, la première libre. */
  slotIndex: z.int().min(0).max(999).optional(),
});
export type DepositDaycareInput = z.infer<typeof depositDaycareInputSchema>;

export interface DaycareDto {
  slotIndex: number;
  parentAId: string | null;
  parentBId: string | null;
  heldItemAId: string | null;
  heldItemBId: string | null;
  /** Début du cycle de ponte en cours. */
  startedAt: string;
  /** Espèce des œufs pondus (null si un parent a disparu). */
  eggSpeciesId: number | null;
  /** Forme des œufs pondus (régionale, héritée de la mère). */
  eggFormId: number | null;
  /** Minutes entre deux œufs (talents des parents et de l'assistant compris). */
  eggMinutes: number;
}

/** Un œuf ne révèle rien de son contenu avant l'éclosion, à part l'espèce. */
export interface EggDto {
  id: string;
  speciesId: number;
  formId: number | null;
  /** Place de la couveuse. */
  slotIndex: number;
  laidAt: string;
  hatchAt: string;
}

export interface DaycareResponse {
  slots: number;
  maxEggs: number;
  /** Œufs éclos depuis le début (conditions de déblocage). */
  eggsHatched: number;
  serverTime: string;
  pensions: DaycareDto[];
  eggs: EggDto[];
}

export interface CollectEggsResponse {
  eggs: EggDto[];
  /** Œufs restés en attente dans la pension, faute de place dans la couveuse. */
  waiting: number;
}

export interface HatchEggsResponse {
  hatched: PokemonDto[];
  /** Espèces obtenues pour la première fois. */
  newSpeciesIds: number[];
  /** Formes (régionales, Méga…) obtenues pour la première fois. */
  newFormIds: number[];
}

export interface DaycareErrorBody {
  error: 'INCOMPATIBLE_PARENTS';
  errors: BreedingError[];
}

// --- Musée (fossiles) ---------------------------------------------------------------------

export const depositFossilInputSchema = z.object({ itemId: slugSchema });
export type DepositFossilInput = z.infer<typeof depositFossilInputSchema>;

/** Fossile en cours de restauration au Musée. */
export interface FossilRevivalDto {
  id: string;
  itemId: string;
  speciesId: number;
  formId: number | null;
  /** Place du Musée. */
  slotIndex: number;
  startedAt: string;
  readyAt: string;
}

export interface MuseumResponse {
  /** Fossiles restaurables en même temps. */
  slots: number;
  serverTime: string;
  revivals: FossilRevivalDto[];
}

export interface ReviveFossilsResponse {
  revived: PokemonDto[];
  /** Espèces obtenues pour la première fois. */
  newSpeciesIds: number[];
  /** Formes (régionales, Méga…) obtenues pour la première fois. */
  newFormIds: number[];
}

// --- Ferme à baies -----------------------------------------------------------------

export const plantBerryInputSchema = z.object({
  plotIndex: z.int().min(0).max(999),
  itemId: slugSchema,
});
export type PlantBerryInput = z.infer<typeof plantBerryInputSchema>;

/** Baie plantée dans une parcelle du champ. */
export interface BerryPlotDto {
  plotIndex: number;
  itemId: string;
  plantedAt: string;
  /** Durée totale de pousse, en millisecondes, à la vitesse actuelle du champ (talent de l'arroseur). */
  growMs: number;
  /** Pousse restante quand elle est en pause (`readyAt` null), en millisecondes. */
  remainingMs: number;
  /** Maturité prévue tant que le champ est arrosé ; null = pousse en pause (pas d'assistant Eau). */
  readyAt: string | null;
}

export interface FarmResponse {
  /** Parcelles du champ. */
  plots: number;
  serverTime: string;
  planted: BerryPlotDto[];
}

export interface HarvestBerriesResponse {
  /** Baies récoltées, par objet (bonus de l'assistant de récolte compris). */
  harvested: { itemId: string; quantity: number }[];
}

// --- Expéditions --------------------------------------------------------------------

export const captureFilterSchema = z.object({
  speciesIds: z.array(z.int().positive()).max(100),
  minPerfectIvs: z.int().min(0).max(STAT_NAMES.length),
  shiny: z.enum(['any', 'always', 'only']),
  newOnly: z.boolean().optional(),
});

export const startExpeditionInputSchema = z.object({
  zoneId: slugSchema,
  durationMinutes: z.int().positive(),
  team: z.array(z.uuid()).min(1).max(6),
  ballItemId: slugSchema.nullable(),
  /** Nombre de Balls à emporter (absent : une par rencontre, dans la limite du stock). */
  ballCount: z.int().positive().optional(),
  berryItemId: slugSchema.nullable(),
  /** Pokémon à tenter de capturer ; absent ou null = tous. */
  captureFilter: captureFilterSchema.nullable().optional(),
  /** Heure locale du joueur (talents de jour ou de nuit). */
  utcOffsetMinutes: utcOffsetSchema.optional(),
});
export type StartExpeditionInput = z.infer<typeof startExpeditionInputSchema>;

/** Expédition légendaire d'une quête réclamée : l'équipe seulement, la Ball se choisit au retour. */
export const startQuestExpeditionInputSchema = z.object({
  team: z.array(z.uuid()).min(1).max(6),
  utcOffsetMinutes: utcOffsetSchema.optional(),
});
export type StartQuestExpeditionInput = z.infer<typeof startQuestExpeditionInputSchema>;

/**
 * Décision au retour d'une expédition légendaire : une Ball (et une baie) à lancer, ou la fuite
 * (`ballItemId` null). Ignorée pour une expédition normale.
 */
export const claimExpeditionInputSchema = z.object({
  ballItemId: slugSchema.nullable(),
  berryItemId: slugSchema.nullable(),
});
export type ClaimExpeditionInput = z.infer<typeof claimExpeditionInputSchema>;

/** Légendaire rencontré au retour, avant de lancer la Ball ou de fuir. */
export interface LegendaryEncounterDto {
  expeditionId: string;
  questId: string;
  speciesId: number;
  formId: number | null;
  level: number;
  gender: PokemonDto['gender'];
  isShiny: boolean;
  shinyChance: number;
  /** Maillon de la chaîne de la quête au départ. */
  shinyChain: number;
}

/** Résultat stocké : chaque Pokémon capturé reçoit son identifiant en base. */
export interface StoredExpeditionResult extends ExpeditionResult {
  encounters: (ExpeditionResult['encounters'][number] & { pokemonId?: string })[];
  /** Espèces capturées pour la première fois. */
  newSpeciesIds: number[];
  /** Formes capturées pour la première fois (absent des expéditions anciennes). */
  newFormIds?: number[];
}

export interface ExpeditionDto {
  id: string;
  /** Zone explorée ; null pour une expédition légendaire. */
  zoneId: string | null;
  /** Expédition légendaire de cette quête ; null = expédition normale. */
  questId: string | null;
  slotIndex: number;
  team: string[];
  durationMinutes: number;
  ballItemId: string | null;
  balls: number;
  berryItemId: string | null;
  berries: number;
  captureFilter: CaptureFilter | null;
  contentVersionId: number;
  startedAt: string;
  endsAt: string;
  claimedAt: string | null;
  /** Maillon de la chaîne de zone au départ (bonus shiny). */
  shinyChain: number;
  /** Heure locale du joueur au départ (talents de jour ou de nuit) ; null = inconnue. */
  localHour: number | null;
  /** Quêtes des fuyards présents dans la zone au départ (à croiser pendant l'expédition). */
  roamerQuestIds: string[];
  result: StoredExpeditionResult | null;
}

/** Pokémon fuyard en fuite et la zone où il se cache jusqu'à l'heure pleine suivante. */
export interface RoamerDto {
  questId: string;
  speciesId: number;
  formId: number | null;
  zoneId: string;
  /** Chances (%) que chaque rencontre de la zone soit lui. */
  encounterChance: number;
  movesAt: string;
}

/** Chaîne de zone en cours : maillon qu'aurait une expédition lancée maintenant. */
export interface ShinyChainDto {
  zoneId: string;
  chain: number;
  /** Date où la chaîne retombe à 0 faute de relance ; null si une expédition est en cours. */
  expiresAt: string | null;
}

export interface ExpeditionsResponse {
  slots: number;
  /** Heure du serveur, pour caler les comptes à rebours du client. */
  serverTime: string;
  active: ExpeditionDto[];
  /** Chaînes de zone actives (les zones absentes repartent de 0). */
  chains: ShinyChainDto[];
  /** Chaînes des expéditions légendaires, par quête (relancer pour viser un shiny). */
  questChains: QuestChainDto[];
  /** Zones mises en favori, dans l'ordre où elles ont été ajoutées. */
  favoriteZoneIds: string[];
  /** Pokémon fuyards en fuite et leur zone actuelle. */
  roamers: RoamerDto[];
}

/** Chaîne d'une expédition légendaire : comme une chaîne de zone, propre à la quête. */
export interface QuestChainDto {
  questId: string;
  chain: number;
  expiresAt: string | null;
}

export const favoriteZoneInputSchema = z.object({ favorite: z.boolean() });
export type FavoriteZoneInput = z.infer<typeof favoriteZoneInputSchema>;

export interface ClaimExpeditionResponse {
  expedition: ExpeditionDto;
  captured: PokemonDto[];
}

export interface ExpeditionTeamErrorBody {
  error: 'TEAM_INVALID';
  errors: ExpeditionError[];
}

// --- Combats de dresseurs ------------------------------------------------------------

/** Attaque choisie pour un Pokémon (combats de dresseurs et donjons). */
export const dungeonMoveSchema = z.object({
  type: z.string().min(1).max(32),
  category: z.enum(MOVE_CATEGORIES),
});

/** Équipe dans l'ordre (le premier entre en combat), avec l'attaque de chacun. */
export const startBattleInputSchema = z
  .object({
    trainerId: slugSchema,
    team: z.array(z.uuid()).min(1).max(6),
    moves: z.array(dungeonMoveSchema).min(1).max(6),
    /** Heure locale du joueur (talents de jour ou de nuit). */
    utcOffsetMinutes: utcOffsetSchema.optional(),
  })
  .refine((i) => i.moves.length === i.team.length, {
    message: 'Une attaque par Pokémon',
    path: ['moves'],
  });
export type StartBattleInput = z.infer<typeof startBattleInputSchema>;

export interface StoredBattleResult extends BattleResult {
  /** Badge obtenu lors de ce combat (première victoire). */
  badgeEarned: boolean;
}

/** Combat de dresseur en temps réel (même déroulé qu'une tentative de donjon). */
export interface BattleDto {
  id: string;
  trainerId: string;
  team: string[];
  setup: DungeonSetup;
  commands: DungeonCommand[];
  fledAtMs: number | null;
  contentVersionId: number;
  startedAt: string;
  endsAt: string;
  claimedAt: string | null;
  /** Le joueur a fermé la fenêtre du résultat (sur n'importe quel appareil). */
  resultSeenAt: string | null;
  outcome: DungeonOutcome | null;
  result: StoredBattleResult | null;
}

/** Bilan du joueur contre un dresseur. */
export interface TrainerRecordDto {
  trainerId: string;
  wins: number;
  losses: number;
  firstWinAt: string | null;
  lastWinAt: string | null;
  /** Fin du dernier combat (début du temps de recharge d'un dresseur répétable). */
  lastEndedAt: string | null;
}

export interface BattlesResponse {
  serverTime: string;
  /** Combat en cours (ou terminé, pas encore réclamé). */
  active: BattleDto | null;
  /** Dernier combat réclamé (résultat à montrer s'il n'a pas été vu). */
  last: BattleDto | null;
  records: TrainerRecordDto[];
}

export interface ClaimBattleResponse {
  battle: BattleDto;
  /** Poké Dollars après le combat. */
  currency: number;
}

export interface BattleTeamErrorBody {
  error: 'TEAM_INVALID';
  errors: BattleError[];
}

// --- Donjons ----------------------------------------------------------------------------

/** Équipe dans l'ordre (le premier entre en combat), avec l'attaque de chacun. */
export const startDungeonInputSchema = z
  .object({
    dungeonId: slugSchema,
    team: z.array(z.uuid()).min(1).max(6),
    moves: z.array(dungeonMoveSchema).min(1).max(6),
    utcOffsetMinutes: utcOffsetSchema.optional(),
  })
  .refine((i) => i.moves.length === i.team.length, {
    message: 'Une attaque par Pokémon',
    path: ['moves'],
  });
export type StartDungeonInput = z.infer<typeof startDungeonInputSchema>;

/** Envoi d'un Pokémon au combat, `atMs` après le départ (horloge du joueur, recalée par le serveur). */
export const switchDungeonInputSchema = z.object({
  member: z.int().min(0).max(5),
  atMs: z.int().min(0),
});
export type SwitchDungeonInput = z.infer<typeof switchDungeonInputSchema>;

/** Objet de soin (Baie Sitrus) donné au Pokémon actif, `atMs` après le départ. */
export const combatItemInputSchema = z.object({ itemId: slugSchema, atMs: z.int().min(0) });
export type CombatItemInput = z.infer<typeof combatItemInputSchema>;

export type StoredDungeonResult = DungeonResult;

export interface DungeonRunDto {
  id: string;
  dungeonId: string;
  team: string[];
  setup: DungeonSetup;
  commands: DungeonCommand[];
  fledAtMs: number | null;
  contentVersionId: number;
  startedAt: string;
  endsAt: string;
  claimedAt: string | null;
  /** Le joueur a fermé la fenêtre du résultat (sur n'importe quel appareil). */
  resultSeenAt: string | null;
  outcome: DungeonOutcome | null;
  result: StoredDungeonResult | null;
}

/** Bilan du joueur dans un donjon. */
export interface DungeonRecordDto {
  dungeonId: string;
  wins: number;
  losses: number;
  gems: number;
  firstWinAt: string | null;
  lastEndedAt: string | null;
}

export interface DungeonsResponse {
  serverTime: string;
  /** Tentative en cours (ou terminée, pas encore réclamée). */
  active: DungeonRunDto | null;
  /** Dernière tentative réclamée (résultat à montrer s'il n'a pas été vu). */
  last: DungeonRunDto | null;
  records: DungeonRecordDto[];
}

export interface ClaimDungeonResponse {
  run: DungeonRunDto;
  /** Poké Dollars après la tentative. */
  currency: number;
}

export interface DungeonTeamErrorBody {
  error: 'TEAM_INVALID';
  errors: DungeonTeamError[];
}

// --- Boutique --------------------------------------------------------------------------

/** État d'un article visible par le joueur (les articles cachés ne sont pas renvoyés). */
export interface ShopEntryStatusDto {
  entryId: string;
  state: Exclude<ShopEntryState, 'hidden'>;
  /** Prix du prochain lot (il augmente à chaque achat d'une parcelle de ferme). */
  price: number;
  /** Lots achetables d'un coup : un seul quand le prix augmente à chaque achat. */
  maxLotsPerPurchase: number;
  /** Lots encore achetables ; null = illimité. */
  remainingLots: number | null;
  /** Limite par période : date où des lots se libèrent. */
  nextLotsAt: string | null;
  /** Débloqué mais pas encore vu (badge « Nouveau ! »). */
  isNew: boolean;
}

export interface ShopResponse {
  serverTime: string;
  currency: number;
  /** Articles visibles, triés par catégorie puis par ordre. */
  entries: ShopEntryStatusDto[];
}

export const purchaseInputSchema = z.object({
  entryId: slugSchema,
  lots: z.int().min(1).max(MAX_LOTS_PER_PURCHASE),
});
export type PurchaseInput = z.infer<typeof purchaseInputSchema>;

export interface PurchaseResponse {
  entryId: string;
  itemId: string;
  lots: number;
  /** Objets reçus (lots × taille du lot). */
  quantity: number;
  totalPrice: number;
  /** Objets offerts avec l'achat (ex. Honor Balls) ; null = aucun. */
  gift: { itemId: string; quantity: number } | null;
  /** Solde après l'achat. */
  currency: number;
  /** Quantité de l'objet dans le sac après l'achat. */
  inventoryQuantity: number;
  /** Parcelle de ferme (rien n'entre dans le sac) : parcelles de la ferme après l'achat ; null sinon. */
  farmPlots: number | null;
}

export const sellInputSchema = z.object({
  itemId: slugSchema,
  quantity: z.int().min(1).max(1_000_000),
});
export type SellInput = z.infer<typeof sellInputSchema>;

export interface SellResponse {
  itemId: string;
  quantity: number;
  totalPrice: number;
  /** Solde après la vente. */
  currency: number;
  /** Quantité de l'objet restant dans le sac. */
  inventoryQuantity: number;
}

export const markShopSeenInputSchema = z.object({
  entryIds: z.array(slugSchema).min(1).max(500),
});

/** Contenu publié exposé au jeu. */
export type PublicContentDto = GameContent;

export interface MeResponse {
  user: { id: string; email: string; name: string; role: UserRole };
  profile: PlayerProfileDto | null;
}

// Bêta : profils secondaires (nouvelle partie sans nouveau compte), à retirer après la bêta.
export const selectBetaProfileInputSchema = z.object({
  /** `null` : retour au profil principal. */
  profileId: z.string().min(1).nullable(),
});

export interface BetaProfilesResponse {
  activeProfileId: string;
  maxSecondary: number;
  profiles: { id: string; trainerName: string; main: boolean; starterChosen: boolean }[];
}

// --- Contenu versionné (admin) --------------------------------------------------

export const contentVersionStatusSchema = z.enum(['draft', 'published', 'archived']);
export type ContentVersionStatus = z.infer<typeof contentVersionStatusSchema>;

export interface ContentVersionDetailDto {
  version: ContentVersionDto;
  content: GameContent;
  issues: ContentIssue[];
}

export const importContentInputSchema = z.object({
  label: z.string().trim().min(1).max(120),
  content: z.unknown(),
});

export interface ContentVersionDto {
  id: number;
  status: ContentVersionStatus;
  label: string;
  basedOnId: number | null;
  createdBy: string | null;
  createdAt: string;
  publishedAt: string | null;
}

export const createDraftInputSchema = z.object({
  label: z.string().trim().min(1).max(120),
  /** Version de départ ; par défaut, la version publiée. Permet le retour arrière. */
  basedOnId: z.int().positive().optional(),
});
export type CreateDraftInput = z.infer<typeof createDraftInputSchema>;

// --- Journal d'administration ------------------------------------------------------

export interface AuditLogEntryDto {
  id: number;
  adminId: string | null;
  adminEmail: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  at: string;
}

export interface Paginated<T> {
  items: T[];
  nextCursor: number | null;
}

// --- Télémétrie (équilibrage) ---------------------------------------------------------------

export const telemetryQuerySchema = z.object({
  /** Période d'observation des combats, expéditions et achats. */
  days: z.coerce.number().int().min(1).max(365).default(30),
});

/** Répartition d'une durée (en heures) sur les joueurs concernés. */
export interface DurationStats {
  players: number;
  medianHours: number | null;
  p90Hours: number | null;
}

export type TelemetryStepKind =
  'expedition' | 'region' | 'trainer' | 'dungeon' | 'reward' | 'quest';

/** Étape de progression : combien de joueurs l'ont atteinte, en combien de temps (inscription). */
export interface TelemetryStep extends DurationStats {
  kind: TelemetryStepKind;
  id: string;
  label: string;
  /** Part des joueurs (ayant choisi leur starter) qui l'ont atteinte. */
  reachedPercent: number;
}

export interface TelemetryTrainer {
  trainerId: string;
  label: string;
  /** Combats récupérés sur la période, par issue. */
  battles: number;
  wins: number;
  /** Défaites et temps écoulés. */
  losses: number;
  fled: number;
  /** Joueurs qui ont perdu sans jamais gagner (goulet potentiel). */
  stuckPlayers: number;
}

export interface TelemetryZone {
  zoneId: string;
  label: string;
  expeditions: number;
  players: number;
  avgDurationMinutes: number | null;
  encounters: number;
  captures: number;
}

export interface TelemetryDungeon {
  dungeonId: string;
  label: string;
  /** Nom du niveau de difficulté (réglages d'équilibrage). */
  difficulty: string;
  /** Tentatives récupérées sur la période, par issue. */
  runs: number;
  players: number;
  wins: number;
  /** Défaites et temps écoulés. */
  losses: number;
  fled: number;
  /** Méga-Gemmes obtenues sur la période. */
  gems: number;
  /** Joueurs qui ont échoué sans jamais gagner (goulet potentiel). */
  stuckPlayers: number;
}

/** Possession d'une Méga-Gemme : dans les sacs et tenue par un Pokémon (Méga-Évolué). */
export interface TelemetryMegaStone {
  itemId: string;
  label: string;
  /** Joueurs qui en possèdent au moins une (sac ou tenue). */
  owners: number;
  inBags: number;
  held: number;
  /** Total obtenu dans les donjons depuis le lancement. */
  dropped: number;
}

export interface TelemetryQuest {
  questId: string;
  label: string;
  started: number;
  completed: number;
  /** Joueurs actuellement bloqués à chaque étape, et depuis combien de temps. */
  steps: (DurationStats & { index: number; name: string })[];
}

export interface TelemetryResponse {
  generatedAt: string;
  days: number;
  players: {
    total: number;
    withStarter: number;
    new7d: number;
    /** Joueurs ayant lancé une action (expédition, combat, donjon, achat) récemment. */
    active1d: number;
    active7d: number;
  };
  /** Parcours : étapes dans l'ordre du contenu. */
  steps: TelemetryStep[];
  trainers: TelemetryTrainer[];
  zones: TelemetryZone[];
  dungeons: TelemetryDungeon[];
  megaStones: TelemetryMegaStone[];
  quests: TelemetryQuest[];
  /** Joueurs par tranche de Pokédex national capturé (en %). */
  dexDistribution: { label: string; players: number }[];
  economy: {
    /** Poké Dollars gagnés en combat (dresseurs et donjons) sur la période. */
    earned: number;
    /** Poké Dollars dépensés en boutique sur la période. */
    spent: number;
    medianBalance: number | null;
  };
}

// --- Joueurs (administration) -------------------------------------------------------------

/** Présence : connecté si vu il y a moins de 3 minutes (le jeu envoie un signal par minute). */
export const ONLINE_WINDOW_MS = 3 * 60_000;
/** Actif : vu au cours des 7 derniers jours. */
export const ACTIVE_WINDOW_MS = 7 * 24 * 3_600_000;

/** Pokémon d'une espèce chez les joueurs (toutes formes confondues). */
export interface AdminSpeciesStatsDto {
  speciesId: number;
  /** Obtenus dans cette espèce depuis le début (captures, starters, œufs… ; transférés compris). */
  captured: number;
  /** Dont shiny. */
  capturedShiny: number;
  /** Actuellement dans les PC, dans leur espèce actuelle (hors transférés). */
  owned: number;
  /** Transférés depuis le début, dans leur espèce au moment du transfert. */
  transferred: number;
  /** Joueurs qui l'ont déjà capturé (Pokédex). */
  trainers: number;
}

export interface AdminPlayerDto {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  /** Null tant que le joueur n'a pas créé son profil de dresseur. */
  trainerName: string | null;
  starterSpeciesId: number | null;
  /** Date d'inscription. */
  createdAt: string;
  /** Dernière requête authentifiée connue (null : jamais vu depuis le suivi de présence). */
  lastSeenAt: string | null;
}

export interface AdminPlayerRegionBadges {
  regionId: string;
  regionName: string;
  badges: {
    trainerId: string;
    trainerName: string;
    name: string;
    image: string | null;
    earned: boolean;
  }[];
}

/** Fiche dresseur d'un joueur, vue depuis l'administration. */
export interface AdminPlayerDetailResponse {
  player: AdminPlayerDto;
  profile: PlayerProfileDto | null;
  /** Statistiques et badges : absents tant que le profil n'existe pas. */
  card: TrainerCardResponse | null;
  speciesCaught: number;
  shinySpeciesCaught: number;
  badges: AdminPlayerRegionBadges[];
}

/**
 * Lot de Pokémon de test (comptes administrateurs seulement) : les lignées des donjons de la
 * région et les plus forts Pokémon de chaque type de son Pokédex régional.
 */
export const adminTestPokemonInputSchema = z.object({
  regionId: slugSchema,
  level: z.int().min(1).max(100),
  /** 6 IV à 31 ; sinon tirés au hasard. */
  perfectIvs: z.boolean(),
  /** Ajoute les légendaires et fabuleux du Pokédex régional. */
  legendaries: z.boolean(),
});
export type AdminTestPokemonInput = z.infer<typeof adminTestPokemonInputSchema>;

export interface AdminTestPokemonResponse {
  added: number;
  speciesIds: number[];
}

/** Lot d'objets de test (comptes administrateurs seulement) : chaque objet du contenu publié. */
export const adminTestItemsInputSchema = z.object({ quantity: z.int().min(1).max(999) });
export type AdminTestItemsInput = z.infer<typeof adminTestItemsInputSchema>;

export interface AdminTestItemsResponse {
  /** Objets différents ajoutés au sac. */
  items: number;
  quantity: number;
}

/** Tous les dresseurs marqués battus (comptes administrateurs seulement). */
export interface AdminTestTrainersResponse {
  /** Dresseurs battus pour la première fois. */
  defeated: number;
  total: number;
}

/** Toutes les quêtes terminées, récompenses à réclamer (comptes administrateurs seulement). */
export interface AdminTestQuestsResponse {
  /** Quêtes terminées par l'action. */
  completed: number;
  total: number;
}

/** Remise à zéro des quêtes de guilde en cours (toutes guildes). */
export interface AdminGuildQuestsResetResponse {
  /** Quêtes du jour et de la semaine effacées. */
  quests: number;
}

/** Suppression du lot de test : les Pokémon occupés (expédition, donjon…) sont gardés. */
export interface AdminTestPokemonDeleteResponse {
  deleted: number;
  busy: number;
}

// --- Notifications push (PWA) -------------------------------------------------------------

/** Types de notifications push, activables séparément (réglages du joueur). */
export const notificationSettingsSchema = z.object({
  /** Expédition terminée, prête à être récupérée. */
  expeditions: z.boolean(),
  /** Œuf prêt à éclore. */
  eggs: z.boolean(),
  /** Fossile restauré au Musée (absent des réglages enregistrés avant le Musée). */
  fossils: z.boolean().default(true),
});
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  expeditions: true,
  eggs: true,
  fossils: true,
};

/** Abonnement Web Push du navigateur (`PushSubscription.toJSON()`). */
export const pushSubscriptionInputSchema = z.object({
  endpoint: z.url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInputSchema>;

export const pushUnsubscribeInputSchema = z.object({ endpoint: z.url().max(2000) });

export interface PushConfigResponse {
  /** Clé publique VAPID ; null = notifications push désactivées sur le serveur. */
  publicKey: string | null;
  settings: NotificationSettings;
  /** Appareils abonnés pour ce joueur. */
  subscriptions: number;
}

/** Contenu d'une notification, lu par le service worker. */
export interface PushPayload {
  title: string;
  body: string;
  /** Page à ouvrir au clic (onglet du jeu). */
  url: string;
  /** Une nouvelle notification remplace la précédente de même tag. */
  tag: string;
}

// --- Recherche --------------------------------------------------------------------------

/** Texte sans accents ni majuscules, pour les recherches (« evoli » trouve « Évoli »). */
export const searchKey = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

// --- Guildes ---------------------------------------------------------------------------

export type { GuildJoinMode, GuildRole };

export const guildNameSchema = z
  .string()
  .trim()
  .min(GUILD_NAME_MIN, `Au moins ${GUILD_NAME_MIN} caractères`)
  .max(GUILD_NAME_MAX, `Au plus ${GUILD_NAME_MAX} caractères`)
  .regex(/^[\p{L}\p{N} '’_-]+$/u, 'Lettres, chiffres, espaces, apostrophes, - et _ uniquement');

const guildJoinModeSchema = z.enum(['open', 'request']);
const guildDescriptionSchema = z.string().trim().max(GUILD_DESCRIPTION_MAX);

export const createGuildInputSchema = z.object({
  name: guildNameSchema,
  description: guildDescriptionSchema,
  joinMode: guildJoinModeSchema,
});
export type CreateGuildInput = z.infer<typeof createGuildInputSchema>;

export const updateGuildInputSchema = z.object({
  description: guildDescriptionSchema.optional(),
  joinMode: guildJoinModeSchema.optional(),
});
export type UpdateGuildInput = z.infer<typeof updateGuildInputSchema>;

export const guildRoleInputSchema = z.object({ role: z.enum(['leader', 'officer', 'member']) });
export type GuildRoleInput = z.infer<typeof guildRoleInputSchema>;

export const guildMessageInputSchema = z.object({
  body: z.string().trim().min(1).max(GUILD_MESSAGE_MAX),
});
export type GuildMessageInput = z.infer<typeof guildMessageInputSchema>;

/** Guilde dans les résultats de recherche. */
export interface GuildSummaryDto {
  id: string;
  name: string;
  description: string;
  joinMode: GuildJoinMode;
  memberCount: number;
  maxMembers: number;
  leaderName: string | null;
  /** Le joueur a déjà demandé à la rejoindre. */
  requested: boolean;
}

export interface GuildMemberDto {
  trainerName: string;
  role: GuildRole;
  joinedAt: string;
  isMe: boolean;
  /** Vu il y a moins de `ONLINE_WINDOW_MS` (le jeu ouvert envoie un signal par minute). */
  online: boolean;
}

export interface GuildQuestDto {
  period: GuildQuestPeriod;
  slot: number;
  name: string;
  description: string;
  difficulty: GuildQuestDifficulty;
  /** Coffre gagné. */
  rarity: ChestRarity;
  objective: GuildObjective;
  target: number;
  progress: number;
  completedAt: string | null;
  myContribution: number;
  contributors: number;
}

export interface GuildDto {
  id: string;
  name: string;
  description: string;
  joinMode: GuildJoinMode;
  createdAt: string;
  maxMembers: number;
  myRole: GuildRole;
  /** Chef, officiers puis membres, par ancienneté. */
  members: GuildMemberDto[];
  /** Candidatures en attente (chef et officiers seulement). */
  requests: { trainerName: string; createdAt: string }[];
  day: { id: string; endsAt: string };
  week: { id: string; endsAt: string };
  /** Quêtes du jour puis de la semaine. */
  quests: GuildQuestDto[];
}

export interface GuildStateResponse {
  serverTime: string;
  currency: number;
  guild: GuildDto | null;
  /** Départ récent : date à partir de laquelle le joueur peut rejoindre une guilde. */
  cooldownUntil: string | null;
  /** Candidatures en attente du joueur (sans guilde). */
  myRequests: GuildSummaryDto[];
}

export interface GuildSearchResponse {
  guilds: GuildSummaryDto[];
}

/** Fiche publique d'une guilde (depuis la fiche d'un dresseur ou le classement). */
export interface GuildProfileResponse extends GuildSummaryDto {
  createdAt: string;
  /** Quêtes de guilde terminées depuis sa création. */
  questsCompleted: number;
  /** Chef, officiers puis membres, par ancienneté. */
  members: { trainerName: string; role: GuildRole; starterSpeciesId: number | null }[];
  /** Le joueur en fait partie. */
  isMine: boolean;
}

/** Classement des guildes : quêtes de guilde terminées depuis leur création. */
export interface GuildLeaderboardEntryDto {
  rank: number;
  id: string;
  name: string;
  memberCount: number;
  questsCompleted: number;
  isMine: boolean;
}

export interface GuildLeaderboardResponse {
  /** Premières guildes du classement. */
  entries: GuildLeaderboardEntryDto[];
  /** Place de la guilde du joueur, même hors des premières (null sans guilde). */
  me: GuildLeaderboardEntryDto | null;
  /** Guildes classées. */
  total: number;
}

export interface GuildMessageDto {
  id: string;
  /** null = message du jeu (quête terminée, arrivée d'un membre…). */
  trainerName: string | null;
  body: string;
  createdAt: string;
  mine: boolean;
}

export interface GuildMessagesResponse {
  messages: GuildMessageDto[];
}

export const openChestInputSchema = z.object({
  itemId: slugSchema,
  count: z.int().min(1).max(50),
});
export type OpenChestInput = z.infer<typeof openChestInputSchema>;

export interface OpenChestResponse {
  itemId: string;
  opened: number;
  loot: ItemStack[];
}
