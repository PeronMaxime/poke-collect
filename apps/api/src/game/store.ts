import { and, count, eq, gt, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import {
  daycareSlots,
  eggs,
  expeditions,
  inventory,
  pokedex,
  pokedexForms,
  pokemon,
  questProgress,
  rewardClaims,
  trainerBattles,
  trainerProgress,
} from '@poke/db';
import type { Db } from '@poke/db';
import type { ItemStack } from '@poke/content';
import { charmMultiplier, isKnockedOut, questStepsDone } from '@poke/game-core';
import type {
  ClaimedRewards,
  DexCatches,
  GameContext,
  PlayerProgress,
  PokemonInstance,
  QuestRecord,
  TeamMember,
} from '@poke/game-core';
import type { ExpeditionDto, PokemonActivity, PokemonDto, PokemonOrigin } from '@poke/shared';
import { GameError } from './errors';

/** Accès en base à l'état d'un joueur (Pokémon, inventaire, Pokédex). */

export type PokemonRow = typeof pokemon.$inferSelect;
export type ExpeditionRow = typeof expeditions.$inferSelect;
export type QuestProgressRow = typeof questProgress.$inferSelect;

export function toInstance(row: PokemonRow): TeamMember {
  return {
    id: row.id,
    speciesId: row.speciesId,
    formId: row.formId,
    level: row.level,
    xp: row.xp,
    ivs: {
      hp: row.ivHp,
      attack: row.ivAtk,
      defense: row.ivDef,
      'special-attack': row.ivSpa,
      'special-defense': row.ivSpd,
      speed: row.ivSpe,
    },
    nature: row.natureOverride ?? row.nature,
    ability: row.ability,
    isShiny: row.isShiny,
    gender: row.gender,
    happiness: row.happiness,
  };
}

export function toPokemonDto(row: PokemonRow, activity: PokemonActivity | null = null): PokemonDto {
  const { id: _, ...instance } = toInstance(row);
  return {
    id: row.id,
    ...instance,
    formId: row.formId,
    originalNature: row.natureOverride ? row.nature : null,
    origin: row.origin,
    originRegion: row.originRegion,
    caughtAt: row.caughtAt.toISOString(),
    locked: row.locked,
    busy: activity !== null,
    activity,
    koUntil: row.koUntil?.toISOString() ?? null,
    tagId: row.tagId,
  };
}

export function toExpeditionDto(row: ExpeditionRow): ExpeditionDto {
  return {
    id: row.id,
    zoneId: row.zoneId,
    slotIndex: row.slotIndex,
    team: row.team,
    durationMinutes: row.durationMinutes,
    ballItemId: row.ballItemId,
    balls: row.balls,
    berryItemId: row.berryItemId,
    berries: row.berries,
    captureFilter: row.captureFilter,
    contentVersionId: row.contentVersionId,
    startedAt: row.startedAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    claimedAt: row.claimedAt?.toISOString() ?? null,
    shinyChain: row.shinyChain,
    result: (row.result as ExpeditionDto['result']) ?? null,
  };
}

export async function insertPokemon(
  db: Db,
  ownerId: string,
  list: readonly PokemonInstance[],
  { origin, originRegion, at }: { origin: PokemonOrigin; originRegion: string | null; at: Date },
): Promise<PokemonRow[]> {
  if (list.length === 0) return [];
  return db
    .insert(pokemon)
    .values(
      list.map((p) => ({
        ownerId,
        speciesId: p.speciesId,
        formId: p.formId ?? null,
        level: p.level,
        xp: p.xp,
        ivHp: p.ivs.hp,
        ivAtk: p.ivs.attack,
        ivDef: p.ivs.defense,
        ivSpa: p.ivs['special-attack'],
        ivSpd: p.ivs['special-defense'],
        ivSpe: p.ivs.speed,
        nature: p.nature,
        ability: p.ability,
        isShiny: p.isShiny,
        gender: p.gender,
        happiness: p.happiness,
        origin,
        originRegion,
        caughtAt: at,
      })),
    )
    .returning();
}

/**
 * Pokémon occupés (expédition ou combat non réclamé, pension) et leur activité. Un Pokémon
 * occupé ne peut pas être engagé ailleurs, ni transféré.
 */
export async function pokemonActivities(
  db: Db,
  ownerId: string,
): Promise<Map<string, PokemonActivity>> {
  const [running, battles, pensions] = await Promise.all([
    db
      .select({ team: expeditions.team })
      .from(expeditions)
      .where(and(eq(expeditions.ownerId, ownerId), isNull(expeditions.claimedAt))),
    db
      .select({ team: trainerBattles.team })
      .from(trainerBattles)
      .where(and(eq(trainerBattles.ownerId, ownerId), isNull(trainerBattles.claimedAt))),
    db
      .select({ a: daycareSlots.parentAId, b: daycareSlots.parentBId })
      .from(daycareSlots)
      .where(eq(daycareSlots.ownerId, ownerId)),
  ]);
  const activities = new Map<string, PokemonActivity>();
  for (const r of running) for (const id of r.team) activities.set(id, 'expedition');
  for (const b of battles) for (const id of b.team) activities.set(id, 'battle');
  for (const p of pensions) {
    for (const id of [p.a, p.b]) if (id) activities.set(id, 'daycare');
  }
  return activities;
}

/**
 * Disponibilité commune aux expéditions, combats et pensions : un Pokémon occupé ou K.O.
 * ne peut pas être engagé. Lève `POKEMON_BUSY` ou `POKEMON_KO`.
 */
export async function assertAvailable(
  db: Db,
  ownerId: string,
  rows: readonly PokemonRow[],
  now: Date,
): Promise<void> {
  const busy = await pokemonActivities(db, ownerId);
  if (rows.some((r) => busy.has(r.id))) throw new GameError(409, 'POKEMON_BUSY');
  const ko = rows.filter((r) => isKnockedOut(r.koUntil, now));
  if (ko.length > 0) {
    throw new GameError(409, 'POKEMON_KO', {
      koUntil: new Date(Math.max(...ko.map((r) => r.koUntil!.getTime()))).toISOString(),
    });
  }
}

/**
 * Avancement utile aux conditions de déblocage : Pokédex, dresseurs battus, œufs éclos et étapes
 * validées des quêtes (calculées paresseusement à partir de l'avancement enregistré).
 */
export async function playerProgress(
  db: Db,
  ctx: GameContext,
  ownerId: string,
): Promise<PlayerProgress> {
  const [base, rows] = await Promise.all([baseProgress(db, ownerId), questRows(db, ownerId)]);
  return { ...base, questSteps: questStepsDone(ctx, base, questRecords(rows)) };
}

/** Avancement hors quêtes. */
export async function baseProgress(db: Db, ownerId: string): Promise<PlayerProgress> {
  const [caught, defeated, hatched] = await Promise.all([
    caughtSpeciesIds(db, ownerId),
    db
      .select({ trainerId: trainerProgress.trainerId })
      .from(trainerProgress)
      .where(and(eq(trainerProgress.ownerId, ownerId), gt(trainerProgress.wins, 0))),
    eggsHatchedCount(db, ownerId),
  ]);
  return {
    caughtSpeciesIds: caught,
    defeatedTrainerIds: new Set(defeated.map((d) => d.trainerId)),
    eggsHatched: hatched,
  };
}

export async function questRows(db: Db, ownerId: string): Promise<QuestProgressRow[]> {
  return db.select().from(questProgress).where(eq(questProgress.ownerId, ownerId));
}

export function questRecords(rows: readonly QuestProgressRow[]): Map<string, QuestRecord> {
  return new Map(rows.map((r) => [r.questId, { step: r.step, count: r.progress.count ?? 0 }]));
}

/**
 * Récompenses de progression réclamées : paliers, collections et quêtes (emplacements et bonus
 * permanents en découlent).
 */
export async function claimedRewards(db: Db, ownerId: string): Promise<ClaimedRewards> {
  const [rows, quests] = await Promise.all([
    db
      .select({ kind: rewardClaims.kind, rewardId: rewardClaims.rewardId })
      .from(rewardClaims)
      .where(eq(rewardClaims.ownerId, ownerId)),
    db
      .select({ questId: questProgress.questId })
      .from(questProgress)
      .where(and(eq(questProgress.ownerId, ownerId), isNotNull(questProgress.claimedAt))),
  ]);
  const ids = (kind: string) => new Set(rows.filter((r) => r.kind === kind).map((r) => r.rewardId));
  return {
    milestoneIds: ids('milestone'),
    collectionIds: ids('collection'),
    questIds: new Set(quests.map((q) => q.questId)),
  };
}

export async function eggsHatchedCount(db: Db, ownerId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(eggs)
    .where(and(eq(eggs.ownerId, ownerId), eq(eggs.hatched, true)));
  return row?.n ?? 0;
}

export async function addItems(db: Db, ownerId: string, stacks: readonly ItemStack[]) {
  const merged = new Map<string, number>();
  for (const s of stacks) {
    if (s.quantity > 0) merged.set(s.itemId, (merged.get(s.itemId) ?? 0) + s.quantity);
  }
  if (merged.size === 0) return;
  await db
    .insert(inventory)
    .values([...merged].map(([itemId, quantity]) => ({ ownerId, itemId, quantity })))
    .onConflictDoUpdate({
      target: [inventory.ownerId, inventory.itemId],
      set: { quantity: sql`${inventory.quantity} + excluded.quantity` },
    });
}

/** Retire `quantity` objets ; retourne faux (sans rien retirer) si le stock est insuffisant. */
export async function takeItems(db: Db, ownerId: string, itemId: string, quantity: number) {
  if (quantity <= 0) return true;
  const updated = await db
    .update(inventory)
    .set({ quantity: sql`${inventory.quantity} - ${quantity}` })
    .where(
      and(
        eq(inventory.ownerId, ownerId),
        eq(inventory.itemId, itemId),
        sql`${inventory.quantity} >= ${quantity}`,
      ),
    )
    .returning({ itemId: inventory.itemId });
  return updated.length > 0;
}

/** Multiplicateur du Charme Chroma : meilleur objet `shinyCharm` présent dans le sac. */
export async function shinyCharm(db: Db, ctx: GameContext, ownerId: string): Promise<number> {
  const rows = await db
    .select({ itemId: inventory.itemId })
    .from(inventory)
    .where(and(eq(inventory.ownerId, ownerId), gt(inventory.quantity, 0)));
  return charmMultiplier(
    ctx,
    rows.map((r) => r.itemId),
  );
}

export async function itemQuantity(db: Db, ownerId: string, itemId: string): Promise<number> {
  const [row] = await db
    .select({ quantity: inventory.quantity })
    .from(inventory)
    .where(and(eq(inventory.ownerId, ownerId), eq(inventory.itemId, itemId)));
  return row?.quantity ?? 0;
}

/**
 * Met à jour le Pokédex : espèces vues, Pokémon capturés (espèce, forme, shiny).
 * Retourne les espèces capturées pour la première fois.
 */
export async function recordPokedex(
  db: Db,
  ownerId: string,
  {
    seen,
    caught,
    at,
  }: {
    seen: Iterable<number>;
    caught: readonly Pick<PokemonInstance, 'speciesId' | 'formId' | 'isShiny'>[];
    at: Date;
  },
): Promise<number[]> {
  const caughtSet = new Set(caught.map((p) => p.speciesId));
  const shinySet = new Set(caught.filter((p) => p.isShiny).map((p) => p.speciesId));
  const all = new Set([...seen, ...caughtSet]);
  if (all.size === 0) return [];

  const before = await db
    .select({ speciesId: pokedex.speciesId })
    .from(pokedex)
    .where(
      and(
        eq(pokedex.ownerId, ownerId),
        eq(pokedex.caught, true),
        inArray(pokedex.speciesId, [...all]),
      ),
    );
  const alreadyCaught = new Set(before.map((r) => r.speciesId));

  for (const speciesId of all) {
    const isCaught = caughtSet.has(speciesId);
    const isShiny = shinySet.has(speciesId);
    await db
      .insert(pokedex)
      .values({
        ownerId,
        speciesId,
        seen: true,
        caught: isCaught,
        caughtShiny: isShiny,
        firstCaughtAt: isCaught ? at : null,
      })
      .onConflictDoUpdate({
        target: [pokedex.ownerId, pokedex.speciesId],
        set: {
          seen: true,
          caught: sql`${pokedex.caught} or excluded.caught`,
          caughtShiny: sql`${pokedex.caughtShiny} or excluded.caught_shiny`,
          firstCaughtAt: sql`coalesce(${pokedex.firstCaughtAt}, excluded.first_caught_at)`,
        },
      });
  }

  const formsShiny = new Map<number, boolean>();
  for (const p of caught) {
    if (p.formId != null)
      formsShiny.set(p.formId, (formsShiny.get(p.formId) ?? false) || p.isShiny);
  }
  for (const [formId, isShiny] of formsShiny) {
    await db
      .insert(pokedexForms)
      .values({ ownerId, formId, caughtShiny: isShiny, firstCaughtAt: at })
      .onConflictDoUpdate({
        target: [pokedexForms.ownerId, pokedexForms.formId],
        set: { caughtShiny: sql`${pokedexForms.caughtShiny} or excluded.caught_shiny` },
      });
  }
  return [...caughtSet].filter((id) => !alreadyCaught.has(id));
}

/** Pokédex normal et shiny (paliers du Pokédex). */
export async function dexCatches(db: Db, ownerId: string): Promise<Required<DexCatches>> {
  const rows = await db
    .select({ speciesId: pokedex.speciesId, shiny: pokedex.caughtShiny })
    .from(pokedex)
    .where(and(eq(pokedex.ownerId, ownerId), eq(pokedex.caught, true)));
  return {
    caughtSpeciesIds: new Set(rows.map((r) => r.speciesId)),
    caughtShinySpeciesIds: new Set(rows.filter((r) => r.shiny).map((r) => r.speciesId)),
  };
}

export async function caughtSpeciesIds(db: Db, ownerId: string): Promise<Set<number>> {
  const rows = await db
    .select({ speciesId: pokedex.speciesId })
    .from(pokedex)
    .where(and(eq(pokedex.ownerId, ownerId), eq(pokedex.caught, true)));
  return new Set(rows.map((r) => r.speciesId));
}
