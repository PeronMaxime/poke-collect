import { and, eq, inArray } from 'drizzle-orm';
import { pokemon, questProgress } from '@poke/db';
import type { Db } from '@poke/db';
import { roamingTarget } from '@poke/game-core';
import type { ExpeditionResult, ExpeditionRoamer, GameContext } from '@poke/game-core';
import { toInstance } from '../store';

/**
 * Aides partagées par les modules des expéditions. Interne au dossier.
 */

/** Résultat vide : aucune rencontre, rien d'utilisé. */
export const EMPTY_RESULT: ExpeditionResult = {
  encounters: [],
  loot: [],
  team: [],
  xpPerMember: 0,
  pity: {},
  ballsUsed: 0,
  berriesUsed: 0,
  encounterBerriesUsed: 0,
  shinyChance: 0,
};

export const minutesAfter = (date: Date, minutes: number) =>
  new Date(date.getTime() + minutes * 60_000);

/** Équipe d'une expédition, dans l'ordre du départ : le premier est en tête (talents). */
export async function expeditionTeam(db: Db, userId: string, ids: string[]) {
  return (await expeditionTeams(db, userId, [ids]))[0]!;
}

/** Équipes de plusieurs expéditions en une seule requête (même ordre que `teams`). */
export async function expeditionTeams(db: Db, userId: string, teams: readonly string[][]) {
  const wanted = [...new Set(teams.flat())];
  const rows = wanted.length
    ? await db
        .select()
        .from(pokemon)
        .where(and(eq(pokemon.ownerId, userId), inArray(pokemon.id, wanted)))
    : [];
  const byId = new Map(rows.map((r) => [r.id, toInstance(r)]));
  return teams.map((ids) => ids.flatMap((id) => byId.get(id) ?? []));
}

/**
 * Fuyards emportés par une expédition, à la réclamation : ceux qui sont toujours à capturer (le
 * même Pokémon de la récompense, toujours fuyard dans la version de départ).
 */
export async function expeditionRoamers(
  db: Db,
  ctx: GameContext,
  userId: string,
  snapshot: readonly { questId: string; pokemonIndex: number }[],
): Promise<ExpeditionRoamer[]> {
  if (snapshot.length === 0) return [];
  const rows = await db
    .select({ questId: questProgress.questId, pokemonCaught: questProgress.pokemonCaught })
    .from(questProgress)
    .where(
      and(
        eq(questProgress.ownerId, userId),
        inArray(
          questProgress.questId,
          snapshot.map((r) => r.questId),
        ),
      ),
    );
  return snapshot.flatMap(({ questId, pokemonIndex }) => {
    const row = rows.find((r) => r.questId === questId);
    const quest = ctx.quest(questId);
    const target =
      row?.pokemonCaught === pokemonIndex && quest && roamingTarget(quest, pokemonIndex);
    return target ? [{ questId, target }] : [];
  });
}
