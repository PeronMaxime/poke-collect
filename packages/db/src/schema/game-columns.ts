import { text } from 'drizzle-orm/pg-core';
import { users } from './auth';

/**
 * Colonnes communes aux tables de l'état des joueurs.
 */

/** Propriétaire d'une ligne : le joueur, dont la suppression emporte tout son état. */
export const ownerId = () =>
  text('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });
