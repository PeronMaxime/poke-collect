import { z } from 'zod';
import { slugSchema } from '@poke/content';
import type { ContentIssue, GameContent, ProgressReward } from '@poke/content';
import type { Stats } from '@poke/data';
import type {
  BattleError,
  BattleResult,
  BreedingError,
  ExpeditionError,
  ExpeditionResult,
  Gender,
  PlayerBonuses,
  PlayerSlots,
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
  currency: number;
  createdAt: string;
}

export const chooseStarterInputSchema = z.object({ speciesId: z.int().positive() });
export type ChooseStarterInput = z.infer<typeof chooseStarterInputSchema>;

// --- Pokémon, Pokédex, inventaire -------------------------------------------------

export type PokemonOrigin = 'starter' | 'capture' | 'egg' | 'quest';

export interface PokemonDto {
  id: string;
  speciesId: number;
  level: number;
  xp: number;
  ivs: Stats;
  nature: string;
  ability: string;
  isShiny: boolean;
  gender: Gender;
  happiness: number;
  origin: PokemonOrigin;
  originRegion: string | null;
  caughtAt: string;
  locked: boolean;
  /** Occupé (expédition, combat, pension) : indisponible pour une autre activité. */
  busy: boolean;
  activity: PokemonActivity | null;
  /** K.O. après une défaite : indisponible jusqu'à cette date (comparer à l'heure du serveur). */
  koUntil: string | null;
}

export type PokemonActivity = 'expedition' | 'battle' | 'daycare';

export const updatePokemonInputSchema = z.object({ locked: z.boolean() });

export interface PokedexEntryDto {
  speciesId: number;
  seen: boolean;
  caught: boolean;
  caughtShiny: boolean;
  firstCaughtAt: string | null;
}

export interface InventoryEntryDto {
  itemId: string;
  quantity: number;
}

// --- Évolutions -----------------------------------------------------------------------

export const evolveInputSchema = z.object({
  toSpeciesId: z.int().positive(),
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
}

/** Un œuf ne révèle rien de son contenu avant l'éclosion, à part l'espèce. */
export interface EggDto {
  id: string;
  speciesId: number;
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

// --- Expéditions --------------------------------------------------------------------

export const startExpeditionInputSchema = z.object({
  zoneId: slugSchema,
  durationMinutes: z.int().positive(),
  team: z.array(z.uuid()).min(1).max(6),
  ballItemId: slugSchema.nullable(),
  berryItemId: slugSchema.nullable(),
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
  contentVersionId: number;
  startedAt: string;
  endsAt: string;
  claimedAt: string | null;
  result: StoredExpeditionResult | null;
}

export interface ExpeditionsResponse {
  slots: number;
  /** Heure du serveur, pour caler les comptes à rebours du client. */
  serverTime: string;
  active: ExpeditionDto[];
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
