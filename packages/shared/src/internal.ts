import { z } from 'zod';

/**
 * Schémas communs à plusieurs domaines, non exportés par le paquet.
 */

/** Décalage de l'heure locale du joueur par rapport à UTC, en minutes. */
export const utcOffsetSchema = z
  .int()
  .min(-14 * 60)
  .max(14 * 60);
