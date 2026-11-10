import type { Zone } from '@poke/content';
import type { GameContext } from '../context';
import { MAX_LEVEL, levelForXp, xpForLevel } from '../pokemon';
import { NO_BONUSES, pokemonXpGain } from '../progression';
import type { PlayerBonuses } from '../progression';
import { abilityBonuses, abilityModifier, attractedTypes } from '../abilities';
import type { AbilityEnv } from '../abilities';
import { weightedEncounters } from './capture';
import { expeditionPlan } from './team';
import type { TeamMember } from './team';

/**
 * XP d'une expédition : ce que rapporte chaque Pokémon battu, et son partage dans l'équipe.
 */

/** XP de base que rapporte un Pokémon vaincu (ou rencontré), avant multiplicateur. */
export function defeatXp(species: { baseExperience: number | null }, level: number): number {
  return ((species.baseExperience ?? 50) * level) / 7;
}

/** XP totale (non arrondie) d'adversaires vaincus, avant multiplicateur. */
export function defeatedXp(
  ctx: GameContext,
  enemies: readonly { speciesId: number; formId?: number | null; level: number }[],
): number {
  return enemies.reduce((sum, e) => {
    const species = ctx.species(e.speciesId, e.formId);
    return sum + (species ? defeatXp(species, e.level) : 0);
  }, 0);
}

/**
 * XP moyenne que rapportera une expédition à chaque membre (pour l'affichage) : espérance sur
 * les rencontres et leurs niveaux, sans tenir compte de la pitié qui évolue en cours de route.
 * Avec un environnement, les talents de l'équipe sont pris en compte (rencontres, types attirés,
 * niveaux, bonus d'XP).
 */
export function expectedExpeditionXp(
  ctx: GameContext,
  zone: Zone,
  minutes: number,
  bonuses: PlayerBonuses = NO_BONUSES,
  env?: AbilityEnv,
): number {
  const attracted = env ? attractedTypes(ctx, env) : undefined;
  const entries = weightedEncounters(ctx, zone, undefined, attracted);
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  if (total === 0) return 0;
  const xpBonus = env ? abilityBonuses(ctx, env, bonuses).xp : bonuses.xp;
  const extraLevels = env ? Math.round(abilityModifier(ctx, env, 'wildLevel')) : 0;
  const multiplier = ctx.balance.xp.multiplier * xpBonus;
  const perEncounter = entries.reduce((sum, { value: e, weight }) => {
    const species = ctx.species(e.speciesId, e.formId);
    if (!species) return sum;
    let xp = 0;
    for (let level = e.minLevel; level <= e.maxLevel; level++) {
      const wildLevel = Math.min(MAX_LEVEL, Math.max(1, level + extraLevels));
      xp += Math.floor(defeatXp(species, wildLevel) * multiplier);
    }
    return sum + ((weight / total) * xp) / (e.maxLevel - e.minLevel + 1);
  }, 0);
  return Math.round(perEncounter * expeditionPlan(ctx, minutes, env).encounters);
}

export interface TeamMemberResult {
  id: string;
  xpGained: number;
  levelBefore: number;
  levelAfter: number;
  xpAfter: number;
  happinessAfter: number;
}

/**
 * XP (plafonnée au niveau maximal) et bonheur (borné entre 0 et 255) gagnés par l'équipe. `xp`
 * est l'XP de chaque membre avant les bonus de région (complétions d'expédition), propres à
 * chacun.
 */
export function applyTeamXp(
  ctx: GameContext,
  team: readonly TeamMember[],
  xp: number,
  happinessDelta: number,
  bonuses?: Pick<PlayerBonuses, 'regionXp'>,
): TeamMemberResult[] {
  return team.map((m) => {
    const growth = ctx.species(m.speciesId, m.formId)?.growthRate;
    const xpCap = growth ? xpForLevel(growth, MAX_LEVEL) : m.xp;
    const gained = pokemonXpGain(ctx, bonuses, m.speciesId, xp);
    const xpAfter = Math.max(m.xp, Math.min(m.xp + gained, xpCap));
    return {
      id: m.id,
      xpGained: xpAfter - m.xp,
      levelBefore: m.level,
      levelAfter: growth ? Math.max(m.level, levelForXp(growth, xpAfter)) : m.level,
      xpAfter,
      happinessAfter: Math.min(255, Math.max(0, m.happiness + happinessDelta)),
    };
  });
}
