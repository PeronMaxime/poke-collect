import { and, asc, count, eq, isNull, lte } from 'drizzle-orm';
import { fossilRevivals } from '@poke/db';
import type { Db } from '@poke/db';
import { fossilEffect, reviveFossil } from '@poke/game-core';
import type { FossilRevivalDto } from '@poke/shared';
import type { ContentCache } from '../content-cache';
import { GameError } from './errors';
import { newSeed, requireStartedProfile } from './expeditions';
import { addItems, insertPokemon, recordPokedex, shinyCharm, takeItems } from './store';
import type { PokemonRow } from './store';

/**
 * Musée : le joueur y dépose un fossile (consommé), qui devient un Pokémon une fois la durée de
 * restauration écoulée. Comme pour les œufs, le serveur décide de tout.
 */

export type FossilRevivalRow = typeof fossilRevivals.$inferSelect;

export function toFossilRevivalDto(row: FossilRevivalRow): FossilRevivalDto {
  return {
    id: row.id,
    itemId: row.itemId,
    speciesId: row.speciesId,
    formId: row.formId,
    startedAt: row.startedAt.toISOString(),
    readyAt: row.readyAt.toISOString(),
  };
}

/** Fossiles encore au Musée (en restauration, ou restaurés mais pas récupérés). */
export async function activeRevivals(db: Db, userId: string): Promise<FossilRevivalRow[]> {
  return db
    .select()
    .from(fossilRevivals)
    .where(and(eq(fossilRevivals.ownerId, userId), isNull(fossilRevivals.revivedAt)))
    .orderBy(asc(fossilRevivals.readyAt), asc(fossilRevivals.id));
}

/** Dépose un fossile au Musée, dans la limite des places (`balance.museum.slots`). */
export async function depositFossil(
  db: Db,
  content: ContentCache,
  userId: string,
  itemId: string,
  now: Date,
): Promise<FossilRevivalRow> {
  const ctx = await content.get();
  await requireStartedProfile(db, userId);
  const effect = fossilEffect(ctx, itemId);
  if (!effect || !ctx.species(effect.speciesId)) throw new GameError(400, 'NOT_A_FOSSIL');

  return db.transaction(async (tx) => {
    const [{ value: used } = { value: 0 }] = await tx
      .select({ value: count() })
      .from(fossilRevivals)
      .where(and(eq(fossilRevivals.ownerId, userId), isNull(fossilRevivals.revivedAt)));
    if (used >= ctx.balance.museum.slots) throw new GameError(409, 'MUSEUM_FULL');
    if (!(await takeItems(tx, userId, itemId, 1))) {
      throw new GameError(409, 'ITEM_MISSING', { itemId });
    }
    const [row] = await tx
      .insert(fossilRevivals)
      .values({
        ownerId: userId,
        itemId,
        speciesId: effect.speciesId,
        formId: effect.formId ?? null,
        level: effect.level,
        contentVersionId: ctx.content.versionId,
        startedAt: now,
        readyAt: new Date(now.getTime() + effect.minutes * 60_000),
        seed: newSeed(),
      })
      .returning();
    return row!;
  });
}

/** Reprend un fossile pas encore restauré : il revient dans le sac. */
export async function cancelFossil(db: Db, userId: string, revivalId: string, now: Date) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .delete(fossilRevivals)
      .where(
        and(
          eq(fossilRevivals.ownerId, userId),
          eq(fossilRevivals.id, revivalId),
          isNull(fossilRevivals.revivedAt),
        ),
      )
      .returning();
    if (!row) throw new GameError(404, 'FOSSIL_NOT_FOUND');
    if (row.readyAt <= now) throw new GameError(409, 'FOSSIL_ALREADY_REVIVED');
    await addItems(tx, userId, [{ itemId: row.itemId, quantity: 1 }]);
    return row;
  });
}

/** Récupère tous les Pokémon restaurés (contenu de la version du dépôt). */
export async function reviveFossils(db: Db, content: ContentCache, userId: string, now: Date) {
  await requireStartedProfile(db, userId);
  // Contenu chargé avant la transaction : le cache lit via `db`, ce qui bloquerait PGlite
  // (connexion unique) si la lecture attendait la fin de la transaction en cours.
  const pending = await db
    .selectDistinct({ versionId: fossilRevivals.contentVersionId })
    .from(fossilRevivals)
    .where(and(eq(fossilRevivals.ownerId, userId), isNull(fossilRevivals.revivedAt)));
  const published = await content.get();
  await Promise.all(pending.map((f) => content.version(f.versionId)));
  return db.transaction(async (tx) => {
    // Verrou : seule la première demande restaure un fossile donné.
    const ready = await tx
      .update(fossilRevivals)
      .set({ revivedAt: now })
      .where(
        and(
          eq(fossilRevivals.ownerId, userId),
          isNull(fossilRevivals.revivedAt),
          lte(fossilRevivals.readyAt, now),
        ),
      )
      .returning();
    if (ready.length === 0) throw new GameError(409, 'NO_FOSSIL_READY');
    ready.sort((x, y) => x.readyAt.getTime() - y.readyAt.getTime() || x.id.localeCompare(y.id));

    const revived: PokemonRow[] = [];
    const charm = await shinyCharm(tx, published, userId);
    for (const fossil of ready) {
      const ctx = await content.version(fossil.contentVersionId);
      const child = reviveFossil(ctx, { ...fossil, shinyCharm: charm });
      const region = ctx.regions.find((r) => r.speciesIds.includes(child.speciesId));
      const [row] = await insertPokemon(tx, userId, [child], {
        origin: 'fossil',
        originRegion: region?.id ?? null,
        at: now,
      });
      await tx
        .update(fossilRevivals)
        .set({ pokemonId: row!.id })
        .where(eq(fossilRevivals.id, fossil.id));
      revived.push(row!);
    }
    const newSpeciesIds = await recordPokedex(tx, userId, {
      seen: revived.map((p) => p.speciesId),
      caught: revived,
      at: now,
    });
    return { revived, newSpeciesIds };
  });
}
