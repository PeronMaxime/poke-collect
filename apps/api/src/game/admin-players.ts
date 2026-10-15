import { and, asc, count, eq, inArray, sql } from 'drizzle-orm';
import { playerProfiles, pokedex, pokemon, sessions, speciesCaptures, users } from '@poke/db';
import type { Db } from '@poke/db';
import { STAT_NAMES } from '@poke/data';
import { createRng, generatePokemon, isUnlocked } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type {
  AdminPlayerDetailResponse,
  AdminPlayerDto,
  AdminSpeciesStatsDto,
  AdminTestPokemonDeleteResponse,
  AdminTestPokemonInput,
  AdminTestPokemonResponse,
} from '@poke/shared';
import { toDto } from '../routes/player';
import { GameError } from './errors';
import { newSeed, requireStartedProfile } from './expeditions';
import { trainerCard } from './stats';
import { playerProgress, pokemonActivities, recordPokedex } from './store';

/**
 * Dernière activité connue : présence enregistrée à chaque requête, complétée par la dernière
 * connexion ou prolongation de session (joueurs pas revenus depuis l'ajout du suivi de présence).
 */
const lastSeen = sql<Date | null>`greatest(${users.lastSeenAt}, (
  select max(${sessions.updatedAt}) from ${sessions} where ${sessions.userId} = ${users.id}
))`.mapWith((v: string | Date | null) => (v === null ? null : new Date(v)));

const playerColumns = {
  id: users.id,
  email: users.email,
  name: users.name,
  role: users.role,
  createdAt: users.createdAt,
  lastSeenAt: lastSeen,
  trainerName: playerProfiles.trainerName,
  starterSpeciesId: playerProfiles.starterSpeciesId,
};

const playersQuery = (db: Db) =>
  db
    .select(playerColumns)
    .from(users)
    .leftJoin(playerProfiles, eq(playerProfiles.userId, users.id));

type PlayerRow = Awaited<ReturnType<typeof playersQuery>>[number];

function playerDto(row: PlayerRow): AdminPlayerDto {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    trainerName: row.trainerName,
    starterSpeciesId: row.starterSpeciesId,
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
  };
}

/** Tous les comptes inscrits (le filtrage et le tri se font dans l'administration). */
export async function listPlayers(db: Db): Promise<AdminPlayerDto[]> {
  const rows = await playersQuery(db).orderBy(asc(users.createdAt));
  return rows.map(playerDto);
}

/** Fiche dresseur d'un joueur, ou null s'il n'existe pas. */
export async function playerDetail(
  db: Db,
  ctx: GameContext,
  userId: string,
): Promise<AdminPlayerDetailResponse | null> {
  const [row] = await playersQuery(db).where(eq(users.id, userId));
  if (!row) return null;
  const [profile] = await db.select().from(playerProfiles).where(eq(playerProfiles.userId, userId));
  if (!profile) {
    return {
      player: playerDto(row),
      profile: null,
      card: null,
      speciesCaught: 0,
      shinySpeciesCaught: 0,
      badges: [],
    };
  }

  const [card, progress, [dex]] = await Promise.all([
    trainerCard(db, userId),
    playerProgress(db, ctx, userId),
    db
      .select({
        caught: count(sql`case when ${pokedex.caught} then 1 end`),
        shiny: count(sql`case when ${pokedex.caughtShiny} then 1 end`),
      })
      .from(pokedex)
      .where(eq(pokedex.ownerId, userId)),
  ]);

  const badges = ctx.regions
    .filter((r) => isUnlocked(ctx, r.unlock, progress))
    .map((region) => ({
      regionId: region.id,
      regionName: region.name,
      badges: ctx.trainers
        .filter((t) => t.badge && t.regionId === region.id)
        .map((t) => ({
          trainerId: t.id,
          trainerName: t.name,
          name: t.badge!.name,
          image: t.badge!.image ?? null,
          earned: progress.defeatedTrainerIds.has(t.id),
        })),
    }))
    .filter((r) => r.badges.length > 0);

  return {
    player: playerDto(row),
    profile: toDto(profile),
    card,
    speciesCaught: dex?.caught ?? 0,
    shinySpeciesCaught: dex?.shiny ?? 0,
    badges,
  };
}

/**
 * Pokémon de chaque espèce obtenus depuis le début (espèce d'obtention, transférés compris),
 * possédés actuellement (espèce actuelle), transférés, et joueurs qui l'ont capturée.
 */
export async function speciesStats(db: Db): Promise<AdminSpeciesStatsDto[]> {
  const [captured, owned, dex] = await Promise.all([
    db.select().from(speciesCaptures),
    db
      .select({ speciesId: pokemon.speciesId, owned: count() })
      .from(pokemon)
      .groupBy(pokemon.speciesId),
    db
      .select({ speciesId: pokedex.speciesId, trainers: count() })
      .from(pokedex)
      .where(eq(pokedex.caught, true))
      .groupBy(pokedex.speciesId),
  ]);
  const stats = new Map<number, AdminSpeciesStatsDto>();
  const entry = (speciesId: number) =>
    stats.get(speciesId) ??
    stats
      .set(speciesId, {
        speciesId,
        captured: 0,
        capturedShiny: 0,
        owned: 0,
        transferred: 0,
        trainers: 0,
      })
      .get(speciesId)!;
  for (const r of captured) {
    Object.assign(entry(r.speciesId), {
      captured: r.captured,
      capturedShiny: r.shiny,
      transferred: r.transferred,
    });
  }
  for (const r of owned) entry(r.speciesId).owned = r.owned;
  for (const r of dex) entry(r.speciesId).trainers = r.trainers;
  return [...stats.values()].sort((a, b) => a.speciesId - b.speciesId);
}

/** Pokémon de chaque type gardés dans le panel du lot de test. */
const TEST_PANEL_PER_TYPE = 2;

const baseStatTotal = (s: { baseStats: Record<string, number> }) =>
  Object.values(s.baseStats).reduce((a, b) => a + b, 0);

/** Espèces du lot de test : lignées des donjons de la région, puis les plus fortes par type. */
export function testPokemonSpecies(
  ctx: GameContext,
  regionId: string,
  legendaries: boolean,
): number[] {
  const region = ctx.region(regionId);
  if (!region) return [];
  const ids = new Set<number>();
  for (const d of ctx.dungeons) {
    if (d.regionId === regionId) for (const id of d.familySpeciesIds) ids.add(id);
  }
  const regional = region.speciesIds
    .map((id) => ctx.species(id))
    .filter((s) => s !== undefined)
    .filter((s) => !s.isBaby && (legendaries || (!s.isLegendary && !s.isMythical)))
    .sort((a, b) => baseStatTotal(b) - baseStatTotal(a) || a.id - b.id);
  const types = new Set(regional.flatMap((s) => s.types));
  for (const type of types) {
    for (const s of regional.filter((s) => s.types.includes(type)).slice(0, TEST_PANEL_PER_TYPE)) {
      ids.add(s.id);
    }
  }
  if (legendaries) {
    for (const s of regional) if (s.isLegendary || s.isMythical) ids.add(s.id);
  }
  return [...ids].sort((a, b) => a - b);
}

/**
 * Donne un lot de Pokémon de test à un administrateur (origine `admin`) et les inscrit au
 * Pokédex, ce qui rend visibles les donjons de la région. Les statistiques de capture globales
 * ne sont pas touchées. Lève `NOT_FOUND`, `NOT_ADMIN`, `NO_PROFILE` ou `REGION_NOT_FOUND`.
 */
export async function giveTestPokemon(
  db: Db,
  ctx: GameContext,
  userId: string,
  input: AdminTestPokemonInput,
  now: Date,
): Promise<AdminTestPokemonResponse> {
  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
  if (!user) throw new GameError(404, 'NOT_FOUND');
  if (user.role !== 'admin') throw new GameError(403, 'NOT_ADMIN');
  await requireStartedProfile(db, userId);
  if (!ctx.region(input.regionId)) throw new GameError(404, 'REGION_NOT_FOUND');

  const speciesIds = testPokemonSpecies(ctx, input.regionId, input.legendaries);
  const rng = createRng(newSeed());
  const list = speciesIds.map((speciesId) => {
    const p = generatePokemon(ctx, rng, speciesId, input.level, { shinyProbability: 0 });
    if (!input.perfectIvs) return p;
    const ivs = Object.fromEntries(STAT_NAMES.map((s) => [s, 31])) as typeof p.ivs;
    return { ...p, ivs };
  });
  await db.transaction(async (tx) => {
    await tx.insert(pokemon).values(
      list.map((p) => ({
        ownerId: userId,
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
        origin: 'admin' as const,
        originRegion: input.regionId,
        caughtAt: now,
      })),
    );
    await recordPokedex(tx, userId, { seen: speciesIds, caught: list, at: now });
  });
  return { added: list.length, speciesIds };
}

/**
 * Supprime les Pokémon du lot de test (origine `admin`) d'un administrateur, sauf ceux occupés
 * (expédition, combat, donjon, pension). Le Pokédex est laissé tel quel. Lève `NOT_FOUND`,
 * `NOT_ADMIN` ou `LAST_POKEMON` (il ne resterait aucun Pokémon au joueur).
 */
export async function deleteTestPokemon(
  db: Db,
  userId: string,
): Promise<AdminTestPokemonDeleteResponse> {
  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
  if (!user) throw new GameError(404, 'NOT_FOUND');
  if (user.role !== 'admin') throw new GameError(403, 'NOT_ADMIN');
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: pokemon.id })
      .from(pokemon)
      .where(and(eq(pokemon.ownerId, userId), eq(pokemon.origin, 'admin')));
    const activities = await pokemonActivities(tx, userId);
    const ids = rows.map((r) => r.id).filter((id) => !activities.has(id));
    const [{ value: owned } = { value: 0 }] = await tx
      .select({ value: count() })
      .from(pokemon)
      .where(eq(pokemon.ownerId, userId));
    if (ids.length > 0 && owned - ids.length < 1) throw new GameError(409, 'LAST_POKEMON');
    if (ids.length > 0) {
      await tx.delete(pokemon).where(and(eq(pokemon.ownerId, userId), inArray(pokemon.id, ids)));
    }
    return { deleted: ids.length, busy: rows.length - ids.length };
  });
}
