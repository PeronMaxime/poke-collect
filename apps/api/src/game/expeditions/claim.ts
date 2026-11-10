import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { expeditions, pityCounters, pokemon, questProgress } from '@poke/db';
import type { Db } from '@poke/db';
import {
  autoTransferIndexes,
  hiddenEscapeIndexes,
  playerBonuses,
  resolveExpedition,
  roamerFleeZoneId,
  roamingZones,
  weatherHour,
  zoneWeather,
} from '@poke/game-core';
import type { ExpeditionResult } from '@poke/game-core';
import type { StoredExpeditionResult } from '@poke/shared';
import type { ContentCache } from '../../content-cache';
import { GameError } from '../errors';
import { playerTransaction } from '../tx';
import { recordGuildActivity } from '../guilds';
import { syncQuests } from '../quests';
import type { ItemStack } from '@poke/content';
import {
  addItems,
  transferRows,
  caughtDex,
  claimedRewards,
  insertPokemon,
  playerProgress,
  recordPokedex,
  shinyCharm,
} from '../store';
import type { PokemonRow } from '../store';
import type { ExpeditionRow } from './views';
import { planRunInput, preloadExpeditionContent, settleBallsIn } from './balls';
import { EMPTY_RESULT, expeditionRoamers, expeditionTeam } from './common';

/**
 * Réclamation d'une expédition : le résultat est calculé puis appliqué en une transaction.
 */

/** Expédition du joueur qui peut être arrêtée et pas encore réclamée, avec son contenu de départ. */
async function stoppableExpedition(
  db: Db,
  content: ContentCache,
  userId: string,
  expeditionId: string,
  now: Date,
) {
  const [found] = await db
    .select()
    .from(expeditions)
    .where(and(eq(expeditions.id, expeditionId), eq(expeditions.ownerId, userId)));
  if (!found) throw new GameError(404, 'EXPEDITION_NOT_FOUND');
  if (found.claimedAt) throw new GameError(409, 'ALREADY_CLAIMED');
  if (now < found.minEndsAt) {
    throw new GameError(409, 'NOT_FINISHED', { endsAt: found.minEndsAt });
  }
  return { found, ctx: await content.version(found.contentVersionId) };
}

/**
 * Arrête une expédition et la réclame : calcule le résultat (seed, contenu de la version de
 * départ, temps écoulé dans la limite de sa fin) puis l'applique en une transaction. Une
 * expédition ne se réclame qu'une fois. Les étapes de quête en cours avancent (objets de quête
 * trouvés compris).
 */
export async function claimExpedition(
  db: Db,
  content: ContentCache,
  userId: string,
  expeditionId: string,
  now: Date,
): Promise<{ expedition: ExpeditionRow; captured: PokemonRow[] }> {
  const { found, ctx } = await stoppableExpedition(db, content, userId, expeditionId, now);
  // Ancienne expédition légendaire (sans zone) : elle se réclame sans résultat.
  const zone = found.zoneId ? ctx.zone(found.zoneId) : undefined;
  if (!found.questId && !zone) throw new GameError(500, 'ZONE_MISSING_IN_VERSION');
  // Les quêtes suivent le contenu publié, pas la version de départ de l'expédition.
  const current = await content.get();
  if (found.ballPlan) await preloadExpeditionContent(db, content, userId);

  return playerTransaction(db, userId, async (tx) => {
    // Balls des dernières rencontres retirées du sac (toutes expéditions), avant de figer celle-ci.
    if (found.ballPlan) await settleBallsIn(tx, content, userId, now);
    // Verrou : seule la première réclamation passe.
    const [locked] = await tx
      .update(expeditions)
      .set({ claimedAt: now })
      .where(and(eq(expeditions.id, found.id), isNull(expeditions.claimedAt)))
      .returning();
    if (!locked) throw new GameError(409, 'ALREADY_CLAIMED');

    // Balls et baies réservées au départ.
    const { ballItemId, balls, berryItemId, berries } = found;

    const team = await expeditionTeam(tx, userId, found.team);
    const bonuses = playerBonuses(ctx, await claimedRewards(tx, userId));
    const charm = await shinyCharm(tx, ctx, userId);
    const elapsedMinutes =
      (Math.min(now.getTime(), found.endsAt.getTime()) - found.startedAt.getTime()) / 60_000;
    let result: ExpeditionResult;
    if (zone && locked.ballPlan) {
      // Lancers décidés au fil de l'expédition (journal à jour) : les Balls sont déjà retirées.
      result = resolveExpedition(ctx, {
        ...(await planRunInput(tx, ctx, locked, zone, userId)),
        elapsedMinutes,
      });
    } else if (zone) {
      const speciesIds = [...new Set(zone.encounters.map((e) => e.speciesId))];
      const pityRows = await tx
        .select()
        .from(pityCounters)
        .where(and(eq(pityCounters.ownerId, userId), inArray(pityCounters.speciesId, speciesIds)));
      result = resolveExpedition(ctx, {
        zone,
        elapsedMinutes,
        seed: found.seed,
        team,
        balls: found.ballItemId ? { itemId: found.ballItemId, quantity: found.balls } : null,
        berries: found.berryItemId ? { itemId: found.berryItemId, quantity: found.berries } : null,
        encounterBerries: found.encounterBerryItemId
          ? { itemId: found.encounterBerryItemId, quantity: found.encounterBerries }
          : null,
        intervalGrowthMinutes: found.encounterIntervalGrowthMinutes,
        pity: Object.fromEntries(pityRows.map((r) => [r.speciesId, r.misses])),
        bonuses,
        // Chaîne figée au départ ; Charme Chroma possédé à la réclamation.
        shiny: { chain: found.shinyChain, charm, bonus: bonuses.shiny },
        captureFilter: found.captureFilter,
        ...(found.captureFilter?.newOnly && { caught: await caughtDex(tx, userId) }),
        hour: found.localHour,
        weather: zoneWeather(zone, found.startedAt),
        roamers: await expeditionRoamers(tx, ctx, userId, found.roamers),
      });
    } else {
      result = EMPTY_RESULT; // ancienne expédition légendaire : Balls et baies rendues
    }

    const capturedEncounters = result.encounters.filter((e) => e.pokemon);
    const captured = await insertPokemon(
      tx,
      userId,
      capturedEncounters.map((e) => e.pokemon!),
      {
        origin: 'capture',
        originRegion: zone?.regionId ?? null,
        at: now,
      },
    );
    // Fuyard capturé : la quête passe au Pokémon suivant de sa récompense (s'il y en a).
    for (const { questId } of capturedEncounters) {
      const roamer = questId ? found.roamers.find((r) => r.questId === questId) : undefined;
      if (!roamer) continue;
      await tx
        .update(questProgress)
        .set({ pokemonCaught: roamer.pokemonIndex + 1 })
        .where(
          and(
            eq(questProgress.ownerId, userId),
            eq(questProgress.questId, roamer.questId),
            eq(questProgress.pokemonCaught, roamer.pokemonIndex),
          ),
        );
    }
    // Fuyard croisé mais pas capturé : il fuit aussitôt vers une autre zone, jusqu'à l'heure
    // pleine suivante. Pas croisé, il reste où il était (rien à enregistrer).
    const fled = result.encounters.filter((e) => e.questId && !e.pokemon);
    if (zone && fled.length > 0) {
      const progress = await playerProgress(tx, ctx, userId);
      for (const { questId } of fled) {
        const roamer = found.roamers.find((r) => r.questId === questId);
        const regionId = ctx.quest(questId!)?.regionId;
        if (!roamer || !regionId) continue;
        const zoneId = roamerFleeZoneId(roamingZones(ctx, regionId, progress), zone.id, found.seed);
        if (!zoneId) continue;
        await tx
          .update(questProgress)
          .set({
            roamerHideout: { pokemonIndex: roamer.pokemonIndex, hour: weatherHour(now), zoneId },
          })
          .where(
            and(
              eq(questProgress.ownerId, userId),
              eq(questProgress.questId, roamer.questId),
              eq(questProgress.pokemonCaught, roamer.pokemonIndex),
            ),
          );
      }
    }
    // Pokédex avant les captures de cette expédition : seules celles déjà connues partent.
    const dexBefore = zone ? await caughtDex(tx, userId) : null;
    const newInDex = await recordPokedex(tx, userId, {
      met: result.encounters,
      caught: captured,
      at: now,
    });

    // Pitié figée au départ (plan de Balls) : une espèce capturée repart de son compteur final,
    // les autres ajoutent leurs échecs à ceux comptés entre-temps par d'autres expéditions.
    const startPity = locked.captureSnapshot?.pity;
    const caughtSpecies = new Set(
      result.encounters
        .filter((e) => e.pokemon && !e.questId && !e.special)
        .map((e) => e.speciesId),
    );
    for (const [id, misses] of Object.entries(result.pity)) {
      const speciesId = Number(id);
      const added =
        startPity && !caughtSpecies.has(speciesId) ? misses - (startPity[speciesId] ?? 0) : null;
      await tx
        .insert(pityCounters)
        .values({ ownerId: userId, speciesId, misses: added ?? misses })
        .onConflictDoUpdate({
          target: [pityCounters.ownerId, pityCounters.speciesId],
          set: { misses: added === null ? misses : sql`${pityCounters.misses} + ${added}` },
        });
    }

    // Butin + Balls et baies réservées mais non utilisées.
    await addItems(tx, userId, [
      ...result.loot,
      ...(ballItemId ? [{ itemId: ballItemId, quantity: balls - result.ballsUsed }] : []),
      ...(berryItemId ? [{ itemId: berryItemId, quantity: berries - result.berriesUsed }] : []),
      ...(found.encounterBerryItemId
        ? [
            {
              itemId: found.encounterBerryItemId,
              quantity: found.encounterBerries - (result.encounterBerriesUsed ?? 0),
            },
          ]
        : []),
    ]);

    for (const m of result.team) {
      await tx
        .update(pokemon)
        .set({ xp: m.xpAfter, level: m.levelAfter, happiness: m.happinessAfter })
        .where(eq(pokemon.id, m.id));
    }

    // Étapes « action » des quêtes : captures, expédition réussie (conditions de départ), objets
    // de quête (une chance par tirage de butin).
    const questItems: ItemStack[] = [];
    await syncQuests(
      tx,
      current,
      userId,
      now,
      !zone
        ? undefined
        : {
            type: 'expedition',
            zoneId: zone.id,
            team,
            captured: capturedEncounters.map((e) => e.pokemon!),
            lootRolls: result.lootRolls ?? 0,
            seed: found.seed,
            // Météo imposée par un talent de l'équipe, sinon celle de la zone au départ.
            weather:
              result.weather === undefined ? zoneWeather(zone, found.startedAt) : result.weather,
            hour: found.localHour,
          },
      questItems,
    );
    await recordGuildActivity(
      tx,
      current,
      userId,
      { caught: captured, expeditions: zone ? 1 : 0 },
      now,
    );

    // Transfert automatique, une fois les captures comptées (Pokédex, quêtes, guilde).
    const toTransfer = dexBefore
      ? autoTransferIndexes(ctx, result.encounters, dexBefore, locked.autoTransfer)
      : new Set<number>();
    // Échappés déjà connus (ni chromatiques ni fuyards) : résumés au retour.
    const hiddenEscapes = dexBefore
      ? hiddenEscapeIndexes(result.encounters, dexBefore)
      : new Set<number>();
    const rowByEncounter = new Map<number, PokemonRow>();
    let capturedIndex = 0;
    result.encounters.forEach((e, i) => {
      if (e.pokemon) rowByEncounter.set(i, captured[capturedIndex++]!);
    });
    const transferredRows = [...toTransfer].map((i) => rowByEncounter.get(i)!);
    const candiesGained = await transferRows(tx, ctx, userId, transferredRows);
    const stored: StoredExpeditionResult = {
      ...result,
      encounters: result.encounters.map((e, i) =>
        toTransfer.has(i)
          ? { ...e, transferred: true as const }
          : e.pokemon
            ? { ...e, pokemonId: rowByEncounter.get(i)!.id }
            : hiddenEscapes.has(i)
              ? { ...e, filtered: true as const }
              : e,
      ),
      ...newInDex,
      ...(toTransfer.size > 0 && {
        autoTransferred: { count: toTransfer.size, candies: candiesGained },
      }),
      ...(questItems.length > 0 && { questItems }),
    };
    const [claimed] = await tx
      .update(expeditions)
      .set({
        result: stored,
        ...(zone && { durationMinutes: Math.round(elapsedMinutes) }),
      })
      .where(eq(expeditions.id, found.id))
      .returning();
    const gone = new Set(transferredRows.map((r) => r.id));
    return { expedition: claimed!, captured: captured.filter((r) => !gone.has(r.id)) };
  });
}
