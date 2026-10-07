import { and, asc, count, eq, inArray, lte, sql } from 'drizzle-orm';
import { candies, daycareSlots, eggs, pokemon } from '@poke/db';
import type { Db } from '@poke/db';
import {
  applyCandies,
  candiesToMaxLevel,
  checkBreedingPair,
  eggsLaid,
  hatchMinutes,
  lineageId,
  playerSlots,
  resolveEgg,
  transferCandies,
} from '@poke/game-core';
import type { ClaimedRewards, DaycareParent, GameContext } from '@poke/game-core';
import type { DaycareDto, DepositDaycareInput, EggDto } from '@poke/shared';
import type { ContentCache } from '../content-cache';
import { GameError, newSeed, requireStartedProfile } from './expeditions';
import {
  addItems,
  assertAvailable,
  claimedRewards,
  insertPokemon,
  pokemonActivities,
  recordPokedex,
  shinyCharm,
  takeItems,
  toInstance,
} from './store';
import type { PokemonRow } from './store';

/** Pension, œufs, transfert et Bonbons de lignée. Le serveur décide de tout. */

export type DaycareRow = typeof daycareSlots.$inferSelect;
export type EggRow = typeof eggs.$inferSelect;

/** Nombre de pensions du joueur (départ + paliers et collections réclamés). */
export function daycareSlotCount(ctx: GameContext, claimed: ClaimedRewards): number {
  return playerSlots(ctx, claimed).daycare;
}

export function toEggDto(row: EggRow): EggDto {
  return {
    id: row.id,
    speciesId: row.speciesId,
    laidAt: row.laidAt.toISOString(),
    hatchAt: row.hatchAt.toISOString(),
  };
}

export function toDaycareDto(
  ctx: GameContext,
  row: DaycareRow,
  parents: ReadonlyMap<string, PokemonRow>,
): DaycareDto {
  const a = row.parentAId ? parents.get(row.parentAId) : undefined;
  const b = row.parentBId ? parents.get(row.parentBId) : undefined;
  const check = a && b ? checkBreedingPair(ctx, a, b) : null;
  return {
    slotIndex: row.slotIndex,
    parentAId: row.parentAId,
    parentBId: row.parentBId,
    heldItemAId: row.heldItemAId,
    heldItemBId: row.heldItemBId,
    startedAt: row.startedAt.toISOString(),
    eggSpeciesId: check?.ok ? check.eggSpeciesId : null,
  };
}

async function ownedPokemon(db: Db, userId: string, ids: readonly string[]) {
  if (ids.length === 0) return [];
  return db
    .select()
    .from(pokemon)
    .where(and(eq(pokemon.ownerId, userId), inArray(pokemon.id, [...ids])));
}

/** Pensions occupées du joueur et leurs parents. */
export async function loadDaycare(db: Db, userId: string) {
  const slots = await db
    .select()
    .from(daycareSlots)
    .where(eq(daycareSlots.ownerId, userId))
    .orderBy(asc(daycareSlots.slotIndex));
  const ids = slots.flatMap((s) => [s.parentAId, s.parentBId]).filter((id) => id !== null);
  const parents = new Map((await ownedPokemon(db, userId, ids)).map((p) => [p.id, p]));
  return { slots, parents };
}

export async function pendingEggs(db: Db, userId: string): Promise<EggRow[]> {
  return db
    .select()
    .from(eggs)
    .where(and(eq(eggs.ownerId, userId), eq(eggs.hatched, false)))
    .orderBy(asc(eggs.hatchAt), asc(eggs.id));
}

// --- Dépôt et retrait ---------------------------------------------------------------------

/**
 * Dépose un couple compatible dans une pension libre. Les objets tenus sont réservés dans
 * l'inventaire (rendus au retrait). Le cycle de ponte démarre tout de suite.
 */
export async function depositDaycare(
  db: Db,
  content: ContentCache,
  userId: string,
  input: DepositDaycareInput,
  now: Date,
): Promise<DaycareRow> {
  const ctx = await content.get();
  await requireStartedProfile(db, userId);
  for (const itemId of [input.heldItemAId, input.heldItemBId]) {
    if (
      itemId &&
      !ctx.itemEffect(itemId, 'breedingIvs') &&
      !ctx.itemEffect(itemId, 'breedingNature')
    ) {
      throw new GameError(400, 'NOT_A_BREEDING_ITEM');
    }
  }

  return db.transaction(async (tx) => {
    const used = new Set(
      (
        await tx
          .select({ slotIndex: daycareSlots.slotIndex })
          .from(daycareSlots)
          .where(eq(daycareSlots.ownerId, userId))
      ).map((s) => s.slotIndex),
    );
    const slots = daycareSlotCount(ctx, await claimedRewards(tx, userId));
    const slotIndex = Array.from({ length: slots }, (_, i) => i).find((i) => !used.has(i));
    if (slotIndex === undefined) throw new GameError(409, 'NO_FREE_SLOT');

    const ids = [input.parentAId, input.parentBId];
    const rows = await ownedPokemon(tx, userId, ids);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const a = byId.get(input.parentAId);
    const b = byId.get(input.parentBId);
    if (!a || !b) throw new GameError(404, 'POKEMON_NOT_FOUND');
    await assertAvailable(tx, userId, [a, b], now);

    const check = checkBreedingPair(ctx, a, b);
    if (!check.ok) throw new GameError(400, 'INCOMPATIBLE_PARENTS', { errors: check.errors });

    for (const itemId of [input.heldItemAId, input.heldItemBId]) {
      if (itemId && !(await takeItems(tx, userId, itemId, 1))) {
        throw new GameError(409, 'ITEM_MISSING', { itemId });
      }
    }

    const [row] = await tx
      .insert(daycareSlots)
      .values({
        ownerId: userId,
        slotIndex,
        parentAId: a.id,
        parentBId: b.id,
        heldItemAId: input.heldItemAId,
        heldItemBId: input.heldItemBId,
        startedAt: now,
      })
      .returning();
    return row!;
  });
}

/**
 * Ramasse les œufs pondus dans une pension (dans la limite de la couveuse). Les œufs qui
 * n'y tiennent pas restent en attente dans la pension, jusqu'à `maxEggs` ; au-delà, ils
 * sont perdus. Les parents sont figés dans chaque œuf au moment de la ponte.
 */
async function collectInTx(
  tx: Db,
  ctx: GameContext,
  userId: string,
  slot: DaycareRow,
  now: Date,
): Promise<{ eggs: EggRow[]; lost: number }> {
  const { eggMinutes, maxEggs } = ctx.balance.breeding;
  const laid = eggsLaid(ctx, slot.startedAt, now);
  const waiting = Math.min(laid, maxEggs);
  const lost = laid - waiting;
  if (waiting === 0) return { eggs: [], lost: 0 };

  const [{ value: incubating } = { value: 0 }] = await tx
    .select({ value: count() })
    .from(eggs)
    .where(and(eq(eggs.ownerId, userId), eq(eggs.hatched, false)));
  const collected = Math.min(waiting, Math.max(0, maxEggs - incubating));
  if (collected === 0) return { eggs: [], lost: 0 };

  const parents = await ownedPokemon(
    tx,
    userId,
    [slot.parentAId, slot.parentBId].filter((id) => id !== null),
  );
  const a = parents.find((p) => p.id === slot.parentAId);
  const b = parents.find((p) => p.id === slot.parentBId);
  if (!a || !b) throw new GameError(409, 'PARENT_MISSING');
  const check = checkBreedingPair(ctx, a, b);
  if (!check.ok) throw new GameError(409, 'INCOMPATIBLE_PARENTS', { errors: check.errors });

  // Nouveau début de cycle : on garde les œufs restés en attente et le temps entamé.
  const cycleMs = eggMinutes * 60_000;
  const consumed = lost + collected;
  const nextStart = new Date(slot.startedAt.getTime() + consumed * cycleMs);
  const [locked] = await tx
    .update(daycareSlots)
    .set({ startedAt: nextStart })
    .where(and(eq(daycareSlots.id, slot.id), eq(daycareSlots.startedAt, slot.startedAt)))
    .returning();
  if (!locked) throw new GameError(409, 'ALREADY_COLLECTED');

  const snapshot = (row: PokemonRow, heldItemId: string | null): DaycareParent => {
    const { id: _, ...instance } = toInstance(row);
    return { ...instance, heldItemId, originRegion: row.originRegion };
  };
  const parentsSnapshot: [DaycareParent, DaycareParent] = [
    snapshot(a, slot.heldItemAId),
    snapshot(b, slot.heldItemBId),
  ];
  const hatchAt = new Date(now.getTime() + hatchMinutes(ctx, check.eggSpeciesId) * 60_000);
  const created = await tx
    .insert(eggs)
    .values(
      Array.from({ length: collected }, () => ({
        ownerId: userId,
        speciesId: check.eggSpeciesId,
        parentAId: a.id,
        parentBId: b.id,
        parents: parentsSnapshot,
        motherIndex: check.motherIndex,
        contentVersionId: ctx.content.versionId,
        laidAt: now,
        hatchAt,
        seed: newSeed(),
      })),
    )
    .returning();
  return { eggs: created, lost };
}

async function requireSlot(db: Db, userId: string, slotIndex: number): Promise<DaycareRow> {
  const [slot] = await db
    .select()
    .from(daycareSlots)
    .where(and(eq(daycareSlots.ownerId, userId), eq(daycareSlots.slotIndex, slotIndex)));
  if (!slot) throw new GameError(404, 'DAYCARE_EMPTY');
  return slot;
}

export async function collectEggs(
  db: Db,
  content: ContentCache,
  userId: string,
  slotIndex: number,
  now: Date,
) {
  const ctx = await content.get();
  return db.transaction(async (tx) => {
    const slot = await requireSlot(tx, userId, slotIndex);
    if (eggsLaid(ctx, slot.startedAt, now) === 0) {
      throw new GameError(409, 'NO_EGG_READY');
    }
    const result = await collectInTx(tx, ctx, userId, slot, now);
    if (result.eggs.length === 0) throw new GameError(409, 'INCUBATOR_FULL');
    return result;
  });
}

/** Retire le couple : ramasse d'abord les œufs prêts (s'il y a de la place), rend les objets. */
export async function withdrawDaycare(
  db: Db,
  content: ContentCache,
  userId: string,
  slotIndex: number,
  now: Date,
) {
  const ctx = await content.get();
  return db.transaction(async (tx) => {
    const slot = await requireSlot(tx, userId, slotIndex);
    const parentsAlive = slot.parentAId !== null && slot.parentBId !== null;
    const collected = parentsAlive
      ? await collectInTx(tx, ctx, userId, slot, now).catch((err: unknown) => {
          // Couple devenu incompatible (contenu modifié) : on retire sans ramasser.
          if (err instanceof GameError && err.code === 'INCOMPATIBLE_PARENTS') {
            return { eggs: [], lost: 0 };
          }
          throw err;
        })
      : { eggs: [], lost: 0 };
    const deleted = await tx.delete(daycareSlots).where(eq(daycareSlots.id, slot.id)).returning();
    if (deleted.length === 0) throw new GameError(409, 'DAYCARE_EMPTY');
    await addItems(
      tx,
      userId,
      [slot.heldItemAId, slot.heldItemBId]
        .filter((id) => id !== null)
        .map((itemId) => ({ itemId, quantity: 1 })),
    );
    return collected;
  });
}

// --- Éclosion ---------------------------------------------------------------------------------

/** Fait éclore tous les œufs arrivés à terme (contenu de la version de ponte). */
export async function hatchEggs(db: Db, content: ContentCache, userId: string, now: Date) {
  await requireStartedProfile(db, userId);
  return db.transaction(async (tx) => {
    // Verrou : seule la première demande fait éclore un œuf donné.
    const ready = await tx
      .update(eggs)
      .set({ hatched: true })
      .where(and(eq(eggs.ownerId, userId), eq(eggs.hatched, false), lte(eggs.hatchAt, now)))
      .returning();
    if (ready.length === 0) throw new GameError(409, 'NO_EGG_READY');
    ready.sort((x, y) => x.hatchAt.getTime() - y.hatchAt.getTime() || x.id.localeCompare(y.id));

    const hatched: PokemonRow[] = [];
    // Charme Chroma possédé à l'éclosion (effet lu dans la version publiée).
    const charm = await shinyCharm(tx, await content.get(), userId);
    for (const egg of ready) {
      const ctx = await content.version(egg.contentVersionId);
      const child = resolveEgg(ctx, {
        seed: egg.seed,
        speciesId: egg.speciesId,
        parents: egg.parents,
        motherIndex: egg.motherIndex === 1 ? 1 : 0,
        shinyCharm: charm,
      });
      const region = ctx.regions.find((r) => r.speciesIds.includes(child.speciesId));
      const [row] = await insertPokemon(tx, userId, [child], {
        origin: 'egg',
        originRegion: region?.id ?? null,
        at: now,
      });
      await tx.update(eggs).set({ hatchedPokemonId: row!.id }).where(eq(eggs.id, egg.id));
      hatched.push(row!);
    }
    const newSpeciesIds = await recordPokedex(tx, userId, {
      seen: hatched.map((p) => p.speciesId),
      caught: hatched.map((p) => p.speciesId),
      caughtShiny: hatched.filter((p) => p.isShiny).map((p) => p.speciesId),
      at: now,
    });
    return { hatched, newSpeciesIds };
  });
}

// --- Transfert et Bonbons ------------------------------------------------------------------

async function addCandies(db: Db, ownerId: string, gained: ReadonlyMap<number, number>) {
  const values = [...gained]
    .filter(([, quantity]) => quantity > 0)
    .map(([lineage, quantity]) => ({ ownerId, lineageId: lineage, quantity }));
  if (values.length === 0) return;
  await db
    .insert(candies)
    .values(values)
    .onConflictDoUpdate({
      target: [candies.ownerId, candies.lineageId],
      set: { quantity: sql`${candies.quantity} + excluded.quantity` },
    });
}

/**
 * Transfère des Pokémon contre des Bonbons de lignée. Refusé pour un favori, un Pokémon
 * occupé, ou s'il ne restait plus aucun Pokémon au joueur.
 */
export async function transferPokemon(
  db: Db,
  content: ContentCache,
  userId: string,
  ids: readonly string[],
) {
  const ctx = await content.get();
  await requireStartedProfile(db, userId);
  const unique = [...new Set(ids)];
  return db.transaction(async (tx) => {
    const rows = await ownedPokemon(tx, userId, unique);
    if (rows.length !== unique.length) throw new GameError(404, 'POKEMON_NOT_FOUND');
    if (rows.some((r) => r.locked)) throw new GameError(409, 'POKEMON_LOCKED');
    const busy = await pokemonActivities(tx, userId);
    if (rows.some((r) => busy.has(r.id))) throw new GameError(409, 'POKEMON_BUSY');
    const [{ value: owned } = { value: 0 }] = await tx
      .select({ value: count() })
      .from(pokemon)
      .where(eq(pokemon.ownerId, userId));
    if (owned - rows.length < 1) throw new GameError(409, 'LAST_POKEMON');

    const gained = new Map<number, number>();
    for (const r of rows) {
      const lineage = lineageId(ctx, r.speciesId);
      if (lineage === undefined) continue;
      gained.set(lineage, (gained.get(lineage) ?? 0) + transferCandies(ctx, r));
    }
    await tx.delete(pokemon).where(and(eq(pokemon.ownerId, userId), inArray(pokemon.id, unique)));
    await addCandies(tx, userId, gained);
    return {
      transferred: rows.length,
      gained: [...gained].map(([lineage, quantity]) => ({ lineageId: lineage, quantity })),
    };
  });
}

/** Donne des Bonbons de sa lignée à un Pokémon (XP), sans dépasser le niveau maximal. */
export async function feedCandies(
  db: Db,
  content: ContentCache,
  userId: string,
  pokemonId: string,
  requested: number,
): Promise<PokemonRow> {
  const ctx = await content.get();
  return db.transaction(async (tx) => {
    const [row] = await ownedPokemon(tx, userId, [pokemonId]);
    if (!row) throw new GameError(404, 'POKEMON_NOT_FOUND');
    const lineage = lineageId(ctx, row.speciesId);
    if (lineage === undefined) throw new GameError(400, 'NO_LINEAGE');
    const useful = Math.min(requested, candiesToMaxLevel(ctx, row));
    if (useful <= 0) throw new GameError(409, 'MAX_LEVEL');

    const spent = await tx
      .update(candies)
      .set({ quantity: sql`${candies.quantity} - ${useful}` })
      .where(
        and(
          eq(candies.ownerId, userId),
          eq(candies.lineageId, lineage),
          sql`${candies.quantity} >= ${useful}`,
        ),
      )
      .returning();
    if (spent.length === 0) throw new GameError(409, 'NOT_ENOUGH_CANDIES');

    const { xp, level } = applyCandies(ctx, row, useful);
    const [updated] = await tx
      .update(pokemon)
      .set({ xp, level })
      .where(eq(pokemon.id, row.id))
      .returning();
    return updated!;
  });
}
