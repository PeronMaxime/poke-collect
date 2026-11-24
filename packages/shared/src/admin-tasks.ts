import { z } from 'zod';

/**
 * Tâches de suivi de l'admin (routes `/api/admin/tasks`) : ce que l'exploitant a encore à faire ou
 * à surveiller, au même endroit (page « À faire »).
 */

/** Une chose à faire, ou à surveiller de temps en temps (sans fin prévue). */
export const ADMIN_TASK_KINDS = ['todo', 'watch'] as const;
export type AdminTaskKind = (typeof ADMIN_TASK_KINDS)[number];

/** Longueurs maximales du titre et du détail d'une tâche. */
export const ADMIN_TASK_TITLE_MAX = 200;
export const ADMIN_TASK_DETAILS_MAX = 4000;

/** Une tâche de suivi. */
export interface AdminTaskDto {
  id: string;
  kind: AdminTaskKind;
  title: string;
  /** Texte libre (commandes, liens, contexte), affiché tel quel avec ses retours à la ligne. */
  details: string;
  /** Jour à partir duquel s'en occuper (AAAA-MM-JJ) ; null = dès que possible. */
  dueOn: string | null;
  /** Faite (ou close pour une surveillance) le… (ISO) ; null = en cours. */
  doneAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Champs d'une tâche, sans valeur par défaut (une modification ne touche que ceux donnés). */
const adminTaskFields = z.object({
  kind: z.enum(ADMIN_TASK_KINDS),
  title: z
    .string()
    .trim()
    .min(1, 'Titre obligatoire')
    .max(ADMIN_TASK_TITLE_MAX, `Au plus ${ADMIN_TASK_TITLE_MAX} caractères`),
  details: z
    .string()
    .trim()
    .max(ADMIN_TASK_DETAILS_MAX, `Au plus ${ADMIN_TASK_DETAILS_MAX} caractères`),
  dueOn: z.iso.date('Date invalide (AAAA-MM-JJ)').nullable(),
});

/** Nouvelle tâche : sans détail ni date par défaut. */
export const adminTaskInputSchema = adminTaskFields.extend({
  details: adminTaskFields.shape.details.default(''),
  dueOn: adminTaskFields.shape.dueOn.default(null),
});

export type AdminTaskInput = z.input<typeof adminTaskInputSchema>;

/** Modification d'une tâche : les champs donnés seulement ; `done` la coche ou la rouvre. */
export const adminTaskUpdateSchema = adminTaskFields
  .partial()
  .extend({ done: z.boolean().optional() })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Rien à modifier');

export type AdminTaskUpdate = z.input<typeof adminTaskUpdateSchema>;
