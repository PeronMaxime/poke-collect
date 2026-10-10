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
  ExpeditionError,
  ExpeditionResult,
  Gender,
  PlayerBonuses,
  PlayerSlots,
  QuestStatus,
  RewardKind,
  ShopEntryState,
} from '@poke/game-core';
import { MAX_LOTS_PER_PURCHASE } from '@poke/game-core';

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

export type PokemonOrigin = 'starter' | 'capture' | 'egg' | 'quest' | 'fossil';

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
}

export type PokemonActivity = 'expedition' | 'battle' | 'daycare';

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

export interface PokedexEntryDto {
  speciesId: number;
  seen: boolean;
  caught: boolean;
  caughtShiny: boolean;
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
}

export interface QuestsResponse {
  quests: QuestProgressDto[];
}

export interface ClaimQuestResponse {
  questId: string;
  rewards: QuestReward;
  /** Pokémon offerts (légendaires…). */
  pokemon: PokemonDto[];
  /** Espèces obtenues pour la première fois. */
  newSpeciesIds: number[];
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

export interface UseItemResponse {
  pokemon: PokemonDto;
  itemId: string;
  /** Quantité restante dans le sac. */
  remaining: number;
}

// --- Transfert et Bonbons de lignée ---------------------------------------------------

export const transferPokemonInputSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(200),
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

/** Résultat stocké : chaque Pokémon capturé reçoit son identifiant en base. */
export interface StoredExpeditionResult extends ExpeditionResult {
  encounters: (ExpeditionResult['encounters'][number] & { pokemonId?: string })[];
  /** Espèces capturées pour la première fois. */
  newSpeciesIds: number[];
}

export interface ExpeditionDto {
  id: string;
  zoneId: string;
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
}

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

export type TelemetryStepKind = 'expedition' | 'region' | 'trainer' | 'reward' | 'quest';

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
    /** Joueurs ayant lancé une action (expédition, combat, achat) récemment. */
    active1d: number;
    active7d: number;
  };
  /** Parcours : étapes dans l'ordre du contenu. */
  steps: TelemetryStep[];
  trainers: TelemetryTrainer[];
  zones: TelemetryZone[];
  quests: TelemetryQuest[];
  /** Joueurs par tranche de Pokédex national capturé (en %). */
  dexDistribution: { label: string; players: number }[];
  economy: {
    /** Poké Dollars gagnés en combat sur la période. */
    earned: number;
    /** Poké Dollars dépensés en boutique sur la période. */
    spent: number;
    medianBalance: number | null;
  };
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
