import { getForm } from '@poke/data';
import type { Zone } from '@poke/content';
import type { PokemonInstance } from '../pokemon';
import { isNewToDex, perfectIvCount } from './filter';
import type { CaughtDex } from './filter';
import type { ExpeditionRoamer } from './run';

/**
 * Plan de Balls : une Ball par catégorie de rencontre, et la décision de lancer prise à chaque
 * rencontre selon le stock restant.
 */

/**
 * Déjà capturé avec au moins N IV parfaits (`iv1` à `iv6`) : catégories facultatives du plan,
 * qui affinent « déjà capturé ».
 */
export const IV_BALL_CATEGORIES = ['iv1', 'iv2', 'iv3', 'iv4', 'iv5', 'iv6'] as const;

/** Catégorie « déjà capturé avec au moins N IV parfaits ». */
export type IvBallCategory = (typeof IV_BALL_CATEGORIES)[number];

/** Catégorie d'IV pour un nombre d'IV parfaits donné (1 à 6). */
export const ivBallCategory = (count: number) => `iv${count}` as IvBallCategory;

/** Catégorie d'un Pokémon rencontré, qui décide de la Ball lancée. */
export type BallCategory = 'new' | 'shiny' | 'caught' | IvBallCategory;

/** Toutes les catégories, dans l'ordre d'affichage du plan de Balls. */
export const BALL_CATEGORIES: readonly BallCategory[] = [
  'new',
  'shiny',
  'caught',
  ...IV_BALL_CATEGORIES,
];

/**
 * Ball à lancer pour chaque catégorie ; null = pas de capture. Une catégorie d'IV absente n'est
 * pas réglée : ses Pokémon tombent dans la catégorie d'IV inférieure réglée, sinon « déjà capturé ».
 */
export type BallPlan = Record<'new' | 'shiny' | 'caught', string | null> &
  Partial<Record<IvBallCategory, string | null>>;

/** Plan vide : aucune Ball, donc aucune capture. */
export const NO_BALL_PLAN: BallPlan = { new: null, shiny: null, caught: null };

/**
 * Chromatique d'abord, puis absent du Pokédex (au départ, ou capturé depuis), sinon déjà capturé :
 * avec le plus grand nombre d'IV parfaits réglé dans le plan qu'il atteint, ou sans précision.
 */
export function ballCategory(
  wild: Pick<PokemonInstance, 'speciesId' | 'formId' | 'isShiny' | 'ivs'>,
  caught: CaughtDex,
  plan?: BallPlan | null,
): BallCategory {
  if (wild.isShiny) return 'shiny';
  if (isNewToDex(caught, wild)) return 'new';
  for (let count = perfectIvCount(wild); count >= 1 && plan; count--) {
    if (plan[ivBallCategory(count)] !== undefined) return ivBallCategory(count);
  }
  return 'caught';
}

/** Ball d'une catégorie du plan (null : pas de capture ou catégorie non réglée). */
export const planBall = (plan: BallPlan, category: BallCategory) => plan[category] ?? null;

/** Le plan prévoit-il au moins une Ball ? */
export const planHasBall = (plan: BallPlan) =>
  BALL_CATEGORIES.some((c) => planBall(plan, c) !== null);

/**
 * Journal des lancers d'une expédition, un caractère par rencontre, écrit au fil de l'expédition
 * quand la Ball est retirée du sac : la catégorie dont la Ball est lancée, `NO_THROW` si la
 * catégorie n'a pas de Ball, `MISSED_THROW` si sa Ball manquait dans le sac à ce moment-là.
 */
export const THROW_CODES: Record<BallCategory, string> = {
  new: 'n',
  shiny: 's',
  caught: 'c',
  iv1: '1',
  iv2: '2',
  iv3: '3',
  iv4: '4',
  iv5: '5',
  iv6: '6',
};

/** Code du journal : la catégorie de la rencontre n'avait pas de Ball dans le plan. */
export const NO_THROW = '-';

/** Code du journal : la Ball prévue manquait dans le sac au moment de la rencontre. */
export const MISSED_THROW = 'x';

const CODE_CATEGORIES = new Map(BALL_CATEGORIES.map((c) => [THROW_CODES[c], c]));

/** Lancer décidé pour une rencontre : une Ball, ou rien (et pourquoi). */
export type ThrowDecision = { ballItemId: string } | { outcome: 'noBall' | 'ignored' };

/** Ce que la décision de lancer connaît d'une rencontre. */
export interface ThrowContext {
  /** Rang de la rencontre (à partir de 1). */
  n: number;
  wild: PokemonInstance;
  category: BallCategory;
  /** Rencontre ordinaire de la zone (ni fuyard ni rencontre spéciale). */
  ordinary: boolean;
  /** Captures connues à ce moment (Pokédex du départ et captures de l'expédition). */
  caught: CaughtDex;
}

/** Décision de lancer, appelée à chaque rencontre. */
export type ChooseThrow = (t: ThrowContext) => ThrowDecision;

/**
 * Lancers d'après le plan de Balls. Avec un journal (`throws`), il fait foi : les rencontres
 * qu'il ne couvre pas ne reçoivent pas de Ball. Sans journal (simulateur), stock illimité.
 */
export function planThrows(plan: BallPlan, throws?: string): ChooseThrow {
  return ({ n, category }) => {
    const code = throws === undefined ? THROW_CODES[category] : (throws[n - 1] ?? NO_THROW);
    if (code === MISSED_THROW) return { outcome: 'noBall' };
    const ballItemId = planBall(plan, CODE_CATEGORIES.get(code) ?? category);
    return code !== NO_THROW && ballItemId ? { ballItemId } : { outcome: 'ignored' };
  };
}

/**
 * État figé au départ d'une expédition à plan de Balls, pour rejouer ses rencontres à l'identique
 * à chaque retrait de Balls puis à la réclamation : captures du Pokédex et pitié des Pokémon
 * qu'elle peut croiser.
 */
export interface CaptureSnapshot {
  speciesIds: number[];
  formIds: number[];
  pity: Record<number, number>;
}

/** Instantané limité aux Pokémon que l'expédition peut croiser (`speciesIds`), formes comprises. */
export function captureSnapshot(
  dex: CaughtDex,
  pity: Readonly<Record<number, number>>,
  speciesIds: Iterable<number>,
): CaptureSnapshot {
  const relevant = new Set(speciesIds);
  return {
    speciesIds: [...dex.speciesIds].filter((id) => relevant.has(id)),
    formIds: [...dex.formIds].filter((id) => relevant.has(getForm(id)?.speciesId ?? -1)),
    pity: Object.fromEntries(Object.entries(pity).filter(([id]) => relevant.has(Number(id)))),
  };
}

/** Espèces qu'une expédition dans la zone peut croiser (zone, rencontres spéciales, fuyards). */
export function zoneSpeciesIds(zone: Zone, roamers: readonly ExpeditionRoamer[] = []): number[] {
  return [
    ...new Set([
      ...zone.encounters.map((e) => e.speciesId),
      ...zone.specialEncounters.map((s) => s.speciesId),
      ...roamers.map((r) => r.target.speciesId),
    ]),
  ];
}
