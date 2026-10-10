import type { GameContext } from './context';
import { baseShinyProbability } from './context';

/**
 * Shinies : taux de base (rencontres et éclosions) et multiplicateurs, tous réglables dans
 * l'Équilibrage. Les multiplicateurs se cumulent en se multipliant.
 */

export interface ShinyFactors {
  /** Maillons de la chaîne de zone (expéditions relancées de suite dans la même zone). */
  chain?: number;
  /** Multiplicateur du Charme Chroma possédé (1 = aucun). */
  charm?: number;
  /** Éclosion : parents d'origines différentes (méthode Masuda). */
  masuda?: boolean;
}

/** Au-delà, la chaîne n'augmente plus (le multiplicateur est plafonné bien avant). */
export const MAX_SHINY_CHAIN = 999;

export function chainMultiplier(ctx: GameContext, chain: number): number {
  const { chainBonusPerExpedition, chainMaxMultiplier } = ctx.balance.shiny;
  return Math.min(chainMaxMultiplier, 1 + chainBonusPerExpedition * Math.max(0, chain));
}

/** IV parfaits garantis aux Pokémon sauvages par la chaîne : un par palier atteint. */
export function chainPerfectIvs(ctx: GameContext, chain: number): number {
  return ctx.balance.shiny.chainPerfectIvThresholds.filter((t) => chain >= t).length;
}

/** Prochain palier d'IV parfaits de la chaîne ; null une fois le dernier atteint. */
export function nextChainPerfectIvThreshold(ctx: GameContext, chain: number): number | null {
  return ctx.balance.shiny.chainPerfectIvThresholds.find((t) => chain < t) ?? null;
}

export function shinyMultiplier(ctx: GameContext, factors: ShinyFactors = {}): number {
  return (
    chainMultiplier(ctx, factors.chain ?? 0) *
    (factors.charm ?? 1) *
    (factors.masuda ? ctx.balance.shiny.masudaMultiplier : 1)
  );
}

/** Probabilité qu'une rencontre ou une éclosion soit shiny, multiplicateurs compris. */
export function shinyProbability(ctx: GameContext, factors: ShinyFactors = {}): number {
  return Math.min(1, baseShinyProbability(ctx) * shinyMultiplier(ctx, factors));
}

/** Charme Chroma : meilleur multiplicateur parmi les objets possédés (non cumulable). */
export function charmMultiplier(ctx: GameContext, ownedItemIds: Iterable<string>): number {
  let best = 1;
  for (const id of ownedItemIds) {
    best = Math.max(best, ctx.itemEffect(id, 'shinyCharm')?.multiplier ?? 1);
  }
  return best;
}

/** Méthode Masuda : les deux parents viennent de régions d'origine connues et différentes. */
export function isMasudaPair(
  a: { originRegion?: string | null },
  b: { originRegion?: string | null },
): boolean {
  return !!a.originRegion && !!b.originRegion && a.originRegion !== b.originRegion;
}

// --- Chaîne de zone ---------------------------------------------------------------------

/** Expédition récente du joueur dans une zone. */
export interface ZoneRun {
  chain: number;
  /** Null tant que l'expédition n'est pas récupérée. */
  claimedAt: Date | null;
}

export interface ZoneChainStatus {
  /** Maillon qu'aurait une expédition lancée maintenant dans la zone. */
  chain: number;
  /** Date où la chaîne retombe à 0 faute de relance ; null si elle ne peut pas expirer. */
  expiresAt: Date | null;
}

/**
 * Chaîne de zone : relancer la zone dans le délai imparti après avoir récupéré l'expédition
 * précédente ajoute un maillon. Les expéditions parallèles dans la même zone partagent le
 * maillon en cours (sans l'augmenter). Passé le délai, la chaîne retombe à 0.
 */
export function zoneChainStatus(
  ctx: GameContext,
  runs: readonly ZoneRun[],
  now: Date,
): ZoneChainStatus {
  const windowMs = ctx.balance.shiny.chainWindowMinutes * 60_000;
  let chain = 0;
  let expiresAt: Date | null = null;
  let running = false;
  for (const run of runs) {
    if (run.claimedAt === null) {
      if (run.chain > chain || (run.chain === chain && chain > 0)) {
        chain = run.chain;
        running = true;
      }
      continue;
    }
    const end = run.claimedAt.getTime() + windowMs;
    if (end < now.getTime()) continue;
    const next = run.chain + 1;
    if (next > chain) {
      chain = next;
      running = false;
      expiresAt = new Date(end);
    } else if (next === chain && !running && (!expiresAt || end > expiresAt.getTime())) {
      expiresAt = new Date(end);
    }
  }
  return {
    chain: Math.min(chain, MAX_SHINY_CHAIN),
    expiresAt: chain > 0 && !running ? expiresAt : null,
  };
}
