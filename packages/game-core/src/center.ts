import { durationWithAbility } from './abilities';
import type { AbilityEnv, AbilityHolder } from './abilities';
import type { GameContext } from './context';

/**
 * Centre Pokémon : un Pokémon mis K.O. en combat reste K.O. jusqu'à ce qu'on l'y dépose ; il est
 * alors en soins pendant `balance.center.healMinutes` (talents compris), puis de nouveau libre.
 */

/** Un Pokémon en soins reste inutilisable jusqu'à `healUntil` (évaluation paresseuse). */
export function isHealing(healUntil: Date | string | null, now: Date | number): boolean {
  if (healUntil === null) return false;
  return new Date(healUntil).getTime() > new Date(now).getTime();
}

/**
 * Durée des soins d'un Pokémon : talent du soigné (Médic Nature…) et de l'assistant du Centre
 * (Cœur Soin…).
 */
export function healMinutes(
  ctx: GameContext,
  patient: AbilityHolder,
  helper: AbilityHolder | null | undefined,
): number {
  const env: AbilityEnv = { activity: 'center', team: helper ? [patient, helper] : [patient] };
  return durationWithAbility(ctx, env, 'koDuration', ctx.balance.center.healMinutes, 0);
}
