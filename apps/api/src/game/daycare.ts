import { and, asc, count, eq, gt, inArray, isNull, lte, sql } from 'drizzle-orm';
import { candies, daycareSlots, eggs, pokemon } from '@poke/db';
import type { Db } from '@poke/db';
import {
  abilityHolder,
  applyCandies,
  assistantSlotOf,
  breedingEnv,
  candiesToMaxLevel,
  checkBreedingPair,
  daycareXp,
  eggCycleMinutes,
  eggsLaid,
  hatchMinutes,
  isTransferableSpecies,
  lineageId,
  playerBonuses,
  resolveEgg,
} from '@poke/game-core';
import type { AbilityHolder, DaycareParent, GameContext } from '@poke/game-core';
import type {
  BagEggDto,
  CandyDto,
  CollectEggsInput,
  DaycareDto,
  DaycareXpDto,
  DepositDaycareInput,
  EggDto,
  SetDaycareParentInput,
} from '@poke/shared';
import type { ContentCache } from '../content-cache';
import { assistantHolder, assistantHolders } from './assistants';
import { GameError, newSeed, requireStartedProfile } from './expeditions';
import { recordGuildActivity } from './guilds';
import { playerTransaction } from './tx';
import {
  addItems,
  assertAvailable,
  claimedRewards,
  insertPokemon,
  playerFacilityPlaces,
  pokemonActivities,
  recordPokedex,
  shinyBoost,
  takeItems,
  toInstance,
  transferRows,
} from './store';
import type { PokemonRow } from './store';

/** Pension, œufs, transfert et Bonbons de lignée. Le serveur décide de tout. */

export type DaycareRow = typeof daycareSlots.$inferSelect;
export type EggRow = typeof eggs.$inferSelect;

/** Œuf en couveuse (place et éclosion connues). */
export function toEggDto(row: EggRow): EggDto {
  return {
    id: row.id,
    speciesId: row.speciesId,
    formId: row.formId,
    slotIndex: row.slotIndex ?? 0,
    incubatedAt: (row.incubatedAt ?? row.laidAt).toISOString(),
    hatchAt: (row.hatchAt ?? row.laidAt).toISOString(),
  };
}

export function toBagEggDto(row: EggRow): BagEggDto {
  return {
    id: row.id,
    speciesId: row.speciesId,
    formId: row.formId,
    laidAt: row.laidAt.toISOString(),
  };
}

/** Œuf rangé dans le sac : pas encore de place en couveuse. */
export const isInBag = (row: EggRow) => row.slotIndex === null || row.hatchAt === null;

/** Minutes entre deux œufs d'une pension : talents des parents et de l'assistant de la Pension. */
function slotEggMinutes(
  ctx: GameContext,
  parents: readonly (PokemonRow | undefined)[],
  helper: AbilityHolder | null,
): number {
  const present = parents.filter((p) => p !== undefined).map((p) => abilityHolder(toInstance(p)));
  return eggCycleMinutes(ctx, breedingEnv(present, helper));
}

/** Dépôt d'un parent (avant le dépôt un par un : celui du couple). */
const depositOf = (row: DaycareRow, side: 0 | 1) =>
  (side === 0 ? row.parentADepositedAt : row.parentBDepositedAt) ?? row.depositedAt;

export function toDaycareDto(
  ctx: GameContext,
  row: DaycareRow,
  parents: ReadonlyMap<string, PokemonRow>,
  helper: AbilityHolder | null,
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
    parentADepositedAt: row.parentAId ? depositOf(row, 0).toISOString() : null,
    parentBDepositedAt: row.parentBId ? depositOf(row, 1).toISOString() : null,
    eggSpeciesId: check?.ok ? check.eggSpeciesId : null,
    eggFormId: check?.ok ? check.eggFormId : null,
    eggMinutes: slotEggMinutes(ctx, [a, b], helper),
    breeds: check?.ok ?? false,
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

/** Œufs pas encore éclos : en couveuse (par éclosion) puis dans le sac (par ponte). */
export async function pendingEggs(db: Db, userId: string): Promise<EggRow[]> {
  return db
    .select()
    .from(eggs)
    .where(and(eq(eggs.ownerId, userId), eq(eggs.hatched, false)))
    .orderBy(asc(eggs.hatchAt), asc(eggs.laidAt), asc(eggs.id));
}

/** Places libres des couveuses, de la plus basse à la plus haute. */
async function freeIncubatorPlaces(tx: Db, ctx: GameContext, userId: string): Promise<number[]> {
  const capacity = await playerFacilityPlaces(tx, ctx, userId, 'incubator');
  const taken = new Set(
    (
      await tx
        .select({ slot: eggs.slotIndex })
        .from(eggs)
        .where(and(eq(eggs.ownerId, userId), eq(eggs.hatched, false)))
    ).map((r) => r.slot),
  );
  return Array.from({ length: capacity }, (_, i) => i).filter((i) => !taken.has(i));
}

/**
 * Mise en couveuse à la place `place` : l'assistant de sa couveuse (6 places chacune) agit sur
 * la durée d'éclosion.
 */
function incubation(
  ctx: GameContext,
  speciesId: number,
  place: number,
  incubator: ReadonlyMap<number, AbilityHolder>,
  now: Date,
) {
  const helper = incubator.get(assistantSlotOf('incubator', place)) ?? null;
  return {
    slotIndex: place,
    incubatedAt: now,
    hatchAt: new Date(now.getTime() + hatchMinutes(ctx, speciesId, helper) * 60_000),
  };
}

// --- Dépôt et retrait ---------------------------------------------------------------------

/**
 * Dépose deux Pokémon dans une pension libre (celle demandée, ou la première). Les objets tenus
 * sont réservés dans l'inventaire (rendus au retrait). Un couple compatible pond tout de suite ;
 * un couple qui ne peut pas s'accoupler ne pond jamais, mais gagne quand même de l'XP.
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

  return playerTransaction(db, userId, async (tx) => {
    const used = new Set(
      (
        await tx
          .select({ slotIndex: daycareSlots.slotIndex })
          .from(daycareSlots)
          .where(eq(daycareSlots.ownerId, userId))
      ).map((s) => s.slotIndex),
    );
    const slots = await playerFacilityPlaces(tx, ctx, userId, 'daycare');
    if (input.slotIndex !== undefined && input.slotIndex >= slots) {
      throw new GameError(400, 'NO_SUCH_SLOT');
    }
    const slotIndex =
      input.slotIndex ?? Array.from({ length: slots }, (_, i) => i).find((i) => !used.has(i));
    if (slotIndex === undefined || used.has(slotIndex)) throw new GameError(409, 'NO_FREE_SLOT');

    if (input.parentAId === input.parentBId) throw new GameError(400, 'SAME_POKEMON');
    const ids = [input.parentAId, input.parentBId];
    const rows = await ownedPokemon(tx, userId, ids);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const a = byId.get(input.parentAId);
    const b = byId.get(input.parentBId);
    if (!a || !b) throw new GameError(404, 'POKEMON_NOT_FOUND');
    await assertAvailable(tx, userId, [a, b], now);
    // Un Pokémon Méga-Évolué transmettrait sa forme Méga à l'œuf.
    if (a.megaStone || b.megaStone) throw new GameError(409, 'POKEMON_MEGA');

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
        depositedAt: now,
        parentADepositedAt: now,
        parentBDepositedAt: now,
      })
      .returning();
    return row!;
  });
}

/** Verse l'XP du séjour aux parents qui quittent la pension (plafonnée au niveau maximal). */
async function payDaycareXp(
  tx: Db,
  ctx: GameContext,
  userId: string,
  leaving: readonly { id: string; depositedAt: Date }[],
  now: Date,
): Promise<DaycareXpDto[]> {
  const rows = await ownedPokemon(
    tx,
    userId,
    leaving.map((l) => l.id),
  );
  if (rows.length === 0) return [];
  const bonuses = playerBonuses(ctx, await claimedRewards(tx, userId));
  const result: DaycareXpDto[] = [];
  for (const row of rows) {
    const since = leaving.find((l) => l.id === row.id)!.depositedAt;
    const gain = daycareXp(ctx, row, since, now, bonuses);
    if (gain.xpGained > 0) {
      await tx
        .update(pokemon)
        .set({ xp: gain.xpAfter, level: gain.levelAfter })
        .where(eq(pokemon.id, row.id));
    }
    result.push({
      pokemonId: row.id,
      xpGained: gain.xpGained,
      levelBefore: gain.levelBefore,
      levelAfter: gain.levelAfter,
    });
  }
  return result;
}

/**
 * Change un seul parent d'une pension (`side` 0 ou 1) : `input` y dépose un Pokémon (à la place
 * de celui qui y était), `null` l'en retire. Les œufs prêts du couple d'avant sont d'abord couvés
 * (le surplus va dans le sac), le parent qui part reçoit son XP et son objet tenu revient au sac.
 * Le partenaire reste, avec son XP en cours ; la ponte reprend de zéro avec le nouveau couple.
 */
export async function setDaycareParent(
  db: Db,
  content: ContentCache,
  userId: string,
  slotIndex: number,
  side: 0 | 1,
  input: SetDaycareParentInput | null,
  now: Date,
): Promise<{ incubated: EggRow[]; bagged: number; parents: DaycareXpDto[] }> {
  const ctx = await content.get();
  await requireStartedProfile(db, userId);
  const heldItemId = input?.heldItemId ?? null;
  if (
    heldItemId &&
    !ctx.itemEffect(heldItemId, 'breedingIvs') &&
    !ctx.itemEffect(heldItemId, 'breedingNature')
  ) {
    throw new GameError(400, 'NOT_A_BREEDING_ITEM');
  }

  return playerTransaction(db, userId, async (tx) => {
    const [slot] = await tx
      .select()
      .from(daycareSlots)
      .where(and(eq(daycareSlots.ownerId, userId), eq(daycareSlots.slotIndex, slotIndex)));
    const sideKey = side === 0 ? 'parentAId' : 'parentBId';
    const current = slot?.[sideKey] ?? null;
    const partner = slot?.[side === 0 ? 'parentBId' : 'parentAId'] ?? null;
    if (!input && !current) throw new GameError(409, 'DAYCARE_EMPTY');

    let fresh: PokemonRow | undefined;
    if (input) {
      // Un dépôt n'est possible que dans une pension ouverte (le retrait, partout).
      const slots = await playerFacilityPlaces(tx, ctx, userId, 'daycare');
      if (slotIndex >= slots) throw new GameError(400, 'NO_SUCH_SLOT');
      if (input.pokemonId === partner || input.pokemonId === current) {
        throw new GameError(400, 'SAME_POKEMON');
      }
      [fresh] = await ownedPokemon(tx, userId, [input.pokemonId]);
      if (!fresh) throw new GameError(404, 'POKEMON_NOT_FOUND');
      await assertAvailable(tx, userId, [fresh], now);
      // Un Pokémon Méga-Évolué transmettrait sa forme Méga à l'œuf.
      if (fresh.megaStone) throw new GameError(409, 'POKEMON_MEGA');
      if (heldItemId && !(await takeItems(tx, userId, heldItemId, 1))) {
        throw new GameError(409, 'ITEM_MISSING', { itemId: heldItemId });
      }
    }

    // Œufs prêts du couple qui se sépare : couvés avant le changement.
    const collected =
      slot?.parentAId && slot.parentBId
        ? await collectInTx(tx, ctx, userId, slot, 'incubator', now)
        : { incubated: [], bagged: 0 };

    // Parent qui part : son XP, et son objet tenu rendu (même si le Pokémon n'est plus là).
    const parents = current
      ? await payDaycareXp(
          tx,
          ctx,
          userId,
          [{ id: current, depositedAt: depositOf(slot!, side) }],
          now,
        )
      : [];
    const oldItem = slot ? (side === 0 ? slot.heldItemAId : slot.heldItemBId) : null;
    if (oldItem) {
      await addItems(tx, userId, [{ itemId: oldItem, quantity: 1 }]);
    }

    const values =
      side === 0
        ? {
            parentAId: fresh?.id ?? null,
            heldItemAId: fresh ? heldItemId : null,
            parentADepositedAt: fresh ? now : null,
          }
        : {
            parentBId: fresh?.id ?? null,
            heldItemBId: fresh ? heldItemId : null,
            parentBDepositedAt: fresh ? now : null,
          };
    if (!slot) {
      await tx.insert(daycareSlots).values({
        ownerId: userId,
        slotIndex,
        ...values,
        startedAt: now,
        depositedAt: now,
      });
    } else if (!fresh && !partner) {
      // Plus personne : la pension se libère.
      await tx.delete(daycareSlots).where(eq(daycareSlots.id, slot.id));
    } else {
      await tx
        .update(daycareSlots)
        .set({ ...values, startedAt: now })
        .where(eq(daycareSlots.id, slot.id));
    }
    return { incubated: collected.incubated, bagged: collected.bagged, parents };
  });
}

/**
 * Ramasse tous les œufs pondus dans une pension (au plus `pensionMaxEggs` : une fois pleine, la
 * pension arrête de pondre jusqu'au prochain ramassage). `bag` les range dans le sac ;
 * `incubator` remplit d'abord les places libres des couveuses, le surplus va dans le sac. Les
 * parents sont figés dans chaque œuf au moment de la ponte.
 */
async function collectInTx(
  tx: Db,
  ctx: GameContext,
  userId: string,
  slot: DaycareRow,
  to: CollectEggsInput['to'],
  now: Date,
): Promise<{ incubated: EggRow[]; bagged: number; laid: number }> {
  const { pensionMaxEggs } = ctx.balance.breeding;
  const parents = await ownedPokemon(
    tx,
    userId,
    [slot.parentAId, slot.parentBId].filter((id) => id !== null),
  );
  const a = parents.find((p) => p.id === slot.parentAId);
  const b = parents.find((p) => p.id === slot.parentBId);
  if (!a || !b) throw new GameError(409, 'PARENT_MISSING');
  // Couple qui ne peut pas s'accoupler (déposé pour l'XP, ou contenu modifié) : aucun œuf.
  const check = checkBreedingPair(ctx, a, b);
  if (!check.ok) return { incubated: [], bagged: 0, laid: 0 };
  const helper = await assistantHolder(tx, userId, 'daycare', slot.slotIndex);
  const eggMinutes = slotEggMinutes(ctx, [a, b], helper);
  const laid = eggsLaid(ctx, slot.startedAt, now, eggMinutes);
  const collected = Math.min(laid, pensionMaxEggs);
  if (collected === 0) return { incubated: [], bagged: 0, laid };

  // Nouveau début de cycle : on garde le temps entamé sur l'œuf suivant. Pension pleine : la
  // ponte s'était arrêtée, elle reprend maintenant (sans temps entamé).
  const nextStart =
    laid >= pensionMaxEggs
      ? now
      : new Date(slot.startedAt.getTime() + collected * eggMinutes * 60_000);
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
  const places =
    to === 'incubator' ? (await freeIncubatorPlaces(tx, ctx, userId)).slice(0, collected) : [];
  const incubator =
    places.length > 0
      ? await assistantHolders(tx, userId, 'incubator')
      : new Map<number, AbilityHolder>();
  const created = await tx
    .insert(eggs)
    .values(
      Array.from({ length: collected }, (_, i) => {
        const place = places[i];
        return {
          ownerId: userId,
          speciesId: check.eggSpeciesId,
          formId: check.eggFormId,
          parentAId: a.id,
          parentBId: b.id,
          parents: parentsSnapshot,
          motherIndex: check.motherIndex,
          helper,
          contentVersionId: ctx.content.versionId,
          laidAt: now,
          seed: newSeed(),
          ...(place === undefined
            ? { slotIndex: null, incubatedAt: null, hatchAt: null }
            : incubation(ctx, check.eggSpeciesId, place, incubator, now)),
        };
      }),
    )
    .returning();
  const incubated = created.filter((e) => !isInBag(e));
  return { incubated, bagged: created.length - incubated.length, laid };
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
  to: CollectEggsInput['to'],
  now: Date,
) {
  const ctx = await content.get();
  return playerTransaction(db, userId, async (tx) => {
    const slot = await requireSlot(tx, userId, slotIndex);
    const result = await collectInTx(tx, ctx, userId, slot, to, now);
    if (result.laid === 0) throw new GameError(409, 'NO_EGG_READY');
    return result;
  });
}

/**
 * Retire le couple : couve d'abord les œufs prêts (le surplus va dans le sac), verse aux parents
 * l'XP gagnée pendant leur séjour et rend les objets tenus.
 */
export async function withdrawDaycare(
  db: Db,
  content: ContentCache,
  userId: string,
  slotIndex: number,
  now: Date,
): Promise<{ incubated: EggRow[]; bagged: number; parents: DaycareXpDto[] }> {
  const ctx = await content.get();
  return playerTransaction(db, userId, async (tx) => {
    const slot = await requireSlot(tx, userId, slotIndex);
    const parentsAlive = slot.parentAId !== null && slot.parentBId !== null;
    const collected = parentsAlive
      ? await collectInTx(tx, ctx, userId, slot, 'incubator', now)
      : { incubated: [], bagged: 0 };
    const deleted = await tx.delete(daycareSlots).where(eq(daycareSlots.id, slot.id)).returning();
    if (deleted.length === 0) throw new GameError(409, 'DAYCARE_EMPTY');
    await addItems(
      tx,
      userId,
      [slot.heldItemAId, slot.heldItemBId]
        .filter((id) => id !== null)
        .map((itemId) => ({ itemId, quantity: 1 })),
    );

    // XP du séjour, versée maintenant (plafonnée au niveau maximal).
    const leaving = ([0, 1] as const)
      .map((side) => ({ id: side === 0 ? slot.parentAId : slot.parentBId, side }))
      .filter((l): l is { id: string; side: 0 | 1 } => l.id !== null)
      .map((l) => ({ id: l.id, depositedAt: depositOf(slot, l.side) }));
    const parents = await payDaycareXp(tx, ctx, userId, leaving, now);
    return { incubated: collected.incubated, bagged: collected.bagged, parents };
  });
}

/**
 * Met des œufs du sac en couveuse, dans l'ordre demandé, autant qu'il y a de places libres
 * (`INCUBATOR_FULL` s'il n'y en a aucune).
 */
export async function incubateEggs(
  db: Db,
  content: ContentCache,
  userId: string,
  ids: readonly string[],
  now: Date,
): Promise<EggRow[]> {
  const ctx = await content.get();
  const unique = [...new Set(ids)];
  return playerTransaction(db, userId, async (tx) => {
    const found = await tx
      .select()
      .from(eggs)
      .where(
        and(
          eq(eggs.ownerId, userId),
          eq(eggs.hatched, false),
          isNull(eggs.slotIndex),
          inArray(eggs.id, unique),
        ),
      );
    const byId = new Map(found.map((e) => [e.id, e]));
    const bagged = unique.map((id) => byId.get(id)).filter((e) => e !== undefined);
    if (bagged.length === 0) throw new GameError(404, 'EGG_NOT_FOUND');
    const places = await freeIncubatorPlaces(tx, ctx, userId);
    if (places.length === 0) throw new GameError(409, 'INCUBATOR_FULL');

    const incubator = await assistantHolders(tx, userId, 'incubator');
    const incubated: EggRow[] = [];
    for (const [i, egg] of bagged.slice(0, places.length).entries()) {
      const [row] = await tx
        .update(eggs)
        .set(incubation(ctx, egg.speciesId, places[i]!, incubator, now))
        .where(and(eq(eggs.id, egg.id), isNull(eggs.slotIndex)))
        .returning();
      if (row) incubated.push(row);
    }
    return incubated;
  });
}

/**
 * Retire un œuf de la couveuse : il revient dans le sac, sa place se libère et l'incubation
 * repart de zéro à la prochaine mise en couveuse. Un œuf déjà à terme se fait éclore, pas retirer.
 */
export async function withdrawEgg(db: Db, userId: string, eggId: string, now: Date) {
  return playerTransaction(db, userId, async (tx) => {
    const [egg] = await tx
      .select()
      .from(eggs)
      .where(and(eq(eggs.ownerId, userId), eq(eggs.id, eggId), eq(eggs.hatched, false)));
    if (!egg || isInBag(egg)) throw new GameError(404, 'EGG_NOT_INCUBATED');
    if (egg.hatchAt! <= now) throw new GameError(409, 'EGG_READY');
    const [row] = await tx
      .update(eggs)
      .set({ slotIndex: null, incubatedAt: null, hatchAt: null, notifiedAt: null })
      .where(and(eq(eggs.id, egg.id), eq(eggs.hatched, false)))
      .returning();
    if (!row) throw new GameError(404, 'EGG_NOT_INCUBATED');
    return row;
  });
}

// --- Éclosion ---------------------------------------------------------------------------------

/** Fait éclore tous les œufs arrivés à terme (contenu de la version de ponte). */
export async function hatchEggs(db: Db, content: ContentCache, userId: string, now: Date) {
  await requireStartedProfile(db, userId);
  // Contenu chargé avant la transaction : le cache lit via `db`, ce qui bloquerait PGlite
  // (connexion unique) si la lecture attendait la fin de la transaction en cours.
  const pending = await db
    .selectDistinct({ versionId: eggs.contentVersionId })
    .from(eggs)
    .where(and(eq(eggs.ownerId, userId), eq(eggs.hatched, false)));
  const published = await content.get();
  await Promise.all(pending.map((e) => content.version(e.versionId)));
  return playerTransaction(db, userId, async (tx) => {
    // Verrou : seule la première demande fait éclore un œuf donné.
    const ready = await tx
      .update(eggs)
      .set({ hatched: true })
      .where(and(eq(eggs.ownerId, userId), eq(eggs.hatched, false), lte(eggs.hatchAt, now)))
      .returning();
    if (ready.length === 0) throw new GameError(409, 'NO_EGG_READY');
    ready.sort((x, y) => x.hatchAt!.getTime() - y.hatchAt!.getTime() || x.id.localeCompare(y.id));

    const hatched: PokemonRow[] = [];
    // Charme Chroma possédé et bonus de chance shiny à l'éclosion (lus dans la version publiée).
    const charm = await shinyBoost(tx, published, userId);
    for (const egg of ready) {
      const ctx = await content.version(egg.contentVersionId);
      const child = resolveEgg(ctx, {
        seed: egg.seed,
        speciesId: egg.speciesId,
        formId: egg.formId,
        parents: egg.parents,
        motherIndex: egg.motherIndex === 1 ? 1 : 0,
        shinyCharm: charm,
        helper: egg.helper,
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
    const newInDex = await recordPokedex(tx, userId, {
      seen: hatched.map((p) => p.speciesId),
      caught: hatched,
      at: now,
    });
    await recordGuildActivity(tx, published, userId, { eggsHatched: hatched.length }, now);
    return { hatched, ...newInDex };
  });
}

// --- Transfert et Bonbons ------------------------------------------------------------------

/**
 * Transfère des Pokémon contre des Bonbons de lignée. Refusé pour un favori, un légendaire ou
 * un fabuleux, un Pokémon occupé, ou s'il ne restait plus aucun Pokémon au joueur.
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
  return playerTransaction(db, userId, async (tx) => {
    const rows = await ownedPokemon(tx, userId, unique);
    if (rows.length !== unique.length) throw new GameError(404, 'POKEMON_NOT_FOUND');
    if (rows.some((r) => r.locked)) throw new GameError(409, 'POKEMON_LOCKED');
    if (rows.some((r) => !isTransferableSpecies(ctx, r.speciesId))) {
      throw new GameError(409, 'POKEMON_LEGENDARY');
    }
    const busy = await pokemonActivities(tx, userId);
    if (rows.some((r) => busy.has(r.id))) throw new GameError(409, 'POKEMON_BUSY');
    const [{ value: owned } = { value: 0 }] = await tx
      .select({ value: count() })
      .from(pokemon)
      .where(eq(pokemon.ownerId, userId));
    if (owned - rows.length < 1) throw new GameError(409, 'LAST_POKEMON');

    const gained = await transferRows(tx, ctx, userId, rows);
    return {
      transferred: rows.length,
      gained,
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
  return playerTransaction(db, userId, async (tx) => {
    const [row] = await ownedPokemon(tx, userId, [pokemonId]);
    if (!row) throw new GameError(404, 'POKEMON_NOT_FOUND');
    const lineage = lineageId(ctx, row.speciesId);
    if (lineage === undefined) throw new GameError(400, 'NO_LINEAGE');
    const bonuses = playerBonuses(ctx, await claimedRewards(tx, userId));
    const useful = Math.min(requested, candiesToMaxLevel(ctx, row, bonuses));
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

    const { xp, level } = applyCandies(ctx, row, useful, bonuses);
    const [updated] = await tx
      .update(pokemon)
      .set({ xp, level })
      .where(eq(pokemon.id, row.id))
      .returning();
    return updated!;
  });
}

/** Bonbons du joueur (quantité non nulle), par lignée. */
export function listCandies(db: Db, userId: string): Promise<CandyDto[]> {
  return db
    .select({ lineageId: candies.lineageId, quantity: candies.quantity })
    .from(candies)
    .where(and(eq(candies.ownerId, userId), gt(candies.quantity, 0)))
    .orderBy(asc(candies.lineageId));
}
