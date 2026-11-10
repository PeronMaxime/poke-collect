/**
 * Profil du joueur : création (nom de dresseur) et choix des starters.
 *
 * Un compte n'a qu'un profil, et un nom de dresseur n'est pris qu'une fois (sans tenir compte de
 * la casse ; un index unique en base tranche deux créations simultanées). La région de départ est
 * la première du contenu publié. Le starter de cette région donne aussi l'inventaire et l'argent
 * de départ (`balance.newPlayer`) ; chaque région suivante offre le sien une fois débloquée. Le
 * choix se fait dans `playerTransaction`, et la mise à jour du profil ne passe que si aucun starter
 * n'y figure encore : deux choix simultanés n'en donnent qu'un.
 */
import { eq, sql } from 'drizzle-orm';
import { playerProfiles } from '@poke/db';
import type { Db } from '@poke/db';
import {
  baseShinyProbability,
  createRng,
  generatePokemon,
  isRegionUnlocked,
} from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type { PlayerProfileDto, PokemonDto } from '@poke/shared';
import { GameError } from './errors';
import { newSeed } from './expeditions';
import { chosenFavorite } from './favorite';
import { addItems, insertPokemon, playerProgress, recordPokedex, toPokemonDto } from './store';
import { playerTransaction } from './tx';

/** Le profil tel que le jeu le reçoit. */
export function toProfileDto(row: typeof playerProfiles.$inferSelect): PlayerProfileDto {
  return {
    trainerName: row.trainerName,
    regionUnlocked: row.regionUnlocked,
    starterSpeciesId: row.starterSpeciesId,
    regionStarters: row.regionStarters,
    openedRegions: row.openedRegions,
    favorite: chosenFavorite(row),
    currency: row.currency,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Profil du joueur ; null tant qu'il n'a pas choisi son nom de dresseur. */
export async function findProfile(db: Db, userId: string): Promise<PlayerProfileDto | null> {
  const [profile] = await db.select().from(playerProfiles).where(eq(playerProfiles.userId, userId));
  return profile ? toProfileDto(profile) : null;
}

/**
 * Crée le profil du joueur dans la première région du contenu. Refus : `PROFILE_EXISTS`,
 * `TRAINER_NAME_TAKEN`, `NO_REGION_CONFIGURED` (contenu sans région).
 */
export async function createProfile(
  db: Db,
  ctx: () => Promise<GameContext>,
  userId: string,
  trainerName: string,
  at: Date,
): Promise<PlayerProfileDto> {
  const [existing] = await db
    .select({ userId: playerProfiles.userId })
    .from(playerProfiles)
    .where(eq(playerProfiles.userId, userId));
  if (existing) throw new GameError(409, 'PROFILE_EXISTS');

  const [taken] = await db
    .select({ userId: playerProfiles.userId })
    .from(playerProfiles)
    .where(eq(sql`lower(${playerProfiles.trainerName})`, trainerName.toLowerCase()));
  if (taken) throw new GameError(409, 'TRAINER_NAME_TAKEN');

  // La région de départ vient du contenu publié (première région dans l'ordre).
  const startRegion = (await ctx()).regions[0];
  if (!startRegion) throw new GameError(503, 'NO_REGION_CONFIGURED');

  const [created] = await db
    .insert(playerProfiles)
    .values({ userId, trainerName, regionUnlocked: startRegion.id, createdAt: at })
    .returning();
  return toProfileDto(created!);
}

/**
 * Choix du starter de la région de départ : premier Pokémon, Pokédex, inventaire et argent de
 * départ. Refus : `NO_PROFILE`, `STARTER_ALREADY_CHOSEN`, `INVALID_STARTER`.
 */
export async function chooseStarter(
  db: Db,
  ctx: GameContext,
  userId: string,
  speciesId: number,
  at: Date,
): Promise<PokemonDto> {
  const [profile] = await db.select().from(playerProfiles).where(eq(playerProfiles.userId, userId));
  if (!profile) throw new GameError(409, 'NO_PROFILE');
  if (profile.starterSpeciesId != null) throw new GameError(409, 'STARTER_ALREADY_CHOSEN');
  const region = ctx.region(profile.regionUnlocked);
  if (!region?.starterSpeciesIds.includes(speciesId)) throw new GameError(400, 'INVALID_STARTER');

  const { newPlayer } = ctx.balance;
  const starter = generatePokemon(ctx, createRng(newSeed()), speciesId, newPlayer.starterLevel, {
    shinyProbability: baseShinyProbability(ctx),
  });

  const created = await playerTransaction(db, userId, async (tx) => {
    const [claimed] = await tx
      .update(playerProfiles)
      .set({
        starterSpeciesId: speciesId,
        currency: sql`${playerProfiles.currency} + ${newPlayer.startingCurrency}`,
      })
      .where(
        sql`${playerProfiles.userId} = ${userId} and ${playerProfiles.starterSpeciesId} is null`,
      )
      .returning();
    if (!claimed) throw new GameError(409, 'STARTER_ALREADY_CHOSEN');
    const [row] = await insertPokemon(tx, userId, [starter], {
      origin: 'starter',
      originRegion: region.id,
      at,
    });
    await recordPokedex(tx, userId, {
      seen: [speciesId],
      caught: [starter],
      at,
    });
    await addItems(tx, userId, newPlayer.startingInventory);
    return row!;
  });
  return toPokemonDto(created);
}

/**
 * Starter d'une région suivante (Johto…) : un par région, une fois celle-ci débloquée. Seuls les
 * Pokémon du Pokédex d'une région y partent en expédition, il faut donc un premier compagnon.
 * Refus : `NO_PROFILE`, `REGION_NOT_FOUND` (inconnue, ou région de départ), `REGION_LOCKED`,
 * `STARTER_ALREADY_CHOSEN`, `INVALID_STARTER`.
 */
export async function chooseRegionStarter(
  db: Db,
  ctx: GameContext,
  userId: string,
  regionId: string,
  speciesId: number,
  at: Date,
): Promise<PokemonDto> {
  const [profile] = await db.select().from(playerProfiles).where(eq(playerProfiles.userId, userId));
  if (!profile) throw new GameError(409, 'NO_PROFILE');
  const region = ctx.region(regionId);
  if (!region || region.id === profile.regionUnlocked) {
    throw new GameError(404, 'REGION_NOT_FOUND');
  }
  if (!isRegionUnlocked(ctx, region, await playerProgress(db, ctx, userId))) {
    throw new GameError(403, 'REGION_LOCKED');
  }
  if (region.id in profile.regionStarters) {
    throw new GameError(409, 'STARTER_ALREADY_CHOSEN');
  }
  if (!region.starterSpeciesIds.includes(speciesId)) {
    throw new GameError(400, 'INVALID_STARTER');
  }

  const starter = generatePokemon(
    ctx,
    createRng(newSeed()),
    speciesId,
    ctx.balance.newPlayer.starterLevel,
    { shinyProbability: baseShinyProbability(ctx) },
  );
  const created = await playerTransaction(db, userId, async (tx) => {
    const [claimed] = await tx
      .update(playerProfiles)
      .set({
        regionStarters: sql`${playerProfiles.regionStarters} || ${JSON.stringify({ [region.id]: speciesId })}::jsonb`,
      })
      .where(
        sql`${playerProfiles.userId} = ${userId} and ${playerProfiles.regionStarters} ->> ${region.id} is null`,
      )
      .returning();
    if (!claimed) throw new GameError(409, 'STARTER_ALREADY_CHOSEN');
    const [row] = await insertPokemon(tx, userId, [starter], {
      origin: 'starter',
      originRegion: region.id,
      at,
    });
    await recordPokedex(tx, userId, { seen: [speciesId], caught: [starter], at });
    return row!;
  });
  return toPokemonDto(created);
}
