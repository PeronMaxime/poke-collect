import { z } from 'zod';
import { slugSchema } from '@poke/content';
import type {
  ChestRarity,
  GuildObjective,
  GuildQuestDifficulty,
  GuildQuestPeriod,
  ItemStack,
} from '@poke/content';
import type { GuildJoinMode, GuildRole } from '@poke/game-core';
import {
  GUILD_DESCRIPTION_MAX,
  GUILD_MESSAGE_MAX,
  GUILD_NAME_MAX,
  GUILD_NAME_MIN,
} from '@poke/game-core';
import type { FavoritePokemonDto } from './profile';

/**
 * Guildes : membres, quêtes, coffres, messages, classement.
 */

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
  /** Vu il y a moins de `ONLINE_WINDOW_MS` (les rechargements réguliers du jeu ouvert mettent la présence à jour). */
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
  members: { trainerName: string; role: GuildRole; favorite: FavoritePokemonDto | null }[];
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

/** Statistiques d'une route de l'API depuis le démarrage (section « Santé de l'API » de l'admin). */
export interface ApiRouteMetricsDto {
  /** Méthode et motif de la route, par exemple « GET /api/pokemon » (jamais l'adresse réelle). */
  route: string;
  count: number;
  /** Réponses 5xx. */
  errors: number;
  /** Réponses 429 (limite de requêtes). */
  limited: number;
  /** Requêtes plus longues que le seuil de lenteur. */
  slow: number;
  avgMs: number;
  /** Durée approchée (borne haute du palier) sous laquelle répondent 95 % des requêtes. */
  p95Ms: number;
  maxMs: number;
}

/** Une minute d'activité de l'API. */
export interface ApiMinuteMetricsDto {
  /** Début de la minute (ISO). */
  at: string;
  requests: number;
  errors: number;
  limited: number;
  slow: number;
  avgMs: number;
  maxMs: number;
}

/** Une erreur 5xx gardée en mémoire (section « Santé de l'API » de l'admin). */
export interface ApiErrorDto {
  /** Instant de l'erreur (ISO). */
  at: string;
  /** Méthode et motif de la route (jamais l'adresse réelle). */
  route: string;
  status: number;
  /** Nom de l'erreur (« Error », « PostgresError »…). */
  name: string;
  /** Code SQL éventuel (« 40P01 »…). */
  code: string | null;
  message: string;
  /** Début de la pile d'appels. */
  stack: string | null;
}

export interface ApiMetricsResponse {
  generatedAt: string;
  /** Démarrage du processus : les compteurs repartent de zéro à chaque redémarrage. */
  startedAt: string;
  slowThresholdMs: number;
  totals: { requests: number; errors: number; limited: number; slow: number };
  /** Routes triées de la plus lente (p95) à la plus rapide. */
  routes: ApiRouteMetricsDto[];
  /** Dernières minutes, de la plus ancienne à la plus récente. */
  minutes: ApiMinuteMetricsDto[];
  /** Dernières erreurs 5xx, de la plus récente à la plus ancienne (vidées au redémarrage). */
  recentErrors: ApiErrorDto[];
}
