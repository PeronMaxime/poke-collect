import { and, count, eq, gt, inArray, isNotNull, sql, sum } from 'drizzle-orm';
import {
  dungeonProgress,
  eggs,
  expeditions,
  fossilRevivals,
  inventory,
  pokemon,
  questProgress,
  shopPurchases,
  trainerProgress,
} from '@poke/db';
import type { Db } from '@poke/db';
import type { GameContext } from '@poke/game-core';
import type { TrainerCardResponse } from '@poke/shared';

/** Statistiques de la Fiche Dresseur, recalculées à partir de l'historique du joueur. */
export async function trainerCard(
  db: Db,
  ctx: GameContext,
  ownerId: string,
): Promise<TrainerCardResponse> {
  const gemIds = ctx.content.items.filter((i) => i.category === 'megaStone').map((i) => i.id);
  const [
    captures,
    owned,
    claimedExpeditions,
    battles,
    hatched,
    revived,
    quests,
    spent,
    dungeons,
    bagGems,
    heldGems,
  ] = await Promise.all([
    // Rencontres capturées de chaque expédition réclamée (les Pokémon transférés comptent).
    db
      .select({
        n: sql<number>`coalesce(sum((
            select count(*) from jsonb_array_elements(${expeditions.result}->'encounters') as e
            where e->>'outcome' = 'captured'
          )), 0)`.mapWith(Number),
        // Shiny croisés mais repartis (fuite, ignorés, plus de Ball…).
        missedShinies: sql<number>`coalesce(sum((
            select count(*) from jsonb_array_elements(${expeditions.result}->'encounters') as e
            where (e->>'isShiny')::boolean and e->>'outcome' <> 'captured'
          )), 0)`.mapWith(Number),
      })
      .from(expeditions)
      .where(and(eq(expeditions.ownerId, ownerId), isNotNull(expeditions.result))),
    db
      .select({
        n: count(),
        shiny: sql<number>`count(*) filter (where ${pokemon.isShiny})`.mapWith(Number),
      })
      .from(pokemon)
      .where(eq(pokemon.ownerId, ownerId)),
    db
      .select({ n: count() })
      .from(expeditions)
      .where(and(eq(expeditions.ownerId, ownerId), isNotNull(expeditions.claimedAt))),
    db
      .select({
        wins: sum(trainerProgress.wins).mapWith(Number),
        losses: sum(trainerProgress.losses).mapWith(Number),
        defeated: sql<number>`count(*) filter (where ${trainerProgress.wins} > 0)`.mapWith(Number),
      })
      .from(trainerProgress)
      .where(eq(trainerProgress.ownerId, ownerId)),
    db
      .select({ n: count() })
      .from(eggs)
      .where(and(eq(eggs.ownerId, ownerId), eq(eggs.hatched, true))),
    db
      .select({ n: count() })
      .from(fossilRevivals)
      .where(and(eq(fossilRevivals.ownerId, ownerId), isNotNull(fossilRevivals.revivedAt))),
    db
      .select({ n: count() })
      .from(questProgress)
      .where(and(eq(questProgress.ownerId, ownerId), isNotNull(questProgress.claimedAt))),
    db
      .select({ total: sum(shopPurchases.totalPrice).mapWith(Number) })
      .from(shopPurchases)
      .where(eq(shopPurchases.ownerId, ownerId)),
    db
      .select({ n: count() })
      .from(dungeonProgress)
      .where(and(eq(dungeonProgress.ownerId, ownerId), gt(dungeonProgress.wins, 0))),
    // Méga-Gemmes : dans le sac, ou tenues par un Pokémon Méga-Évolué.
    gemIds.length
      ? db
          .select({ itemId: inventory.itemId })
          .from(inventory)
          .where(
            and(
              eq(inventory.ownerId, ownerId),
              inArray(inventory.itemId, gemIds),
              gt(inventory.quantity, 0),
            ),
          )
      : [],
    db
      .select({ itemId: pokemon.megaStone })
      .from(pokemon)
      .where(and(eq(pokemon.ownerId, ownerId), isNotNull(pokemon.megaStone))),
  ]);
  return {
    captures: captures[0]?.n ?? 0,
    pokemonOwned: owned[0]?.n ?? 0,
    shiniesOwned: owned[0]?.shiny ?? 0,
    shiniesMissed: captures[0]?.missedShinies ?? 0,
    expeditionsCompleted: claimedExpeditions[0]?.n ?? 0,
    battlesWon: battles[0]?.wins ?? 0,
    battlesLost: battles[0]?.losses ?? 0,
    trainersDefeated: battles[0]?.defeated ?? 0,
    eggsHatched: hatched[0]?.n ?? 0,
    fossilsRevived: revived[0]?.n ?? 0,
    questsCompleted: quests[0]?.n ?? 0,
    moneySpent: spent[0]?.total ?? 0,
    dungeonsCleared: dungeons[0]?.n ?? 0,
    megaStonesOwned: new Set([...bagGems, ...heldGems].map((g) => g.itemId)).size,
  };
}
