import type { Encounter, SpecialEncounter, Zone } from '@poke/content';
import type { GameContext } from '../context';
import type { PokemonInstance } from '../pokemon';

/**
 * Qui est rencontré dans une zone, et avec quelle probabilité de capture (pitié comprise).
 */

export function pityMultiplier(ctx: GameContext, misses: number): number {
  const { weightBonusPerMiss, maxMultiplier } = ctx.balance.pity;
  return Math.min(maxMultiplier, 1 + weightBonusPerMiss * misses);
}

export interface CaptureFactors {
  captureRate: number;
  ballMultiplier: number;
  /** Ball à capture assurée (Master Ball). */
  guaranteed?: boolean;
  boostMultiplier?: number;
  /** Nombre de membres de l'équipe en affinité avec la zone. */
  affinityCount?: number;
  /** Bonus permanent du joueur (collections). */
  bonusMultiplier?: number;
}

/**
 * Inspirée de la formule officielle : a = (3 PVmax − 2 PV) / (3 PVmax) × taux × Ball,
 * probabilité ≈ a / 255, puis bonus d'affinité et multiplicateur global.
 */
export function captureProbability(ctx: GameContext, f: CaptureFactors): number {
  if (f.guaranteed) return 1;
  const { globalMultiplier, assumedHpFraction, affinityBonusPerPokemon } = ctx.balance.capture;
  const hpFactor = (3 - 2 * assumedHpFraction) / 3;
  const affinity = 1 + affinityBonusPerPokemon * (f.affinityCount ?? 0);
  const a =
    f.captureRate *
    f.ballMultiplier *
    (f.boostMultiplier ?? 1) *
    hpFactor *
    affinity *
    (f.bonusMultiplier ?? 1) *
    globalMultiplier;
  return Math.min(1, Math.max(0, a / 255));
}

/**
 * Rencontres actives de la zone (espèces désactivées exclues), poids ajustés par la pitié et
 * par les types qu'attirent les talents de l'équipe (multiplicateurs par type, cumulés).
 */
export function weightedEncounters(
  ctx: GameContext,
  zone: Zone,
  pity: ReadonlyMap<number, number> = new Map(),
  attracted: ReadonlyMap<string, number> = new Map(),
): { value: Encounter; weight: number }[] {
  const typeFactor = (e: Encounter) =>
    attracted.size === 0
      ? 1
      : (ctx.species(e.speciesId, e.formId)?.types ?? []).reduce(
          (f, t) => f * (attracted.get(t) ?? 1),
          1,
        );
  return zone.encounters
    .filter((e) => ctx.species(e.speciesId)?.enabled)
    .map((e) => ({
      value: e,
      weight: e.weight * pityMultiplier(ctx, pity.get(e.speciesId) ?? 0) * typeFactor(e),
    }));
}

/**
 * Rencontres spéciales qu'ouvrent des Pokémon (l'équipe d'une expédition, ou ceux du joueur pour
 * l'affichage) : il faut le Pokémon requis exact, espèce et forme, pas une évolution.
 */
export function specialEncountersFor(
  ctx: GameContext,
  zone: Pick<Zone, 'specialEncounters'>,
  pokemon: readonly Pick<PokemonInstance, 'speciesId' | 'formId'>[],
): SpecialEncounter[] {
  return zone.specialEncounters.filter(
    (s) =>
      ctx.species(s.speciesId)?.enabled &&
      pokemon.some(
        (p) =>
          p.speciesId === s.requiredSpeciesId && (p.formId ?? null) === (s.requiredFormId ?? null),
      ),
  );
}

/** Probabilité d'apparition de chaque espèce (pour l'admin et l'affichage). */
export function encounterProbabilities(
  ctx: GameContext,
  zone: Zone,
  pity?: ReadonlyMap<number, number>,
  attracted?: ReadonlyMap<string, number>,
): { speciesId: number; formId: number | null; probability: number }[] {
  const entries = weightedEncounters(ctx, zone, pity, attracted);
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  const byForm = new Map<
    string,
    { speciesId: number; formId: number | null; probability: number }
  >();
  for (const e of entries) {
    const formId = e.value.formId ?? null;
    const key = `${e.value.speciesId}:${formId}`;
    const current = byForm.get(key) ?? { speciesId: e.value.speciesId, formId, probability: 0 };
    current.probability += e.weight / total;
    byForm.set(key, current);
  }
  return [...byForm.values()];
}
