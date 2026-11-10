import { randomInt } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { playerProfiles } from '@poke/db';
import type { Db } from '@poke/db';
import { MAX_SEED, localHour } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import { GameError } from '../errors';
import { playerFacilityPlaces } from '../store';

/**
 * Ce que les autres domaines du jeu empruntent aux expéditions : graine aléatoire d'une action,
 * heure locale du joueur, profil prêt à jouer, nombre de places.
 */

/**
 * Graine aléatoire d'une action (expédition, combat, œuf…) : enregistrée avec elle, elle permet de
 * rejouer le résultat à l'identique.
 */
export function newSeed(): number {
  return randomInt(0, MAX_SEED + 1);
}

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

/**
 * Profil du joueur, exigé pour jouer ; refus `NO_PROFILE` (pas de nom de dresseur) ou `NO_STARTER`.
 */
export async function requireStartedProfile(db: Db, userId: string) {
  const [profile] = await db.select().from(playerProfiles).where(eq(playerProfiles.userId, userId));
  if (!profile) throw new GameError(409, 'NO_PROFILE');
  if (profile.starterSpeciesId == null) throw new GameError(409, 'NO_STARTER');
  return profile;
}
