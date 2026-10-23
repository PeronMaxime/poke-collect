import { asc, isNotNull, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { playerProfiles, pokedex, pokedexForms, trainerProgress } from '@poke/db';
import type { Db } from '@poke/db';
import { dexForms } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type { LeaderboardEntryDto, LeaderboardKind, LeaderboardResponse } from '@poke/shared';

/** Nombre de dresseurs affichés en tête de classement. */
export const LEADERBOARD_SIZE = 50;

/** Formes qui ont leur case au Pokédex (régionales, Méga…) : comptées avec les espèces. */
const DEX_FORM_IDS = sql.join(
  dexForms().map((f) => sql`${f.id}`),
  sql`, `,
);

/** Espèces capturées (ou en shiny) et formes du Pokédex capturées (sous-requêtes corrélées). */
function caughtCount(shiny: boolean): SQL {
  return sql`((select count(*) from ${pokedex}
      where ${pokedex.ownerId} = ${playerProfiles.userId}
        and ${shiny ? pokedex.caughtShiny : pokedex.caught})
    + (select count(*) from ${pokedexForms}
      where ${pokedexForms.ownerId} = ${playerProfiles.userId}
        and ${pokedexForms.formId} in (${DEX_FORM_IDS})
        ${shiny ? sql`and ${pokedexForms.caughtShiny}` : sql``}))`;
}

/** Valeur classée de chaque joueur (sous-requête corrélée au profil). */
function rankedValue(ctx: GameContext, kind: LeaderboardKind): SQL {
  switch (kind) {
    case 'species':
      return caughtCount(false);
    case 'shiny':
      return caughtCount(true);
    case 'money':
      return sql`${playerProfiles.currency}`;
    case 'badges': {
      // Un badge = un dresseur à badge battu au moins une fois (comme `earnedBadges`).
      const ids = ctx.trainers.filter((t) => t.badge).map((t) => t.id);
      if (ids.length === 0) return sql`0`;
      return sql`(select count(*) from ${trainerProgress}
        where ${trainerProgress.ownerId} = ${playerProfiles.userId}
          and ${trainerProgress.wins} > 0
          and ${trainerProgress.trainerId} in (${sql.join(
            ids.map((id) => sql`${id}`),
            sql`, `,
          )}))`;
    }
  }
}

/** Classement des dresseurs ayant commencé l'aventure (starter choisi). */
export async function leaderboard(
  db: Db,
  ctx: GameContext,
  userId: string,
  kind: LeaderboardKind,
): Promise<LeaderboardResponse> {
  const value = rankedValue(ctx, kind);
  const ranked = db.$with('ranked').as(
    db
      .select({
        userId: playerProfiles.userId,
        trainerName: playerProfiles.trainerName,
        starterSpeciesId: playerProfiles.starterSpeciesId,
        value: sql<number>`${value}`.mapWith(Number).as('value'),
        rank: sql<number>`rank() over (order by ${value} desc)`.mapWith(Number).as('rank'),
      })
      .from(playerProfiles)
      .where(isNotNull(playerProfiles.starterSpeciesId)),
  );
  const rows = await db
    .with(ranked)
    .select()
    .from(ranked)
    .orderBy(asc(ranked.rank), asc(sql`lower(${ranked.trainerName})`));

  const toEntry = (row: (typeof rows)[number]): LeaderboardEntryDto => ({
    rank: row.rank,
    trainerName: row.trainerName,
    starterSpeciesId: row.starterSpeciesId,
    value: row.value,
    isMe: row.userId === userId,
  });
  const mine = rows.find((r) => r.userId === userId);
  return {
    kind,
    entries: rows.slice(0, LEADERBOARD_SIZE).map(toEntry),
    me: mine ? toEntry(mine) : null,
    total: rows.length,
  };
}
