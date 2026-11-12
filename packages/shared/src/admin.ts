import { z } from 'zod';
import { slugSchema } from '@poke/content';
import type { ContentIssue, GameContent } from '@poke/content';
import type { PlayerProfileDto, UserRole } from './profile';
import type { TrainerCardResponse } from './trainer-card';

/**
 * Administration : contenu versionné, journal des actions, fiche et outils de test d'un joueur.
 */

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
