import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  assistants,
  candies,
  daycareSlots,
  dungeonRuns,
  expeditions,
  pokemon,
  pokemonTags,
  trainerRuns,
  legendaryBattles,
} from '@poke/db';
import type { Db } from '@poke/db';
import { isHealing, lineageId, NO_ABILITY, transferCandies } from '@poke/game-core';
import type { GameContext, PokemonInstance, TeamMember } from '@poke/game-core';
import type { PokemonActivity, PokemonDto, PokemonOrigin, UpdatePokemonInput } from '@poke/shared';
import { countSpecies } from '../capture-stats';
import { GameError } from '../errors';
import { addItems } from './inventory';

/**
 * Les Pokémon d'un joueur : lecture du PC, création (capture, éclosion, starter), disponibilité
 * et transfert.
 *
 * Un Pokémon est **occupé** tant qu'il est en expédition, en combat, en donjon, à la pension, au
 * Centre ou assistant d'un bâtiment (`pokemonActivities`) : `assertAvailable` refuse alors de
 * l'engager ailleurs. Le transfert le supprime et rend des Bonbons de sa lignée.
 */

/** Accès en base à l'état d'un joueur (Pokémon, inventaire, Pokédex). */

export type PokemonRow = typeof pokemon.$inferSelect;

/** Le Pokémon enregistré, sous la forme que les règles du jeu attendent (`@poke/game-core`). */
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

/** Le Pokémon tel que le jeu le reçoit ; `activity` dit ce qui l'occupe (null : disponible). */
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

/**
 * Ajoute des Pokémon au PC du joueur (capture, éclosion, starter…) et les compte dans les
 * statistiques d'espèces.
 */
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
  await countSpecies(db, captures);
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
  const [running, battles, legendary, pensions, runs, helpers] = await Promise.all([
    db
      .select({ team: expeditions.team })
      .from(expeditions)
      .where(and(eq(expeditions.ownerId, ownerId), isNull(expeditions.claimedAt))),
    db
      .select({ team: trainerRuns.team })
      .from(trainerRuns)
      .where(and(eq(trainerRuns.ownerId, ownerId), isNull(trainerRuns.claimedAt))),
    db
      .select({ team: legendaryBattles.team })
      .from(legendaryBattles)
      .where(and(eq(legendaryBattles.ownerId, ownerId), isNull(legendaryBattles.claimedAt))),
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
  for (const b of [...battles, ...legendary]) for (const id of b.team) activities.set(id, 'battle');
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
 * Supprime des Pokémon du joueur contre des Bonbons de lignée (Méga-Gemmes tenues rendues au sac,
 * transferts comptés par espèce), sans vérification : à l'appelant de s'assurer qu'ils peuvent
 * partir (transfert du PC, transfert automatique au retour d'expédition). À appeler dans une
 * transaction : si un Pokémon a déjà disparu (transfert simultané), lève `POKEMON_NOT_FOUND`.
 */
export async function transferRows(
  db: Db,
  ctx: GameContext,
  ownerId: string,
  rows: readonly PokemonRow[],
): Promise<{ lineageId: number; quantity: number }[]> {
  if (rows.length === 0) return [];
  const gained = new Map<number, number>();
  for (const r of rows) {
    const lineage = lineageId(ctx, r.speciesId);
    if (lineage === undefined) continue;
    gained.set(lineage, (gained.get(lineage) ?? 0) + transferCandies(ctx, r));
  }
  // Seules les lignes réellement supprimées comptent : un transfert simultané des mêmes Pokémon
  // (double clic, deux onglets) en supprimerait moins, et l'appelant annule alors sa transaction
  // au lieu de créditer deux fois les Bonbons.
  const deleted = await db
    .delete(pokemon)
    .where(
      and(
        eq(pokemon.ownerId, ownerId),
        inArray(
          pokemon.id,
          rows.map((r) => r.id),
        ),
      ),
    )
    .returning({ id: pokemon.id });
  if (deleted.length !== new Set(rows.map((r) => r.id)).size) {
    throw new GameError(404, 'POKEMON_NOT_FOUND');
  }
  const candyValues = [...gained]
    .filter(([, quantity]) => quantity > 0)
    .map(([lineage, quantity]) => ({ ownerId, lineageId: lineage, quantity }));
  if (candyValues.length > 0) {
    await db
      .insert(candies)
      .values(candyValues)
      .onConflictDoUpdate({
        target: [candies.ownerId, candies.lineageId],
        set: { quantity: sql`${candies.quantity} + excluded.quantity` },
      });
  }
  await addItems(
    db,
    ownerId,
    rows.flatMap((r) => (r.megaStone ? [{ itemId: r.megaStone, quantity: 1 }] : [])),
  );
  const transferred = new Map<number, number>();
  for (const r of rows) transferred.set(r.speciesId, (transferred.get(r.speciesId) ?? 0) + 1);
  await countSpecies(
    db,
    new Map([...transferred].map(([speciesId, n]) => [speciesId, { transferred: n }])),
  );
  return [...gained].map(([lineage, quantity]) => ({ lineageId: lineage, quantity }));
}

/** Tous les Pokémon du joueur, du plus ancien au plus récent, avec ce qui les occupe. */
export async function listPokemon(db: Db, userId: string): Promise<PokemonDto[]> {
  const [rows, busy] = await Promise.all([
    db
      .select()
      .from(pokemon)
      .where(eq(pokemon.ownerId, userId))
      .orderBy(asc(pokemon.caughtAt), asc(pokemon.id)),
    pokemonActivities(db, userId),
  ]);
  return rows.map((r) => toPokemonDto(r, busy.get(r.id)));
}

/**
 * Verrouille un Pokémon (protégé du transfert) ou change ses étiquettes ; un champ absent n'est
 * pas modifié. Refus : `TAG_NOT_FOUND` (étiquette d'un autre joueur), `POKEMON_NOT_FOUND`.
 */
export async function updatePokemon(
  db: Db,
  userId: string,
  pokemonId: string,
  { locked, tagIds: requested }: UpdatePokemonInput,
): Promise<PokemonDto> {
  const tagIds = requested && [...new Set(requested)];
  if (tagIds?.length) {
    const owned = await db
      .select({ id: pokemonTags.id })
      .from(pokemonTags)
      .where(and(inArray(pokemonTags.id, tagIds), eq(pokemonTags.ownerId, userId)));
    if (owned.length !== tagIds.length) {
      throw new GameError(404, 'TAG_NOT_FOUND');
    }
  }
  const [row] = await db
    .update(pokemon)
    .set({ locked, tagIds })
    .where(and(eq(pokemon.id, pokemonId), eq(pokemon.ownerId, userId)))
    .returning();
  if (!row) throw new GameError(404, 'POKEMON_NOT_FOUND');
  const busy = await pokemonActivities(db, userId);
  return toPokemonDto(row, busy.get(row.id));
}
