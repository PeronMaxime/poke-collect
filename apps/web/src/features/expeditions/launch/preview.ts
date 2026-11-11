/**
 * Aperçu d'un départ en expédition : ce que le formulaire annonce avant de partir (Balls lancées,
 * rythme et part des rencontres, captures attendues, butin). Fonctions pures, calculées avec les
 * règles de `@poke/game-core` : ce ne sont que des estimations, le serveur décide du résultat.
 */
import type { Zone } from '@poke/content';
import {
  IV_BALL_CATEGORIES,
  abilityMultiplier,
  captureProbability,
  chainPerfectIvs,
  encounterMinutes,
  encounterProbabilities,
  isNewToDex,
  nextChainPerfectIvThreshold,
  roamerEncounterChance,
  roamerMeetChance,
  specialEncountersFor,
} from '@poke/game-core';
import type {
  AbilityEnv,
  BallCategory,
  BallPlan,
  CaughtDex,
  ExpeditionError,
  GameContext,
  attractedTypes,
} from '@poke/game-core';
import type { PokemonDto, RoamerDto } from '@poke/shared';
import { formatDuration, formatMultiplier, itemName, typeLabel } from '../../../lib/labels';

/** Chance en pourcentage ; les objets rares (1 %, menthes…) ne s'affichent pas « 0 % ». */
export function formatChance(p: number): string {
  const pct = p * 100;
  return pct < 1 ? '< 1 %' : `${Math.round(pct)} %`;
}

/** Première lettre en majuscule. */
export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Durée courte lisible, donnée en minutes : « 30 s », « 3 min », « 3 min 30 s ». */
export function formatShortMinutes(minutes: number): string {
  const seconds = Math.round(minutes * 60);
  const m = Math.floor(seconds / 60);
  const r = seconds % 60;
  if (m === 0) return `${r} s`;
  return r === 0 ? `${m} min` : `${m} min ${r} s`;
}

/** Phrase affichée pour une règle que l'équipe ne respecte pas. */
export function teamErrorText(e: ExpeditionError): string {
  switch (e.code) {
    case 'TEAM_EMPTY':
      return 'Choisis au moins un Pokémon.';
    case 'TEAM_TOO_LARGE':
      return `Au plus ${e.max} Pokémon.`;
    case 'DUPLICATE_MEMBER':
      return 'Un Pokémon est sélectionné deux fois.';
    case 'TOO_MANY_MEGAS':
      return 'Un seul Pokémon Méga-Évolué par équipe.';
    case 'WRONG_REGION':
      return 'Seuls les Pokémon du Pokédex de la région peuvent explorer cette zone.';
    case 'POWER_TOO_LOW':
      return `PE de l’équipe insuffisante (${e.power} / ${e.minPower}).`;
    case 'MISSING_TYPES':
      return `Il manque : ${e.missing.map((m) => `${m.count} × ${typeLabel(m.type)}`).join(', ')}.`;
  }
}

/** État de l'équipe dans la barre de départ : à choisir, première règle non respectée, ou prête. */
export function launchStatus(team: readonly string[], errors: readonly ExpeditionError[]) {
  if (team.length === 0) return { tone: 'idle' as const, text: 'Choisis ton équipe' };
  return errors.length > 0
    ? { tone: 'bad' as const, text: teamErrorText(errors[0]!) }
    : { tone: 'ok' as const, text: 'Équipe prête' };
}

/** Catégories de Pokémon rencontrés qui ont toujours leur Ball (hors IV parfaits). */
export const BASE_BALL_CATEGORIES = ['new', 'shiny', 'caught'] as const;

/**
 * Balls et baies du sac utilisables au départ, chacune de la plus faible à la plus forte : la
 * Ball par défaut reste ainsi la plus courante. `unlimitedItems` (simulateur) les propose toutes.
 */
export function launchItems(
  ctx: GameContext,
  owned: (itemId: string) => number,
  unlimitedItems: boolean,
) {
  const inBag = (itemId: string) => unlimitedItems || owned(itemId) > 0;
  const balls = ctx.content.items
    .filter((i) => ctx.itemEffect(i.id, 'ball') && inBag(i.id))
    .sort(
      (a, b) =>
        ctx.itemEffect(a.id, 'ball')!.catchMultiplier -
        ctx.itemEffect(b.id, 'ball')!.catchMultiplier,
    )
    .map((i) => i.id);
  const berriesWith = (type: 'captureBoost' | 'encounterBoost') =>
    ctx.content.items
      .filter((i) => ctx.itemEffect(i.id, type) && inBag(i.id))
      .sort(
        (a, b) => ctx.itemEffect(a.id, type)!.multiplier - ctx.itemEffect(b.id, type)!.multiplier,
      )
      .map((i) => i.id);
  return {
    balls,
    captureBerries: berriesWith('captureBoost'),
    encounterBerries: berriesWith('encounterBoost'),
  };
}

/**
 * Ball lancée pour chaque catégorie de Pokémon, d'après les choix du joueur (`null` : ne pas
 * capturer). Un choix absent, ou une Ball qui n'est plus dans le sac, retombe sur le choix par
 * défaut : la meilleure Ball (hors capture assurée, comme la Master Ball) pour les nouveaux
 * Pokémon et les shiny, la plus courante pour ceux déjà capturés. Les catégories par nombre d'IV
 * parfaits n'existent que si `showIvBalls` ; par défaut elles prennent la Ball de « déjà capturé ».
 */
export function resolveBallPlan(
  ctx: GameContext,
  balls: readonly string[],
  ballChoice: Partial<BallPlan>,
  showIvBalls: boolean,
): { ballCategories: BallCategory[]; ballPlan: BallPlan } {
  const bestBall =
    balls.filter((id) => !ctx.itemEffect(id, 'ball')!.guaranteed).at(-1) ?? balls[0] ?? null;
  const defaultBall: BallPlan = { new: bestBall, shiny: bestBall, caught: balls[0] ?? null };
  const ballFor = (category: BallCategory): string | null => {
    const chosen = ballChoice[category];
    if (chosen === null) return null;
    if (chosen && balls.includes(chosen)) return chosen;
    return category === 'new' || category === 'shiny' || category === 'caught'
      ? defaultBall[category]
      : ballFor('caught');
  };
  const ballCategories = [...BASE_BALL_CATEGORIES, ...(showIvBalls ? IV_BALL_CATEGORIES : [])];
  const ballPlan = Object.fromEntries(ballCategories.map((c) => [c, ballFor(c)])) as BallPlan;
  return { ballCategories, ballPlan };
}

/**
 * Rythme des rencontres avec les talents de l'équipe (comme au serveur) : l'intervalle et son
 * allongement à chaque heure passée se divisent par leur multiplicateur. Baies à part : leur
 * effet ne dure qu'un temps. Durées en minutes.
 */
export function encounterRhythm(ctx: GameContext, env: AbilityEnv) {
  const { encounterIntervalMinutes, encounterIntervalGrowthMinutes } = ctx.balance.expeditions;
  const rawEncounterSpeed = abilityMultiplier(ctx, env, 'encounters');
  const encounterSpeed = rawEncounterSpeed > 0 ? rawEncounterSpeed : 1;
  const encounterInterval = encounterIntervalMinutes / encounterSpeed;
  const encounterGrowth = (encounterIntervalGrowthMinutes ?? 0) / encounterSpeed;
  const encounterSpeedText =
    encounterSpeed !== 1 ? `talents ${formatMultiplier(encounterSpeed)}` : null;
  // Rencontres de plus en plus espacées : l'intervalle s'allonge à chaque heure passée.
  const growthText =
    [encounterGrowth > 0 ? `+${formatShortMinutes(encounterGrowth)} / h` : null, encounterSpeedText]
      .filter(Boolean)
      .join(' · ') || null;
  const encounterPace = `toutes les ${formatShortMinutes(encounterInterval)}${
    encounterGrowth > 0
      ? ` la première heure, puis ${formatShortMinutes(encounterGrowth)} de plus à chaque heure passée`
      : ''
  }`;
  const encounterTitle = `Une rencontre ${encounterPace}${
    encounterSpeedText
      ? ` (talents de l’équipe ${formatMultiplier(encounterSpeed)} compris ; sans eux, toutes les ${formatShortMinutes(encounterIntervalMinutes)})`
      : ''
  }. Les baies de rencontres l’accélèrent aussi, le temps de leur effet.`;
  return { encounterSpeed, encounterInterval, growthText, encounterPace, encounterTitle };
}

/** Une ligne de l'aperçu des rencontres. */
export interface EncounterRow {
  key: string;
  speciesId: number;
  formId: number | null;
  kind: 'roamer' | 'special' | 'normal';
  /** Part des rencontres, de 0 à 1. */
  share: number;
  /** Infobulle propre aux fuyards et rencontres spéciales. */
  title?: string;
  isNew: boolean;
  /** Ball lancée (null : pas de capture tentée). */
  ballItemId: string | null;
  /** Chance de capture avec cette Ball et la baie de capture (null : pas de capture tentée). */
  chance: number | null;
  /** La même sans la baie de capture, une fois son effet passé. */
  plainChance: number | null;
}

/** Ce dont dépend l'aperçu des rencontres. */
export interface EncounterPreviewInput {
  ctx: GameContext;
  zone: Zone;
  members: PokemonDto[];
  /** Pokémon fuyards cachés dans la zone en ce moment. */
  roamers: RoamerDto[];
  /** Types qu'attirent les talents de l'équipe. */
  attracted: ReturnType<typeof attractedTypes>;
  /** Captures du Pokédex ; absent = tout est nouveau. */
  caught?: CaughtDex;
  ballPlan: BallPlan;
  /** Multiplicateur de la baie de capture emportée. */
  boost?: number;
  /** Nombre de Pokémon de l'équipe dont le type a l'affinité de la zone. */
  affinityCount: number;
  /** Multiplicateur de capture des bonus permanents et des talents. */
  captureBonus: number;
  /** Nombre de rencontres attendues sur la période des estimations. */
  encounters: number;
  /** Période des estimations, telle qu'elle s'écrit (« par heure », « en 2 h »). */
  per: string;
}

/**
 * Aperçu des rencontres : fuyards, rencontres spéciales, puis Pokémon de la zone, chacun avec sa
 * part, sa Ball et sa chance de capture. Fuyards et rencontres spéciales sont dans le même pool
 * que les autres, comme au serveur : chacun est tiré avant les Pokémon de la zone, qui se
 * partagent le reste. Rend aussi les fuyards (les talents qui attirent un type attirent aussi
 * ceux de ce type) et les rencontres spéciales qu'ouvre l'équipe.
 */
export function encounterPreview(input: EncounterPreviewInput) {
  const { ctx, zone, attracted, caught, ballPlan, encounters, per } = input;
  const roamers = input.roamers.map((r) => ({
    ...r,
    encounterChance: roamerEncounterChance(ctx, r, r.encounterChance, attracted),
  }));
  const specials = specialEncountersFor(ctx, zone, input.members);
  const extraChances = [
    ...roamers.map((r) => r.encounterChance),
    ...specials.map((sp) => sp.chance),
  ];
  // Part des rencontres où aucun des `n` premiers n'a été tiré.
  const missedAll = (n: number) =>
    extraChances.slice(0, n).reduce((rest, chance) => rest * (1 - chance / 100), 1);
  const normalShare = missedAll(extraChances.length);
  const captureChance = (
    ballItemId: string | null,
    speciesId: number,
    formId: number | null,
    boostMultiplier: number | undefined,
  ) => {
    const ball = ballItemId ? ctx.itemEffect(ballItemId, 'ball') : undefined;
    if (!ball) return null;
    return captureProbability(ctx, {
      captureRate: ctx.species(speciesId, formId)!.captureRate,
      ballMultiplier: ball.catchMultiplier,
      guaranteed: ball.guaranteed === true,
      boostMultiplier,
      affinityCount: input.affinityCount,
      bonusMultiplier: input.captureBonus,
    });
  };
  const rows: EncounterRow[] = [
    ...roamers.map((r, i) => ({
      key: `roamer:${r.questId}`,
      speciesId: r.speciesId,
      formId: r.formId ?? null,
      kind: 'roamer' as const,
      share: missedAll(i) * (r.encounterChance / 100),
      title: `Pokémon fuyard : ${formatChance(roamerMeetChance(r.encounterChance, encounters))} de chances de le croiser ${per}. Une fois croisé, il ne revient plus et les autres Pokémon retrouvent leur part entière.`,
    })),
    ...specials.map((sp, i) => ({
      key: `special:${sp.speciesId}:${sp.formId ?? ''}`,
      speciesId: sp.speciesId,
      formId: sp.formId ?? null,
      kind: 'special' as const,
      share: missedAll(roamers.length + i) * (sp.chance / 100),
      title: `Rencontre spéciale : ${formatChance(roamerMeetChance(sp.chance, encounters))} de chances de la croiser ${per}, une fois au plus par expédition. Jamais chromatique.`,
    })),
    ...encounterProbabilities(ctx, zone, undefined, attracted).map(
      ({ speciesId, formId, probability }) => ({
        key: `${speciesId}:${formId ?? ''}`,
        speciesId,
        formId,
        kind: 'normal' as const,
        share: probability * normalShare,
      }),
    ),
  ].map((row) => {
    const isNew = !caught || isNewToDex(caught, { speciesId: row.speciesId, formId: row.formId });
    // Ball de la catégorie du Pokémon : nouveau ou déjà capturé.
    const ballItemId = ballPlan[isNew ? 'new' : 'caught'];
    return {
      ...row,
      isNew,
      ballItemId,
      chance: captureChance(ballItemId, row.speciesId, row.formId, input.boost),
      plainChance: captureChance(ballItemId, row.speciesId, row.formId, undefined),
    };
  });
  return { roamers, specials, rows };
}

/**
 * Captures attendues en moyenne sur `encounters` rencontres. `berryShare` (de 0 à 1) est la part
 * du temps que couvrent les baies de capture envoyées : le reste se joue sans elles.
 */
export function expectedCaptures(
  rows: readonly Pick<EncounterRow, 'share' | 'chance' | 'plainChance'>[],
  encounters: number,
  berryShare: number,
): number {
  return Math.round(
    encounters *
      rows.reduce((sum, r) => {
        if (r.chance === null) return sum;
        return sum + r.share * (berryShare * r.chance + (1 - berryShare) * (r.plainChance ?? 0));
      }, 0),
  );
}

/**
 * Balls lancées en moyenne sur `encounters` rencontres (une par rencontre de la catégorie,
 * capturée ou non), de la plus utilisée à la moins utilisée.
 */
export function ballUsage(
  rows: readonly Pick<EncounterRow, 'share' | 'ballItemId'>[],
  encounters: number,
): [itemId: string, count: number][] {
  const usage = new Map<string, number>();
  for (const r of rows) {
    if (r.ballItemId)
      usage.set(r.ballItemId, (usage.get(r.ballItemId) ?? 0) + r.share * encounters);
  }
  return [...usage].sort((a, b) => b[1] - a[1]);
}

/** Ce dont dépend la phrase sur les Balls lancées. */
export interface BallUsageTextInput {
  ctx: GameContext;
  usage: readonly [itemId: string, count: number][];
  encounters: number;
  owned: (itemId: string) => number;
  /** Stock illimité (simulateur) : pas de durée du stock. */
  unlimitedItems: boolean;
  env: AbilityEnv;
  /** Baie de rencontres emportée : elle accélère le rythme, donc l'usage des Balls. */
  encounterBerry: { itemId: string; quantity: number } | null;
}

/**
 * Balls lancées sur la période, avec la durée que couvre le stock au même rythme (rencontres de
 * plus en plus espacées comprises) : « ≈ 12 Poké Ball (stock pour 3 h) · < 1 Super Ball… ».
 */
export function ballUsageText(input: BallUsageTextInput): string {
  const { ctx, encounters, owned, env, encounterBerry } = input;
  const { maxDurationMinutes } = ctx.balance.expeditions;
  return input.usage
    .map(([id, n]) => {
      const count = n < 1 ? '< 1' : `≈ ${Math.round(n)}`;
      if (input.unlimitedItems) return `${count} ${itemName(ctx, id)}`;
      const lasts = encounterMinutes(ctx, (owned(id) * encounters) / n, env, encounterBerry);
      return `${count} ${itemName(ctx, id)} (${
        lasts >= maxDurationMinutes ? 'stock suffisant' : `stock pour ${formatDuration(lasts)}`
      })`;
    })
    .join(' · ');
}

/** Objets du butin de la zone, du plus probable au moins probable à chaque tirage. */
export function zoneLoot(ctx: GameContext, zone: Zone) {
  const lootTable = zone.lootTableId ? ctx.lootTable(zone.lootTableId) : undefined;
  return (lootTable?.entries ?? [])
    .map((e) => ({ itemId: e.itemId, probability: e.chance, min: e.min, max: e.max }))
    .sort((a, b) => b.probability - a.probability);
}

/** Ce que la chaîne de zone apporte à ce départ (maillon, IV parfaits garantis) ; vide sans rien. */
export function chainSummary(ctx: GameContext, chain: number): string {
  const perfectIvs = chainPerfectIvs(ctx, chain);
  const nextIvThreshold = nextChainPerfectIvThreshold(ctx, chain);
  return [
    chain > 0 && `Chaîne ${chain}`,
    perfectIvs > 0 &&
      `chaque Pokémon sauvage aura au moins ${perfectIvs} IV parfait${perfectIvs > 1 ? 's' : ''}`,
    nextIvThreshold !== null &&
      `prochain IV parfait garanti à ${nextIvThreshold} maillon${nextIvThreshold > 1 ? 's' : ''}`,
  ]
    .filter(Boolean)
    .join(' · ');
}
