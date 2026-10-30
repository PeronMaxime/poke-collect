import { and, eq, gte, isNull } from 'drizzle-orm';
import { assistants, daycareSlots, fossilRevivals } from '@poke/db';
import type { AssistantPost } from '@poke/game-core';
import type { Db } from '@poke/db';
import type { ContentCache } from '../content-cache';
import { withdrawDaycare } from './daycare';
import { GameError } from './errors';
import { addItems, playerFacilityPlaces } from './store';

/**
 * Places de pension et du Musée au-delà de celles ouvertes (réglage baissé) : tout y est rendu au
 * joueur. Le couple et son assistant reviennent au PC, les objets tenus et les fossiles (même
 * restaurés) au sac. Fait à la lecture : le nombre de places dépend de l'avancement de chacun.
 */
export async function settleClosedPlaces(
  db: Db,
  content: ContentCache,
  userId: string,
  now: Date,
): Promise<void> {
  const ctx = await content.get();
  const [pensions, fossils, helpers] = await Promise.all([
    db
      .select({ slotIndex: daycareSlots.slotIndex })
      .from(daycareSlots)
      .where(eq(daycareSlots.ownerId, userId)),
    db
      .select({ slotIndex: fossilRevivals.slotIndex })
      .from(fossilRevivals)
      .where(and(eq(fossilRevivals.ownerId, userId), isNull(fossilRevivals.revivedAt))),
    db
      .select({ post: assistants.post, slotIndex: assistants.slotIndex })
      .from(assistants)
      .where(eq(assistants.ownerId, userId)),
  ]);

  const helperSlots = (post: AssistantPost) =>
    helpers.filter((h) => h.post === post).map((h) => h.slotIndex);
  const daycareTaken = [...pensions.map((p) => p.slotIndex), ...helperSlots('daycare')];
  if (daycareTaken.length > 0) {
    const places = await playerFacilityPlaces(db, ctx, userId, 'daycare');
    for (const { slotIndex } of pensions.filter((p) => p.slotIndex >= places)) {
      // Déjà retiré par une requête parallèle : rien à rendre.
      await withdrawDaycare(db, content, userId, slotIndex, now).catch((err: unknown) => {
        if (!(err instanceof GameError)) throw err;
      });
    }
    if (daycareTaken.some((slot) => slot >= places)) {
      await releaseAssistants(db, userId, 'daycare', places);
    }
  }

  const museumTaken = [...fossils.map((f) => f.slotIndex), ...helperSlots('museum')];
  if (museumTaken.length > 0) {
    const places = await playerFacilityPlaces(db, ctx, userId, 'museum');
    if (museumTaken.some((slot) => slot >= places)) {
      await db.transaction(async (tx) => {
        // Verrou : seule la première requête rend un fossile donné.
        const returned = await tx
          .delete(fossilRevivals)
          .where(
            and(
              eq(fossilRevivals.ownerId, userId),
              isNull(fossilRevivals.revivedAt),
              gte(fossilRevivals.slotIndex, places),
            ),
          )
          .returning();
        await addItems(
          tx,
          userId,
          returned.map((f) => ({ itemId: f.itemId, quantity: 1 })),
        );
      });
      await releaseAssistants(db, userId, 'museum', places);
    }
  }
}

function releaseAssistants(db: Db, userId: string, post: AssistantPost, places: number) {
  return db
    .delete(assistants)
    .where(
      and(
        eq(assistants.ownerId, userId),
        eq(assistants.post, post),
        gte(assistants.slotIndex, places),
      ),
    );
}
