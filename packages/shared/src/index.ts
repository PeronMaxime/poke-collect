import { z } from 'zod';
import { slugSchema } from '@poke/content';
import type { ContentIssue, GameContent, ProgressReward, QuestReward } from '@poke/content';
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
  PlayerBonuses,
  PlayerSlots,
  QuestStatus,
  RewardKind,
  ShopEntryState,
} from '@poke/game-core';
import { MAX_LOTS_PER_PURCHASE, MOVE_CATEGORIES } from '@poke/game-core';

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
  /** K.O. après une défaite : indisponible jusqu'à cette date (comparer à l'heure du serveur). */
  koUntil: string | null;
  /** Étiquettes du joueur (identifiants de `PokemonTagDto`). */
  tagIds: string[];
  /** Attaque enregistrée pour les donjons ; null = choix par défaut. */
  dungeonMove: DungeonMove | null;
  /** Méga-Gemme tenue : le Pokémon est Méga-Évolué (`formId` = sa forme Méga). */
  megaStone: string | null;
}

export type PokemonActivity = 'expedition' | 'battle' | 'daycare' | 'dungeon';

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

export const evolveInputSchema = z.object({
  toSpeciesId: z.int().positive(),
  /** Forme d'arrivée (Raichu d'Alola) ; absente = première évolution vers l'espèce. */
  toFormId: z.int().positive().nullish(),
  /** Décalage de l'heure locale du joueur par rapport à UTC (évolutions de jour ou de nuit). */
  utcOffsetMinutes: z
    .int()
    .min(-14 * 60)
    .max(14 * 60),
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

// --- Progression : paliers du Pokédex et collections -----------------------------------

export interface RewardClaimDto {
  kind: RewardKind;
  rewardId: string;
  claimedAt: string;
}

export interface ProgressionResponse {
  claims: RewardClaimDto[];
  /** Emplacements débloqués (départ + récompenses réclamées). */
  slots: PlayerSlots;
  /** Multiplicateurs permanents (1 = aucun bonus). */
  bonuses: PlayerBonuses;
}

export const claimRewardInputSchema = z.object({
  kind: z.enum(['milestone', 'collection']),
  rewardId: slugSchema,
});
export type ClaimRewardInput = z.infer<typeof claimRewardInputSchema>;

export interface ClaimRewardResponse {
  kind: RewardKind;
  rewardId: string;
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
  /** Pilule / Patch Talent : talent visé (facultatif s'il n'y a qu'un choix). */
  ability: z.string().min(1).max(64).optional(),
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
}

/** Un œuf ne révèle rien de son contenu avant l'éclosion, à part l'espèce. */
export interface EggDto {
  id: string;
  speciesId: number;
  formId: number | null;
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
  /** Œufs perdus faute de place dans la couveuse. */
  lost: number;
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
});
export type StartExpeditionInput = z.infer<typeof startExpeditionInputSchema>;

/** Expédition légendaire d'une quête réclamée : l'équipe seulement, la Ball se choisit au retour. */
export const startQuestExpeditionInputSchema = z.object({
  team: z.array(z.uuid()).min(1).max(6),
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
  result: StoredExpeditionResult | null;
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

export const startBattleInputSchema = z.object({
  trainerId: slugSchema,
  team: z.array(z.uuid()).min(1).max(6),
});
export type StartBattleInput = z.infer<typeof startBattleInputSchema>;

export interface StoredBattleResult extends BattleResult {
  /** Badge obtenu lors de ce combat (première victoire). */
  badgeEarned: boolean;
  /** Fin du K.O. de l'équipe en cas de défaite. */
  koUntil: string | null;
}

export interface BattleDto {
  id: string;
  trainerId: string;
  slotIndex: number;
  team: string[];
  contentVersionId: number;
  startedAt: string;
  endsAt: string;
  claimedAt: string | null;
  outcome: 'win' | 'loss' | null;
  result: StoredBattleResult | null;
}

/** Bilan du joueur contre un dresseur. */
export interface TrainerRecordDto {
  trainerId: string;
  wins: number;
  losses: number;
  firstWinAt: string | null;
  lastWinAt: string | null;
}

export interface BattlesResponse {
  slots: number;
  serverTime: string;
  active: BattleDto[];
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

export const dungeonMoveSchema = z.object({
  type: z.string().min(1).max(32),
  category: z.enum(MOVE_CATEGORIES),
});

/** Équipe dans l'ordre (le premier entre en combat), avec l'attaque de chacun. */
export const startDungeonInputSchema = z
  .object({
    dungeonId: slugSchema,
    team: z.array(z.uuid()).min(1).max(6),
    moves: z.array(dungeonMoveSchema).min(1).max(6),
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

export interface StoredDungeonResult extends DungeonResult {
  /** Fin du K.O. des Pokémon mis K.O. (null : aucun). */
  koUntil: string | null;
}

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
  battles: number;
  wins: number;
  /** Probabilité de victoire moyenne estimée au lancement. */
  avgWinChance: number | null;
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
  /** Combat de dresseur terminé. */
  battles: z.boolean(),
  /** Œuf prêt à éclore. */
  eggs: z.boolean(),
  /** Fossile restauré au Musée (absent des réglages enregistrés avant le Musée). */
  fossils: z.boolean().default(true),
});
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  expeditions: true,
  battles: true,
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
