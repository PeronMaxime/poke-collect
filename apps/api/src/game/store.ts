import { and, count, eq, gt, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import {
  assistants,
  daycareSlots,
  dungeonRuns,
  eggs,
  expeditions,
  inventory,
  pokedex,
  pokedexForms,
  pokemon,
  questProgress,
  rewardClaims,
  speciesCaptures,
  trainerProgress,
  trainerRuns,
} from '@poke/db';
import type { Db } from '@poke/db';
import { tabUnlock } from '@poke/content';
import type { FacilityId, ItemStack, MenuTabId } from '@poke/content';
import {
  charmMultiplier,
  facilityPlaces,
  facilityUnlocks,
  isHealing,
  isTabUnlocked,
  NO_ABILITY,
  NO_CLAIMS,
  playerBonuses,
  questStepsDone,
} from '@poke/game-core';
import type {
  CaughtDex,
  ClaimedRewards,
  DexCatches,
  GameContext,
  PlayerProgress,
  PlayerSlots,
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
    knockedOut: row.knockedOut,
    healUntil: row.healUntil?.toISOString() ?? null,
    healSlot: row.healUntil ? row.healSlot : null,
    tagIds: row.tagIds,
    dungeonMove: row.dungeonMove,
    megaStone: row.megaStone,
  };
}

export function toExpeditionDto(row: ExpeditionRow): ExpeditionDto {
  return {
    id: row.id,
    zoneId: row.zoneId,
    questId: row.questId,
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
    localHour: row.localHour,
    roamerQuestIds: row.roamers.map((r) => r.questId),
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
  const captures = new Map<number, { captured: number; shiny: number }>();
  for (const p of list) {
    const c = captures.get(p.speciesId) ?? { captured: 0, shiny: 0 };
    c.captured++;
    if (p.isShiny) c.shiny++;
    captures.set(p.speciesId, c);
  }
  await db
    .insert(speciesCaptures)
    .values([...captures].map(([speciesId, c]) => ({ speciesId, ...c })))
    .onConflictDoUpdate({
      target: speciesCaptures.speciesId,
      set: {
        captured: sql`${speciesCaptures.captured} + excluded.captured`,
        shiny: sql`${speciesCaptures.shiny} + excluded.shiny`,
      },
    });
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
        // Les Pokémon obtenus arrivent sans talent (Pilule / Patch Talent pour le débloquer).
        ability: NO_ABILITY,
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
 * Pokémon occupés (expédition, combat ou donjon non réclamé, pension) et leur activité. Un Pokémon
 * occupé ne peut pas être engagé ailleurs, ni transféré.
 */
export async function pokemonActivities(
  db: Db,
  ownerId: string,
): Promise<Map<string, PokemonActivity>> {
  const [running, battles, pensions, runs, helpers] = await Promise.all([
    db
      .select({ team: expeditions.team })
      .from(expeditions)
      .where(and(eq(expeditions.ownerId, ownerId), isNull(expeditions.claimedAt))),
    db
      .select({ team: trainerRuns.team })
      .from(trainerRuns)
      .where(and(eq(trainerRuns.ownerId, ownerId), isNull(trainerRuns.claimedAt))),
    db
      .select({ a: daycareSlots.parentAId, b: daycareSlots.parentBId })
      .from(daycareSlots)
      .where(eq(daycareSlots.ownerId, ownerId)),
    db
      .select({ team: dungeonRuns.team })
      .from(dungeonRuns)
      .where(and(eq(dungeonRuns.ownerId, ownerId), isNull(dungeonRuns.claimedAt))),
    db.select({ id: assistants.pokemonId }).from(assistants).where(eq(assistants.ownerId, ownerId)),
  ]);
  const activities = new Map<string, PokemonActivity>();
  for (const r of running) for (const id of r.team) activities.set(id, 'expedition');
  for (const b of battles) for (const id of b.team) activities.set(id, 'battle');
  for (const r of runs) for (const id of r.team) activities.set(id, 'dungeon');
  for (const p of pensions) {
    for (const id of [p.a, p.b]) if (id) activities.set(id, 'daycare');
  }
  for (const h of helpers) activities.set(h.id, 'assistant');
  return activities;
}

/**
 * Disponibilité commune aux expéditions, combats et pensions : un Pokémon occupé, K.O. ou en
 * soins au Centre Pokémon ne peut pas être engagé. Lève `POKEMON_BUSY`, `POKEMON_KO` ou
 * `POKEMON_HEALING`.
 */
export async function assertAvailable(
  db: Db,
  ownerId: string,
  rows: readonly PokemonRow[],
  now: Date,
): Promise<void> {
  const busy = await pokemonActivities(db, ownerId);
  if (rows.some((r) => busy.has(r.id))) throw new GameError(409, 'POKEMON_BUSY');
  if (rows.some((r) => r.knockedOut)) throw new GameError(409, 'POKEMON_KO');
  const healing = rows.filter((r) => isHealing(r.healUntil, now));
  if (healing.length > 0) {
    throw new GameError(409, 'POKEMON_HEALING', {
      healUntil: new Date(Math.max(...healing.map((r) => r.healUntil!.getTime()))).toISOString(),
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

/**
 * Refuse de commencer quelque chose dans un onglet pas encore débloqué (déposer, planter, lancer).
 * Récupérer ou annuler ce qui est déjà en cours reste permis.
 */
export async function assertTabUnlocked(
  db: Db,
  ctx: GameContext,
  ownerId: string,
  tab: MenuTabId,
): Promise<void> {
  if (tabUnlock(ctx.content.balance, tab).type === 'always') return;
  if (!isTabUnlocked(ctx, tab, await playerProgress(db, ctx, ownerId))) {
    throw new GameError(403, 'TAB_LOCKED', { tab });
  }
}

/**
 * Places ouvertes d'un bâtiment (emplacements d'expédition, pensions, couveuses, places du Musée,
 * parcelles, Centres) : départ + paliers remplis, + récompenses réclamées pour les expéditions,
 * les pensions et les couveuses.
 */
export async function playerFacilityPlaces(
  db: Db,
  ctx: GameContext,
  ownerId: string,
  facility: FacilityId,
): Promise<number> {
  const [progress, claimed] = await Promise.all([
    facilityUnlocks(ctx, facility).length > 0
      ? playerProgress(db, ctx, ownerId)
      : {
          caughtSpeciesIds: new Set<number>(),
          defeatedTrainerIds: new Set<string>(),
          eggsHatched: 0,
        },
    facility === 'expedition' || facility === 'daycare' || facility === 'incubator'
      ? claimedRewards(db, ownerId)
      : NO_CLAIMS,
  ]);
  return facilityPlaces(ctx, facility, progress, claimed);
}

/** Emplacements d'expédition et pensions ouverts au joueur (récompenses et paliers des bâtiments). */
export async function playerSlotsNow(
  db: Db,
  ctx: GameContext,
  ownerId: string,
): Promise<PlayerSlots> {
  const [expeditions, daycare] = await Promise.all([
    playerFacilityPlaces(db, ctx, ownerId, 'expedition'),
    playerFacilityPlaces(db, ctx, ownerId, 'daycare'),
  ]);
  return { expeditions, daycare };
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
 * Récompenses de progression réclamées : collections, quêtes et complétions d'expédition
 * (emplacements et bonus permanents en découlent).
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
    collectionIds: ids('collection'),
    questIds: new Set(quests.map((q) => q.questId)),
    completionIds: ids('completion'),
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

/**
 * Multiplicateur shiny des œufs et des fossiles : Charme Chroma possédé × bonus permanent de
 * chance shiny (récompenses réclamées).
 */
export async function shinyBoost(db: Db, ctx: GameContext, ownerId: string): Promise<number> {
  const [charm, claimed] = await Promise.all([
    shinyCharm(db, ctx, ownerId),
    claimedRewards(db, ownerId),
  ]);
  return charm * playerBonuses(ctx, claimed).shiny;
}

export async function itemQuantity(db: Db, ownerId: string, itemId: string): Promise<number> {
  const [row] = await db
    .select({ quantity: inventory.quantity })
    .from(inventory)
    .where(and(eq(inventory.ownerId, ownerId), eq(inventory.itemId, itemId)));
  return row?.quantity ?? 0;
}

/** Nouveautés du Pokédex après une capture, une éclosion, une évolution… */
export interface NewInDex {
  newSpeciesIds: number[];
  newFormIds: number[];
}

/** Pokémon rencontré (expédition, combat) : son espèce, sa forme et sa version shiny sont vues. */
export type SeenPokemon = Pick<PokemonInstance, 'speciesId' | 'formId' | 'isShiny'>;

/**
 * Met à jour le Pokédex : espèces et formes vues, Pokémon capturés (espèce, forme, shiny).
 * Retourne les espèces et les formes capturées pour la première fois.
 */
export async function recordPokedex(
  db: Db,
  ownerId: string,
  {
    seen = [],
    seenShiny = [],
    met = [],
    caught,
    at,
  }: {
    seen?: Iterable<number>;
    /** Espèces rencontrées en version shiny (capturées ou non). */
    seenShiny?: Iterable<number>;
    /** Pokémon rencontrés, capturés ou non : espèce, forme et version shiny vues. */
    met?: readonly SeenPokemon[];
    caught: readonly Pick<PokemonInstance, 'speciesId' | 'formId' | 'isShiny'>[];
    at: Date;
  },
): Promise<NewInDex> {
  const caughtSet = new Set(caught.map((p) => p.speciesId));
  const shinySet = new Set(caught.filter((p) => p.isShiny).map((p) => p.speciesId));
  const seenShinySet = new Set([
    ...seenShiny,
    ...shinySet,
    ...met.filter((p) => p.isShiny).map((p) => p.speciesId),
  ]);
  const all = new Set([...seen, ...met.map((p) => p.speciesId), ...seenShinySet, ...caughtSet]);
  if (all.size === 0) return { newSpeciesIds: [], newFormIds: [] };
  // Formes vues par espèce (rencontrées ou capturées).
  const seenForms = new Map<number, { all: Set<number>; shiny: Set<number> }>();
  for (const p of [...met, ...caught]) {
    if (p.formId == null) continue;
    const forms = seenForms.get(p.speciesId) ?? { all: new Set(), shiny: new Set() };
    forms.all.add(p.formId);
    if (p.isShiny) forms.shiny.add(p.formId);
    seenForms.set(p.speciesId, forms);
  }

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
    const forms = seenForms.get(speciesId);
    await db
      .insert(pokedex)
      .values({
        ownerId,
        speciesId,
        seen: true,
        caught: isCaught,
        caughtShiny: isShiny,
        seenShiny: seenShinySet.has(speciesId),
        seenFormIds: [...(forms?.all ?? [])],
        seenShinyFormIds: [...(forms?.shiny ?? [])],
        firstCaughtAt: isCaught ? at : null,
      })
      .onConflictDoUpdate({
        target: [pokedex.ownerId, pokedex.speciesId],
        set: {
          seen: true,
          caught: sql`${pokedex.caught} or excluded.caught`,
          caughtShiny: sql`${pokedex.caughtShiny} or excluded.caught_shiny`,
          seenShiny: sql`${pokedex.seenShiny} or excluded.seen_shiny`,
          seenFormIds: sql`array(select distinct unnest(${pokedex.seenFormIds} || excluded.seen_form_ids) order by 1)`,
          seenShinyFormIds: sql`array(select distinct unnest(${pokedex.seenShinyFormIds} || excluded.seen_shiny_form_ids) order by 1)`,
          firstCaughtAt: sql`coalesce(${pokedex.firstCaughtAt}, excluded.first_caught_at)`,
        },
      });
  }

  const formsShiny = new Map<number, boolean>();
  for (const p of caught) {
    if (p.formId != null)
      formsShiny.set(p.formId, (formsShiny.get(p.formId) ?? false) || p.isShiny);
  }
  const formsBefore =
    formsShiny.size === 0
      ? []
      : await db
          .select({ formId: pokedexForms.formId })
          .from(pokedexForms)
          .where(
            and(
              eq(pokedexForms.ownerId, ownerId),
              inArray(pokedexForms.formId, [...formsShiny.keys()]),
            ),
          );
  const formsAlreadyCaught = new Set(formsBefore.map((r) => r.formId));
  for (const [formId, isShiny] of formsShiny) {
    await db
      .insert(pokedexForms)
      .values({ ownerId, formId, caughtShiny: isShiny, firstCaughtAt: at })
      .onConflictDoUpdate({
        target: [pokedexForms.ownerId, pokedexForms.formId],
        set: { caughtShiny: sql`${pokedexForms.caughtShiny} or excluded.caught_shiny` },
      });
  }
  return {
    newSpeciesIds: [...caughtSet].filter((id) => !alreadyCaught.has(id)),
    newFormIds: [...formsShiny.keys()].filter((id) => !formsAlreadyCaught.has(id)),
  };
}

/** Pokédex normal et shiny et formes capturées (collections, complétions d'expédition). */
export async function dexCatches(db: Db, ownerId: string): Promise<Required<DexCatches>> {
  const rows = await db
    .select({ speciesId: pokedex.speciesId, shiny: pokedex.caughtShiny })
    .from(pokedex)
    .where(and(eq(pokedex.ownerId, ownerId), eq(pokedex.caught, true)));
  const forms = await db
    .select({ formId: pokedexForms.formId, shiny: pokedexForms.caughtShiny })
    .from(pokedexForms)
    .where(eq(pokedexForms.ownerId, ownerId));
  return {
    caughtSpeciesIds: new Set(rows.map((r) => r.speciesId)),
    caughtShinySpeciesIds: new Set(rows.filter((r) => r.shiny).map((r) => r.speciesId)),
    caughtFormIds: new Set(forms.map((r) => r.formId)),
    caughtShinyFormIds: new Set(forms.filter((r) => r.shiny).map((r) => r.formId)),
  };
}

/** Espèces et formes déjà capturées (filtre de capture « nouveaux Pokémon »). */
export async function caughtDex(db: Db, ownerId: string): Promise<CaughtDex> {
  const forms = await db
    .select({ formId: pokedexForms.formId })
    .from(pokedexForms)
    .where(eq(pokedexForms.ownerId, ownerId));
  return {
    speciesIds: await caughtSpeciesIds(db, ownerId),
    formIds: new Set(forms.map((r) => r.formId)),
  };
}

export async function caughtSpeciesIds(db: Db, ownerId: string): Promise<Set<number>> {
  const rows = await db
    .select({ speciesId: pokedex.speciesId })
    .from(pokedex)
    .where(and(eq(pokedex.ownerId, ownerId), eq(pokedex.caught, true)));
  return new Set(rows.map((r) => r.speciesId));
}
