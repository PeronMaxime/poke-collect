import { asc, count, eq, sql } from 'drizzle-orm';
import { playerProfiles, pokedex, sessions, users } from '@poke/db';
import type { Db } from '@poke/db';
import { isUnlocked } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type { AdminPlayerDetailResponse, AdminPlayerDto } from '@poke/shared';
import { toDto } from '../routes/player';
import { trainerCard } from './stats';
import { playerProgress } from './store';

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
