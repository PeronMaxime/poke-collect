import { randomInt } from 'node:crypto';
import { and, asc, eq, gt, gte, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { expeditions, pityCounters, playerProfiles, pokemon, questProgress } from '@poke/db';
import type { Db } from '@poke/db';
import {
  BALL_CATEGORIES,
  autoTransferIndexes,
  hiddenEscapeIndexes,
  planBall,
  MAX_SEED,
  MISSED_THROW,
  NO_THROW,
  THROW_CODES,
  captureSnapshot,
  checkTeam,
  createExpeditionRun,
  durationWithAbility,
  encounterMinutes,
  expeditionEnv,
  expeditionMinMinutes,
  expeditionPace,
  isZoneUnlocked,
  legendarySite,
  localHour,
  maxExpeditionBerries,
  planHasBall,
  planThrows,
  playerBonuses,
  questEncounter,
  resolveExpedition,
  resolveQuestExpedition,
  roamerFleeZoneId,
  roamerPositions,
  roamingTarget,
  roamingZones,
  weatherHour,
  zoneChainStatus,
  zoneSpeciesIds,
  zoneWeather,
} from '@poke/game-core';
import type {
  BallPlan,
  ExpeditionInput,
  ExpeditionPace,
  ExpeditionResult,
  ExpeditionRoamer,
  ExpeditionRun,
  GameContext,
  PlayerProgress,
  RoamerPosition,
  ZoneChainStatus,
} from '@poke/game-core';
import type {
  ClaimExpeditionInput,
  LegendaryEncounterDto,
  StartExpeditionInput,
  StartQuestExpeditionInput,
  StoredExpeditionResult,
} from '@poke/shared';
import type { ContentCache } from '../content-cache';
import { GameError } from './errors';
import { playerTransaction } from './tx';
import { recordGuildActivity } from './guilds';
import { syncQuests } from './quests';
import {
  addItems,
  transferRows,
  assertAvailable,
  caughtDex,
  claimedRewards,
  playerFacilityPlaces,
  insertPokemon,
  itemQuantities,
  itemQuantity,
  playerProgress,
  recordPokedex,
  shinyCharm,
  takeItems,
  toInstance,
} from './store';
import type { ExpeditionRow, PokemonRow, QuestProgressRow } from './store';

export { GameError };

/** Résultat vide : aucune rencontre, rien d'utilisé. */
const EMPTY_RESULT: ExpeditionResult = {
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

export function newSeed(): number {
  return randomInt(0, MAX_SEED + 1);
}

const minutesAfter = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000);

/** Heure locale du joueur au départ (talents de jour ou de nuit) ; null si le client ne l'envoie pas. */
export function startHour(now: Date, utcOffsetMinutes: number | undefined): number | null {
  return utcOffsetMinutes === undefined ? null : localHour(now, utcOffsetMinutes);
}

/**
 * Nombre d'emplacements d'expédition du joueur : départ + récompenses réclamées + paliers remplis
 * (Bâtiments), dans la limite du maximum.
 */
export function expeditionSlots(db: Db, ctx: GameContext, userId: string): Promise<number> {
  return playerFacilityPlaces(db, ctx, userId, 'expedition');
}

export async function requireStartedProfile(db: Db, userId: string) {
  const [profile] = await db.select().from(playerProfiles).where(eq(playerProfiles.userId, userId));
  if (!profile) throw new GameError(409, 'NO_PROFILE');
  if (profile.starterSpeciesId == null) throw new GameError(409, 'NO_STARTER');
  return profile;
}

/** Clé de chaîne d'une expédition légendaire : chaque quête a sa propre chaîne. */
export const questChainKey = (questId: string) => `quest:${questId}`;

/**
 * Chaînes du joueur (bonus shiny) : par zone, et par quête pour les expéditions légendaires
 * (clé `questChainKey`). Expéditions en cours, ou récupérées depuis moins que le délai de
 * relance ; une chaîne absente repart de 0.
 */
export async function shinyChains(
  db: Db,
  ctx: GameContext,
  userId: string,
  now: Date,
  only?: { zoneId: string } | { questId: string },
): Promise<Map<string, ZoneChainStatus>> {
  const since = new Date(now.getTime() - ctx.balance.shiny.chainWindowMinutes * 60_000);
  const rows = await db
    .select({
      zoneId: expeditions.zoneId,
      questId: expeditions.questId,
      chain: expeditions.shinyChain,
      claimedAt: expeditions.claimedAt,
    })
    .from(expeditions)
    .where(
      and(
        eq(expeditions.ownerId, userId),
        only && 'zoneId' in only ? eq(expeditions.zoneId, only.zoneId) : undefined,
        only && 'questId' in only ? eq(expeditions.questId, only.questId) : undefined,
        or(isNull(expeditions.claimedAt), gte(expeditions.claimedAt, since)),
      ),
    );
  const byZone = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = r.questId ? questChainKey(r.questId) : r.zoneId;
    if (key) byZone.set(key, [...(byZone.get(key) ?? []), r]);
  }
  const chains = new Map<string, ZoneChainStatus>();
  for (const [id, runs] of byZone) {
    const status = zoneChainStatus(ctx, runs, now);
    if (status.chain > 0) chains.set(id, status);
  }
  return chains;
}

/**
 * Pokémon fuyards du joueur et leur zone à l'instant `now` : ceux des quêtes réclamées, sauf ceux
 * partis avec une expédition pas encore réclamée.
 */
export async function playerRoamers(
  db: Db,
  ctx: GameContext,
  userId: string,
  now: Date,
  progress?: PlayerProgress,
): Promise<RoamerPosition[]> {
  const claimedQuests = await db
    .select({
      questId: questProgress.questId,
      pokemonCaught: questProgress.pokemonCaught,
      roamerHideout: questProgress.roamerHideout,
    })
    .from(questProgress)
    .where(and(eq(questProgress.ownerId, userId), isNotNull(questProgress.claimedAt)));
  const roaming = claimedQuests.filter(({ questId, pokemonCaught }) => {
    const quest = ctx.quest(questId);
    return quest && roamingTarget(quest, pokemonCaught);
  });
  if (roaming.length === 0) return [];
  const running = await db
    .select({ roamers: expeditions.roamers })
    .from(expeditions)
    .where(and(eq(expeditions.ownerId, userId), isNull(expeditions.claimedAt)));
  return roamerPositions(ctx, {
    userId,
    claimedQuests: roaming,
    progress: progress ?? (await playerProgress(db, ctx, userId)),
    engagedQuestIds: new Set(running.flatMap((r) => r.roamers.map((x) => x.questId))),
    at: now,
  });
}

/** Premier emplacement d'expédition libre du joueur. */
async function freeSlot(db: Db, ctx: GameContext, userId: string): Promise<number> {
  const active = await db
    .select({ slotIndex: expeditions.slotIndex })
    .from(expeditions)
    .where(and(eq(expeditions.ownerId, userId), isNull(expeditions.claimedAt)));
  const used = new Set(active.map((e) => e.slotIndex));
  const slots = await expeditionSlots(db, ctx, userId);
  const slotIndex = Array.from({ length: slots }, (_, i) => i).find((i) => !used.has(i));
  if (slotIndex === undefined) throw new GameError(409, 'NO_FREE_SLOT');
  return slotIndex;
}

/** Équipe dans l'ordre choisi : Pokémon possédés et disponibles (ni occupés ni K.O.). */
async function availableTeam(db: Db, userId: string, ids: string[], now: Date) {
  const rows = ids.length
    ? await db
        .select()
        .from(pokemon)
        .where(and(eq(pokemon.ownerId, userId), inArray(pokemon.id, ids)))
    : [];
  if (rows.length !== new Set(ids).size) throw new GameError(404, 'POKEMON_NOT_FOUND');
  await assertAvailable(db, userId, rows, now);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => toInstance(byId.get(id)!));
}

/** Équipe d'une expédition, dans l'ordre du départ : le premier est en tête (talents). */
async function expeditionTeam(db: Db, userId: string, ids: string[]) {
  return (await expeditionTeams(db, userId, [ids]))[0]!;
}

/** Équipes de plusieurs expéditions en une seule requête (même ordre que `teams`). */
async function expeditionTeams(db: Db, userId: string, teams: readonly string[][]) {
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
 * Rythme de chaque expédition de zone en cours (par id), calculé comme à la réclamation : contenu
 * de la version du départ, équipe, météo et heure du départ, baies de rencontres emportées.
 */
export async function expeditionPaces(
  db: Db,
  content: ContentCache,
  userId: string,
  rows: readonly ExpeditionRow[],
): Promise<Map<string, ExpeditionPace>> {
  const paces = new Map<string, ExpeditionPace>();
  const running = rows.filter((row) => !row.claimedAt && !row.questId && row.zoneId);
  const teams = await expeditionTeams(
    db,
    userId,
    running.map((row) => row.team),
  );
  for (const [i, row] of running.entries()) {
    const ctx = await content.version(row.contentVersionId);
    const zone = ctx.zone(row.zoneId!);
    if (!zone) continue;
    const team = teams[i]!;
    const site = { ...zone, weather: zoneWeather(zone, row.startedAt) };
    paces.set(
      row.id,
      expeditionPace(
        ctx,
        expeditionEnv(site, team, row.localHour),
        row.encounterBerryItemId
          ? { itemId: row.encounterBerryItemId, quantity: row.encounterBerries }
          : null,
      ),
    );
  }
  return paces;
}

/**
 * Données de rejeu d'une expédition à plan de Balls : de quoi retrouver ses rencontres à
 * l'identique, au fil des retraits de Balls comme à la réclamation.
 */
async function planRunInput(
  db: Db,
  ctx: GameContext,
  row: ExpeditionRow,
  zone: NonNullable<ReturnType<GameContext['zone']>>,
  userId: string,
): Promise<Omit<ExpeditionInput, 'elapsedMinutes'>> {
  const bonuses = playerBonuses(ctx, await claimedRewards(db, userId));
  const charm = await shinyCharm(db, ctx, userId);
  const snapshot = row.captureSnapshot ?? { speciesIds: [], formIds: [], pity: {} };
  return {
    zone,
    seed: row.seed,
    team: await expeditionTeam(db, userId, row.team),
    ballPlan: row.ballPlan,
    throws: row.throws,
    berries: row.berryItemId ? { itemId: row.berryItemId, quantity: row.berries } : null,
    encounterBerries: row.encounterBerryItemId
      ? { itemId: row.encounterBerryItemId, quantity: row.encounterBerries }
      : null,
    pity: snapshot.pity,
    bonuses,
    // Chaîne figée au départ ; Charme Chroma possédé maintenant.
    shiny: { chain: row.shinyChain, charm, bonus: bonuses.shiny },
    caught: { speciesIds: new Set(snapshot.speciesIds), formIds: new Set(snapshot.formIds) },
    hour: row.localHour,
    weather: zoneWeather(zone, row.startedAt),
    roamers: await expeditionRoamers(db, ctx, userId, row.roamers),
  };
}

/**
 * Retire du sac les Balls lancées depuis le dernier passage par les expéditions en cours du
 * joueur : une à chaque rencontre, selon la catégorie du Pokémon (nouveau, chromatique, déjà
 * capturé). Les rencontres de toutes les expéditions sont prises dans l'ordre où elles ont eu
 * lieu, comme si le jeu était resté ouvert : quand la Ball voulue manque à ce moment-là, la
 * rencontre se fait sans lancer. Le résultat des captures reste secret jusqu'à la réclamation.
 * Appelée avant chaque requête du joueur, et dans la réclamation.
 */
export async function settleExpeditionBalls(
  db: Db,
  content: ContentCache,
  userId: string,
  now: Date,
): Promise<void> {
  const [due] = await db
    .select({ id: expeditions.id })
    .from(expeditions)
    .where(
      and(
        eq(expeditions.ownerId, userId),
        isNull(expeditions.claimedAt),
        lte(expeditions.nextThrowAt, now),
      ),
    )
    .limit(1);
  if (!due) return;
  await preloadExpeditionContent(db, content, userId);
  await playerTransaction(db, userId, (tx) => settleBallsIn(tx, content, userId, now));
}

/** Prochaine rencontre à régler parmi les expéditions en cours du joueur, ou `null`. */
export async function nextExpeditionThrow(db: Db, userId: string): Promise<Date | null> {
  const [row] = await db
    .select({ at: sql<Date | null>`min(${expeditions.nextThrowAt})` })
    .from(expeditions)
    .where(and(eq(expeditions.ownerId, userId), isNull(expeditions.claimedAt)));
  return row?.at ? new Date(row.at) : null;
}

/**
 * Charge, hors transaction, le contenu des versions de départ des expéditions en cours du joueur.
 * `ContentCache` lit la base par sa propre connexion : appelé pour la première fois dans une
 * transaction, il attendrait sa fin (PGlite n'a qu'une connexion) et la bloquerait pour de bon.
 */
async function preloadExpeditionContent(db: Db, content: ContentCache, userId: string) {
  const rows = await db
    .selectDistinct({ versionId: expeditions.contentVersionId })
    .from(expeditions)
    .where(and(eq(expeditions.ownerId, userId), isNull(expeditions.claimedAt)));
  await Promise.all(rows.map((r) => content.version(r.versionId)));
}

async function settleBallsIn(db: Db, content: ContentCache, userId: string, now: Date) {
  const rows = await db
    .select()
    .from(expeditions)
    .where(
      and(
        eq(expeditions.ownerId, userId),
        isNull(expeditions.claimedAt),
        lte(expeditions.nextThrowAt, now),
      ),
    )
    .orderBy(asc(expeditions.startedAt))
    .for('update');
  interface PendingRun {
    row: ExpeditionRow;
    run: ExpeditionRun;
    plan: BallPlan;
    throws: string;
    used: Record<string, number>;
    /** Quêtes des fuyards déjà croisés. */
    roamersMet: string[];
    /** Rencontres survenues à ce jour. */
    limit: number;
    done: boolean;
  }
  const runs: PendingRun[] = [];
  for (const row of rows) {
    const ctx = await content.version(row.contentVersionId);
    const zone = row.zoneId ? ctx.zone(row.zoneId) : undefined;
    const plan = row.ballPlan;
    if (!zone || !plan) {
      await db.update(expeditions).set({ nextThrowAt: null }).where(eq(expeditions.id, row.id));
      continue;
    }
    const run = createExpeditionRun(ctx, await planRunInput(db, ctx, row, zone, userId));
    // Rencontres déjà décidées : rejouées telles quelles.
    const replay = planThrows(plan, row.throws);
    let done = false;
    while (!done && run.played < row.throws.length) done = !run.next(replay);
    const elapsed =
      (Math.min(now.getTime(), row.endsAt.getTime()) - row.startedAt.getTime()) / 60_000;
    runs.push({
      row,
      run,
      plan,
      throws: row.throws,
      used: { ...row.ballsUsed },
      roamersMet: [...row.roamersMet],
      limit: run.encountersAfter(elapsed),
      done,
    });
  }

  const ballIds = new Set(runs.flatMap((r) => BALL_CATEGORIES.flatMap((c) => r.plan[c] ?? [])));
  const stock = await itemQuantities(db, userId, [...ballIds]);
  const taken = new Map<string, number>();
  const nextAt = (r: PendingRun) =>
    r.row.startedAt.getTime() + r.run.encounterMinutes(r.run.played + 1) * 60_000;
  for (;;) {
    // Prochaine rencontre, toutes expéditions confondues.
    let next: PendingRun | undefined;
    for (const r of runs) {
      if (!r.done && r.run.played < r.limit && (!next || nextAt(r) < nextAt(next))) next = r;
    }
    if (!next) break;
    const current = next;
    let code = NO_THROW;
    const met = current.run.next(({ category }) => {
      const ballItemId = planBall(current.plan, category);
      if (!ballItemId) return { outcome: 'ignored' };
      if ((stock.get(ballItemId) ?? 0) <= 0) {
        code = MISSED_THROW;
        return { outcome: 'noBall' };
      }
      stock.set(ballItemId, stock.get(ballItemId)! - 1);
      taken.set(ballItemId, (taken.get(ballItemId) ?? 0) + 1);
      current.used[ballItemId] = (current.used[ballItemId] ?? 0) + 1;
      code = THROW_CODES[category];
      return { ballItemId };
    });
    if (!met) {
      current.done = true;
      continue;
    }
    current.throws += code;
    // Le joueur apprend qu'il a croisé le fuyard, pas l'issue du lancer.
    if (met.questId && !current.roamersMet.includes(met.questId)) {
      current.roamersMet.push(met.questId);
    }
  }

  for (const [itemId, quantity] of taken) {
    if (!(await takeItems(db, userId, itemId, quantity))) throw new GameError(409, 'STOCK_CHANGED');
  }
  for (const r of runs) {
    const at = new Date(nextAt(r));
    // Plus de Ball à lancer ni de fuyard à croiser : inutile de la rejouer avant la réclamation.
    const pending =
      planHasBall(r.plan) || r.row.roamers.some((x) => !r.roamersMet.includes(x.questId));
    await db
      .update(expeditions)
      .set({
        throws: r.throws,
        ballsUsed: r.used,
        roamersMet: r.roamersMet,
        nextThrowAt: pending && !r.done && at <= r.row.endsAt ? at : null,
      })
      .where(eq(expeditions.id, r.row.id));
  }
}

/**
 * Lance une expédition : vérifie la zone, l'équipe et le stock, réserve les baies (les Balls
 * sont retirées du sac au fil des rencontres, voir `settleExpeditionBalls`), enregistre la version de contenu active, un seed tiré côté serveur et le maillon de la
 * chaîne de zone. Elle court jusqu'à la durée maximale ; le joueur peut l'arrêter dès la durée
 * minimum passée.
 */
export async function startExpedition(
  db: Db,
  content: ContentCache,
  userId: string,
  input: StartExpeditionInput,
  now: Date,
): Promise<ExpeditionRow> {
  const ctx = await content.get();
  await requireStartedProfile(db, userId);
  const zone = ctx.zone(input.zoneId);
  if (!zone) throw new GameError(404, 'ZONE_NOT_FOUND');
  const progress = await playerProgress(db, ctx, userId);
  if (!isZoneUnlocked(ctx, zone, progress)) throw new GameError(403, 'ZONE_LOCKED');
  // Les catégories d'IV non réglées restent absentes (et non `undefined`) dans le plan enregistré.
  const ballPlan = Object.fromEntries(
    Object.entries(input.balls).filter(([, ballItemId]) => ballItemId !== undefined),
  ) as BallPlan;
  for (const category of BALL_CATEGORIES) {
    const ballItemId = planBall(ballPlan, category);
    if (ballItemId && !ctx.itemEffect(ballItemId, 'ball')) throw new GameError(400, 'NOT_A_BALL');
  }
  if (input.berryItemId && !ctx.itemEffect(input.berryItemId, 'captureBoost')) {
    throw new GameError(400, 'NOT_A_BERRY');
  }
  if (input.encounterBerryItemId && !ctx.itemEffect(input.encounterBerryItemId, 'encounterBoost')) {
    throw new GameError(400, 'NOT_A_BERRY');
  }

  return playerTransaction(db, userId, async (tx) => {
    const slotIndex = await freeSlot(tx, ctx, userId);
    const team = await availableTeam(tx, userId, input.team, now);
    const hour = startHour(now, input.utcOffsetMinutes);
    // Météo de la zone au départ, retrouvée à la réclamation (même version de contenu).
    const site = { ...zone, weather: zoneWeather(zone, now) };
    const check = checkTeam(ctx, site, team, hour);
    if (check.errors.length > 0) throw new GameError(400, 'TEAM_INVALID', { errors: check.errors });

    // Autant que demandé, dans la limite du stock et de ce qui peut servir d'ici la durée maximale.
    const reserve = async (itemId: string | null | undefined, wanted: number, limit: number) => {
      if (!itemId) return 0;
      const quantity = Math.min(wanted, limit, await itemQuantity(tx, userId, itemId));
      if (!(await takeItems(tx, userId, itemId, quantity)))
        throw new GameError(409, 'STOCK_CHANGED');
      return quantity;
    };
    const { maxDurationMinutes } = ctx.balance.expeditions;
    const env = expeditionEnv(site, team, hour);
    const berryLimit = maxExpeditionBerries(ctx);
    const encounterBerries = await reserve(
      input.encounterBerryItemId,
      input.encounterBerryCount ?? 1,
      berryLimit,
    );
    const berries = await reserve(input.berryItemId, input.berryCount ?? 1, berryLimit);
    const chain =
      (await shinyChains(tx, ctx, userId, now, { zoneId: zone.id })).get(zone.id)?.chain ?? 0;
    // Fuyards de la zone au départ : ils partent avec l'expédition.
    const roamers = (await playerRoamers(tx, ctx, userId, now, progress))
      .filter((r) => r.zoneId === zone.id)
      .map(({ questId, pokemonIndex }) => ({ questId, pokemonIndex }));
    // Pokédex et pitié figés : chaque retrait de Balls rejoue les mêmes rencontres.
    const species = [
      ...zoneSpeciesIds(zone),
      ...roamers.flatMap(({ questId, pokemonIndex }) => {
        const target = ctx.quest(questId)?.rewards.pokemon[pokemonIndex];
        return target ? [target.speciesId] : [];
      }),
    ];
    const pityRows = await tx
      .select()
      .from(pityCounters)
      .where(and(eq(pityCounters.ownerId, userId), inArray(pityCounters.speciesId, species)));
    const snapshot = captureSnapshot(
      await caughtDex(tx, userId),
      Object.fromEntries(pityRows.map((r) => [r.speciesId, r.misses])),
      species,
    );
    const firstEncounter = minutesAfter(
      now,
      encounterMinutes(
        ctx,
        1,
        env,
        encounterBerries > 0
          ? { itemId: input.encounterBerryItemId!, quantity: encounterBerries }
          : null,
      ),
    );
    const endsAt = minutesAfter(now, maxDurationMinutes);

    const [row] = await tx
      .insert(expeditions)
      .values({
        ownerId: userId,
        zoneId: zone.id,
        slotIndex,
        team: input.team,
        durationMinutes: zone.minDurationMinutes,
        ballItemId: null,
        balls: 0,
        ballPlan,
        autoTransfer: input.autoTransfer ?? null,
        captureSnapshot: snapshot,
        // Rejouée au fil de l'eau pour retirer les Balls, ou pour annoncer un fuyard croisé.
        nextThrowAt:
          (planHasBall(ballPlan) || roamers.length > 0) && firstEncounter <= endsAt
            ? firstEncounter
            : null,
        berryItemId: berries > 0 ? input.berryItemId : null,
        berries,
        encounterBerryItemId: encounterBerries > 0 ? input.encounterBerryItemId : null,
        encounterBerries,
        contentVersionId: ctx.content.versionId,
        startedAt: now,
        minEndsAt: minutesAfter(now, expeditionMinMinutes(ctx, zone.minDurationMinutes, env)),
        endsAt,
        seed: newSeed(),
        shinyChain: chain,
        localHour: hour,
        roamers,
      })
      .returning();
    return row!;
  });
}

/**
 * Lance l'expédition légendaire d'une quête réclamée (depuis les quêtes uniquement) vers le
 * prochain Pokémon de la récompense pas encore capturé, selon sa configuration (durée, PE
 * minimale, types requis, région de la quête) : un emplacement d'expédition, et le maillon de la
 * chaîne de la quête. La Ball et la baie se choisissent au retour, une fois le légendaire vu.
 * Une seule à la fois par quête.
 */
export async function startQuestExpedition(
  db: Db,
  content: ContentCache,
  userId: string,
  questId: string,
  input: StartQuestExpeditionInput,
  now: Date,
): Promise<ExpeditionRow> {
  const ctx = await content.get();
  await requireStartedProfile(db, userId);
  const quest = ctx.quest(questId);
  if (!quest) throw new GameError(404, 'QUEST_NOT_FOUND');

  return playerTransaction(db, userId, async (tx) => {
    const [progress] = await tx
      .select()
      .from(questProgress)
      .where(and(eq(questProgress.ownerId, userId), eq(questProgress.questId, quest.id)));
    if (!progress?.claimedAt) throw new GameError(409, 'QUEST_NOT_CLAIMED');
    const target = quest.rewards.pokemon[progress.pokemonCaught];
    if (!target) throw new GameError(409, 'QUEST_POKEMON_CAUGHT');
    // Un fuyard se trouve dans les expéditions ordinaires, pas dans une expédition légendaire.
    if (target.roaming != null) throw new GameError(409, 'QUEST_POKEMON_ROAMING');
    const { durationMinutes } = target.expedition;
    const [running] = await tx
      .select({ id: expeditions.id })
      .from(expeditions)
      .where(
        and(
          eq(expeditions.ownerId, userId),
          eq(expeditions.questId, quest.id),
          isNull(expeditions.claimedAt),
        ),
      );
    if (running) throw new GameError(409, 'QUEST_EXPEDITION_RUNNING');

    const slotIndex = await freeSlot(tx, ctx, userId);
    const team = await availableTeam(tx, userId, input.team, now);
    const site = legendarySite(quest, target);
    const hour = startHour(now, input.utcOffsetMinutes);
    const { errors } = checkTeam(ctx, site, team, hour);
    if (errors.length > 0) throw new GameError(400, 'TEAM_INVALID', { errors });
    const endsAt = minutesAfter(
      now,
      durationWithAbility(
        ctx,
        expeditionEnv(site, team, hour, 'quest'),
        'expeditionDuration',
        durationMinutes,
      ),
    );
    const key = questChainKey(quest.id);
    const chain = (await shinyChains(tx, ctx, userId, now, { questId: quest.id })).get(key);

    const [row] = await tx
      .insert(expeditions)
      .values({
        ownerId: userId,
        questId: quest.id,
        slotIndex,
        team: input.team,
        durationMinutes,
        ballItemId: null,
        balls: 0,
        berryItemId: null,
        berries: 0,
        contentVersionId: ctx.content.versionId,
        startedAt: now,
        // Durée fixe : pas d'arrêt avant la fin.
        minEndsAt: endsAt,
        endsAt,
        seed: newSeed(),
        shinyChain: chain?.chain ?? 0,
        localHour: hour,
      })
      .returning();
    return row!;
  });
}

/**
 * Annule une expédition en cours : elle disparaît sans résultat, l'équipe redevient disponible
 * et les Balls (déjà lancées ou réservées) et baies sont rendues. Passé la durée minimum, elle se réclame.
 */
export async function cancelExpedition(
  db: Db,
  userId: string,
  expeditionId: string,
  now: Date,
): Promise<void> {
  await playerTransaction(db, userId, async (tx) => {
    const [found] = await tx
      .delete(expeditions)
      .where(
        and(
          eq(expeditions.id, expeditionId),
          eq(expeditions.ownerId, userId),
          isNull(expeditions.claimedAt),
          gt(expeditions.minEndsAt, now),
        ),
      )
      .returning();
    if (!found) {
      const [existing] = await tx
        .select({ claimedAt: expeditions.claimedAt })
        .from(expeditions)
        .where(and(eq(expeditions.id, expeditionId), eq(expeditions.ownerId, userId)));
      if (!existing) throw new GameError(404, 'EXPEDITION_NOT_FOUND');
      throw new GameError(409, existing.claimedAt ? 'ALREADY_CLAIMED' : 'ALREADY_FINISHED');
    }
    await addItems(tx, userId, [
      ...(found.ballItemId ? [{ itemId: found.ballItemId, quantity: found.balls }] : []),
      ...Object.entries(found.ballsUsed).map(([itemId, quantity]) => ({ itemId, quantity })),
      ...(found.berryItemId ? [{ itemId: found.berryItemId, quantity: found.berries }] : []),
      ...(found.encounterBerryItemId
        ? [{ itemId: found.encounterBerryItemId, quantity: found.encounterBerries }]
        : []),
    ]);
  });
}

/**
 * Expédition légendaire en attente de décision : lancée sans Ball (les anciennes réservaient
 * leur Ball au départ et se résolvent seules).
 */
const awaitsDecision = (row: ExpeditionRow) => !!row.questId && row.balls === 0;

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
 * Fuyards emportés par une expédition, à la réclamation : ceux qui sont toujours à capturer (le
 * même Pokémon de la récompense, toujours fuyard dans la version de départ).
 */
async function expeditionRoamers(
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

/** Pokémon visé par une expédition légendaire : le prochain de la récompense pas encore capturé. */
async function legendaryTarget(db: Db, ctx: GameContext, userId: string, questId: string) {
  const [questRow] = await db
    .select()
    .from(questProgress)
    .where(and(eq(questProgress.ownerId, userId), eq(questProgress.questId, questId)));
  const target = questRow && ctx.quest(questId)?.rewards.pokemon[questRow.pokemonCaught];
  return { questRow, target };
}

/**
 * Légendaire rencontré au retour d'une expédition légendaire, avant la décision : le joueur voit
 * s'il est shiny, puis lance sa Ball ou prend la fuite (et relance pour allonger la chaîne).
 */
export async function legendaryEncounter(
  db: Db,
  content: ContentCache,
  userId: string,
  expeditionId: string,
  now: Date,
): Promise<LegendaryEncounterDto> {
  const { found, ctx } = await stoppableExpedition(db, content, userId, expeditionId, now);
  if (!awaitsDecision(found)) throw new GameError(409, 'NOT_A_LEGENDARY_EXPEDITION');
  const { target } = await legendaryTarget(db, ctx, userId, found.questId!);
  if (!target) throw new GameError(409, 'QUEST_POKEMON_CAUGHT');
  const [charm, claimed] = await Promise.all([
    shinyCharm(db, ctx, userId),
    claimedRewards(db, userId),
  ]);
  // Mêmes facteurs qu'à la résolution : le shiny annoncé est celui qui sera capturé.
  const { pokemon: wild, shinyChance } = questEncounter(ctx, {
    target,
    seed: found.seed,
    shiny: { chain: found.shinyChain, charm, bonus: playerBonuses(ctx, claimed).shiny },
  });
  return {
    expeditionId: found.id,
    questId: found.questId!,
    speciesId: wild.speciesId,
    formId: wild.formId ?? null,
    level: wild.level,
    gender: wild.gender,
    isShiny: wild.isShiny,
    shinyChance,
    shinyChain: found.shinyChain,
  };
}

/**
 * Arrête une expédition et la réclame : calcule le résultat (seed, contenu de la version de
 * départ, temps écoulé dans la limite de sa fin) puis l'applique en une transaction. Une
 * expédition ne se réclame qu'une fois.
 * Une expédition légendaire exige la décision du joueur : la Ball (et la baie) à lancer, ou la
 * fuite (`ballItemId` null).
 */
export async function claimExpedition(
  db: Db,
  content: ContentCache,
  userId: string,
  expeditionId: string,
  now: Date,
  decision?: ClaimExpeditionInput,
): Promise<{ expedition: ExpeditionRow; captured: PokemonRow[] }> {
  const { found, ctx } = await stoppableExpedition(db, content, userId, expeditionId, now);
  // Expédition légendaire : pas de zone, la quête (de la version de départ) la décrit.
  const quest = found.questId ? ctx.quest(found.questId) : undefined;
  const zone = found.zoneId ? ctx.zone(found.zoneId) : undefined;
  if (!found.questId && !zone) throw new GameError(500, 'ZONE_MISSING_IN_VERSION');
  const deciding = awaitsDecision(found);
  if (deciding) {
    if (!decision) throw new GameError(400, 'DECISION_REQUIRED');
    if (decision.ballItemId && !ctx.itemEffect(decision.ballItemId, 'ball')) {
      throw new GameError(400, 'NOT_A_BALL');
    }
    if (decision.berryItemId && !ctx.itemEffect(decision.berryItemId, 'captureBoost')) {
      throw new GameError(400, 'NOT_A_BERRY');
    }
  }
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

    // Balls et baies engagées : réservées au départ, ou prises maintenant (légendaire, sauf fuite).
    let { ballItemId, balls, berryItemId, berries } = found;
    if (deciding && decision?.ballItemId) {
      ballItemId = decision.ballItemId;
      berryItemId = decision.berryItemId;
      balls = 1;
      berries = berryItemId ? 1 : 0;
      for (const itemId of [ballItemId, berryItemId]) {
        if (itemId && !(await takeItems(tx, userId, itemId, 1))) {
          throw new GameError(409, 'NOT_ENOUGH_ITEMS');
        }
      }
      await tx
        .update(expeditions)
        .set({ ballItemId, balls, berryItemId, berries })
        .where(eq(expeditions.id, found.id));
    }

    const team = await expeditionTeam(tx, userId, found.team);
    const bonuses = playerBonuses(ctx, await claimedRewards(tx, userId));
    const charm = await shinyCharm(tx, ctx, userId);
    const elapsedMinutes =
      (Math.min(now.getTime(), found.endsAt.getTime()) - found.startedAt.getTime()) / 60_000;
    let result: ExpeditionResult;
    let questRow: QuestProgressRow | undefined;
    if (found.questId) {
      // Expédition légendaire : le prochain Pokémon de la récompense pas encore capturé.
      const legendary = await legendaryTarget(tx, ctx, userId, found.questId);
      questRow = legendary.questRow;
      const { target } = legendary;
      result =
        target && (deciding || ballItemId)
          ? resolveQuestExpedition(ctx, {
              target,
              seed: found.seed,
              team,
              ballItemId,
              berryItemId,
              bonuses,
              shiny: { chain: found.shinyChain, charm, bonus: bonuses.shiny },
              hour: found.localHour,
            })
          : EMPTY_RESULT; // plus rien à capturer (quête modifiée) : Ball et baie rendues
    } else if (zone && locked.ballPlan) {
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
      result = EMPTY_RESULT; // inatteignable : une expédition normale a toujours sa zone
    }

    const capturedEncounters = result.encounters.filter((e) => e.pokemon);
    const captured = await insertPokemon(
      tx,
      userId,
      capturedEncounters.map((e) => e.pokemon!),
      {
        origin: found.questId ? 'quest' : 'capture',
        originRegion: zone?.regionId ?? quest?.regionId ?? null,
        at: now,
      },
    );
    if (questRow && captured.length > 0) {
      await tx
        .update(questProgress)
        .set({ pokemonCaught: questRow.pokemonCaught + captured.length })
        .where(and(eq(questProgress.ownerId, userId), eq(questProgress.questId, questRow.questId)));
    }
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

    // Une expédition légendaire (sans zone) ne compte pas pour les étapes « action » des quêtes.
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
          },
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
