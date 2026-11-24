import { z } from 'zod';
import { guildDescriptionSchema, guildNameSchema } from './guilds';
import type { GuildJoinMode, GuildRole } from './guilds';
import { trainerNameSchema } from './profile';

/**
 * Modération (routes `/api/admin/moderation/*`) : suspension des comptes, renommage des dresseurs
 * et des guildes, lecture et nettoyage des discussions. Aussi la suspension vue par le joueur
 * (refus `ACCOUNT_SUSPENDED`).
 */

/** Longueur maximale du motif d'une suspension (montré au joueur). */
export const SUSPENSION_REASON_MAX = 300;

/** Suspension d'un compte : jusqu'à quand, et pourquoi (le motif est montré au joueur). */
export interface AccountSuspensionDto {
  /** Fin de la suspension (ISO) ; une suspension définitive porte une date de l'an 9999. */
  until: string;
  permanent: boolean;
  reason: string;
}

/**
 * Corps du refus `ACCOUNT_SUSPENDED` (403), renvoyé à toute requête de jeu d'un compte suspendu :
 * le jeu affiche l'écran de suspension avec la date de fin et le motif.
 */
export interface AccountSuspendedBody extends AccountSuspensionDto {
  error: 'ACCOUNT_SUSPENDED';
}

/** Suspendre un compte : durée en heures (null : définitive) et motif. */
export const suspendAccountInputSchema = z.object({
  hours: z
    .int()
    .min(1)
    .max(24 * 366)
    .nullable(),
  reason: z.string().trim().min(3, 'Au moins 3 caractères').max(SUSPENSION_REASON_MAX),
});

export type SuspendAccountInput = z.infer<typeof suspendAccountInputSchema>;

/** Renommer un dresseur (mêmes règles que le nom choisi par le joueur). */
export const renameTrainerInputSchema = z.object({ trainerName: trainerNameSchema });

export type RenameTrainerInput = z.infer<typeof renameTrainerInputSchema>;

/** Corriger le nom ou la description d'une guilde (au moins l'un des deux). */
export const moderateGuildInputSchema = z
  .object({ name: guildNameSchema.optional(), description: guildDescriptionSchema.optional() })
  .refine((v) => v.name !== undefined || v.description !== undefined, {
    message: 'Rien à modifier',
  });

export type ModerateGuildInput = z.infer<typeof moderateGuildInputSchema>;

/** Recherche de guildes dans la modération : vide, les plus récemment actives. */
export const moderationGuildQuerySchema = z.object({
  q: z.string().trim().max(24).default(''),
});

/** Guilde dans la liste de la modération. */
export interface ModerationGuildDto {
  id: string;
  name: string;
  description: string;
  joinMode: GuildJoinMode;
  memberCount: number;
  leaderName: string | null;
  createdAt: string;
  /** Dernier message de la discussion (ISO) ; null : aucun message conservé. */
  lastMessageAt: string | null;
}

/** Message de la discussion vu par la modération ; auteur null : message du jeu. */
export interface ModerationGuildMessageDto {
  id: string;
  userId: string | null;
  trainerName: string | null;
  body: string;
  createdAt: string;
}

/** Fiche d'une guilde dans la modération : membres et derniers messages (du plus récent). */
export interface ModerationGuildDetailResponse {
  guild: ModerationGuildDto;
  members: { userId: string; trainerName: string; role: GuildRole }[];
  messages: ModerationGuildMessageDto[];
}
