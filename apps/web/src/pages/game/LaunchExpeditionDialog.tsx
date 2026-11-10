import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Weather, Zone } from '@poke/content';
import {
  IV_BALL_CATEGORIES,
  NO_BONUSES,
  planBall,
  abilityBonuses,
  abilityMultiplier,
  activityAbilityEffects,
  attractedTypes,
  captureProbability,
  chainPerfectIvs,
  checkTeam,
  encounterMinutes,
  encounterProbabilities,
  expectedExpeditionXp,
  expeditionEnv,
  expeditionMinMinutes,
  expeditionPlan,
  isNewToDex,
  maxExpeditionBerries,
  resolveWeather,
  roamerEncounterChance,
  roamerMeetChance,
  specialEncountersFor,
  zoneWeather,
  nextChainPerfectIvThreshold,
  shinyProbability,
} from '@poke/game-core';
import type {
  AbilityEnv,
  BallCategory,
  IvBallCategory,
  BallPlan,
  CaughtDex,
  ExpeditionError,
  GameContext,
  PlayerBonuses,
} from '@poke/game-core';
import type { ExpeditionDto, PokemonDto, RoamerDto, StartExpeditionInput } from '@poke/shared';
import {
  HoverBubble,
  Modal,
  PokemonSprite,
  TypeBadge,
  ViewTabs,
  useNow,
} from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import {
  refreshAfterExpeditionStart,
  useDexCatches,
  usePokemon,
  useExpeditions,
  useInventory,
  useShinyBonus,
  useShinyCharm,
  utcOffsetMinutes,
} from '../../lib/game';
import {
  errorMessage,
  formatDuration,
  formatMultiplier,
  formatPercentBonus,
  formatShinyRate,
  itemIcon,
  itemName,
  speciesName,
  typeLabel,
} from '../../lib/labels';
import {
  ZoneAutoTransferDialog,
  autoTransferLabel,
  effectiveAutoTransfer,
  loadGlobalAutoTransfer,
  parseFilter,
} from './AutoTransferSettings';
import type { ZoneAutoTransfer } from './AutoTransferSettings';
import { AutoSelectButton, TeamPicker, useTeamPicker } from './TeamPicker';
import { SiteChips, TeamPickerDialog, TeamSlots } from './TeamSection';
import { TEAM_WEATHER_NOTE, WeatherIcon, zoneWeatherForecast } from './WeatherIcon';
import { formatXp, usePlayerBonuses } from './XpPreview';
import { BANNER_LABEL, CHECKER, TINTED_BANNER, zoneSpecies, zoneTint } from './zoneBanner';
import {
  LAUNCH_DIALOG_CLASS,
  PowerGauge,
  SECTION_TITLE,
  SELECTED_CELL,
  StatusPill,
} from './dialogParts';

/** Ce que reçoit le choix de l'équipe du formulaire de lancement. */
export interface TeamChoice {
  power: number;
  env: AbilityEnv;
  errors: string[];
  onDone: () => void;
}

/** Classes du popup de lancement, reprises par le simulateur de l'admin. */
export { LAUNCH_DIALOG_CLASS };

/** Les objets rares (1 %, menthes…) ne doivent pas s'afficher « 0 % ». */
function formatChance(p: number): string {
  const pct = p * 100;
  return pct < 1 ? '< 1 %' : `${Math.round(pct)} %`;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Petite Poké Ball dessinée ; `dim` la grise (Pokémon pas encore capturé). */
function BallIcon({
  label,
  dim = false,
  className = 'h-3 w-3',
}: {
  label?: string;
  dim?: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`shrink-0 ${className} ${dim ? 'opacity-40 grayscale' : ''}`}
      {...(label ? { 'aria-label': label, role: 'img' } : { 'aria-hidden': true })}
    >
      <path d="M1 8a7 7 0 0 1 14 0z" fill="#ef4444" />
      <path d="M1 8a7 7 0 0 0 14 0z" fill="#fff" />
      <circle cx="8" cy="8" r="7" fill="none" stroke="#1e293b" strokeWidth="1.5" />
      <path d="M1 8h14" stroke="#1e293b" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="2.2" fill="#fff" stroke="#1e293b" strokeWidth="1.5" />
    </svg>
  );
}

/** Quantité possédée, en pastille au coin d'une icône d'objet. */
const COUNT_BADGE =
  'absolute -right-1.5 -bottom-1 rounded border-2 border-ink bg-win px-0.5 font-mono text-[10px] leading-3 text-slate-900 dark:text-slate-100';

/** Catégories de Pokémon rencontrés, chacune avec sa Ball. */
const BALL_ROWS: Record<BallCategory, { label: string; hint: string; short: string }> = {
  new: { label: 'Nouveau Pokémon', hint: 'Absent de ton Pokédex', short: 'Nouv.' },
  shiny: { label: 'Shiny', hint: 'Chromatique, nouveau ou non', short: '✦' },
  caught: { label: 'Déjà capturé', hint: 'Déjà dans ton Pokédex', short: 'Déjà' },
  ...(Object.fromEntries(
    IV_BALL_CATEGORIES.map((c, i) => [
      c,
      {
        label: `Déjà capturé · ${i + 1} IV`,
        hint: `${i + 1} IV parfait${i > 0 ? 's' : ''} (à 31)`,
        short: `${i + 1} IV`,
      },
    ]),
  ) as Record<IvBallCategory, { label: string; hint: string; short: string }>),
};
const BASE_BALL_CATEGORIES = ['new', 'shiny', 'caught'] as const;

/**
 * Réglages préparés pour une zone (équipe, Balls, baies), retenus sur cet appareil à chaque
 * changement, même sans lancer l'expédition.
 */
interface ZoneSettings {
  team?: string[];
  /** Choix explicites seulement : une catégorie absente prend la Ball par défaut. */
  balls?: Partial<BallPlan>;
  berryItemId?: string | null;
  berryCount?: number;
  /** Sélecteurs par nombre d'IV parfaits affichés (sinon : Ball de « déjà capturé »). */
  showIvBalls?: boolean;
  encounterBerryItemId?: string | null;
  encounterBerryCount?: number;
  /** Transfert automatique : absent = filtre global. */
  autoTransfer?: ZoneAutoTransfer;
}

const settingsKey = (zoneId: string) => `expedition-settings:${zoneId}`;

function storedZoneSettings(zoneId: string): ZoneSettings {
  try {
    const raw = localStorage.getItem(settingsKey(zoneId));
    return raw ? (JSON.parse(raw) as ZoneSettings) : {};
  } catch {
    return {};
  }
}

/** Met à jour une partie des réglages retenus pour la zone. */
function storeZoneSettings(zoneId: string, patch: ZoneSettings) {
  try {
    localStorage.setItem(
      settingsKey(zoneId),
      JSON.stringify({ ...storedZoneSettings(zoneId), ...patch }),
    );
  } catch {
    // Stockage indisponible (navigation privée…) : les réglages ne seront pas retenus.
  }
}

function teamErrorText(e: ExpeditionError): string {
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

export function LaunchExpeditionDialog({
  ctx,
  zone,
  chain,
  onClose,
}: {
  ctx: GameContext;
  zone: Zone;
  /** Maillon de la chaîne de zone qu'aurait cette expédition. */
  chain: number;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const charm = useShinyCharm(ctx);
  const inventory = useInventory();
  // Équipe préparée pour la zone : reprise à l'ouverture (Pokémon toujours disponibles), puis
  // retenue à chaque changement, comme les Balls et baies.
  const pokemon = usePokemon().data;
  const picker = useTeamPicker(ctx, zone, () => {
    const saved = storedZoneSettings(zone.id).team ?? [];
    if (!pokemon) return saved;
    const available = new Set(pokemon.filter((p) => !p.busy && !p.knockedOut).map((p) => p.id));
    return saved.filter((id) => available.has(id));
  });
  // Retenue seulement une fois modifiée : l'ouverture n'efface pas l'équipe préparée (Pokémon
  // encore en expédition…).
  const openingTeam = useRef(picker.team);
  const bonuses = usePlayerBonuses(ctx);
  const owned = new Map(inventory.data?.map((i) => [i.itemId, i.quantity]));
  const roamers = useExpeditions().data?.roamers.filter((r) => r.zoneId === zone.id);
  const dex = useDexCatches();
  useEffect(() => {
    if (picker.team !== openingTeam.current) storeZoneSettings(zone.id, { team: picker.team });
  }, [picker.team, zone.id]);

  const start = useMutation({
    mutationFn: (input: StartExpeditionInput) =>
      api<ExpeditionDto>('/api/expeditions', {
        method: 'POST',
        json: { ...input, utcOffsetMinutes: utcOffsetMinutes() },
      }),
    onSuccess: () => {
      // Fermer avant le rechargement : l'équipe envoyée devient « occupée » et sortirait de la liste.
      onClose();
      return refreshAfterExpeditionStart(queryClient);
    },
  });

  return (
    <Modal open onClose={onClose} wide="xl" className={LAUNCH_DIALOG_CLASS}>
      <LaunchExpeditionForm
        ctx={ctx}
        zone={zone}
        chain={chain}
        charm={charm}
        owned={(itemId) => owned.get(itemId) ?? 0}
        bonuses={bonuses}
        roamers={roamers}
        caught={{ speciesIds: dex.caughtSpeciesIds, formIds: dex.caughtFormIds }}
        team={picker.team}
        members={picker.members}
        renderTeam={({ power, env, errors, onDone }) => (
          <TeamPicker
            ctx={ctx}
            zone={zone}
            picker={picker}
            power={power}
            abilityEnv={env}
            errors={errors}
            onDone={onDone}
          />
        )}
        onAutoTeam={() => picker.autoSelect(ctx.balance.expeditions.maxTeamSize)}
        pending={start.isPending}
        error={
          start.error &&
          (start.error instanceof ApiError ? errorMessage(start.error.code) : 'Erreur inconnue')
        }
        onCancel={onClose}
        rememberSettings
        onSubmit={(input) => start.mutate(input)}
      />
    </Modal>
  );
}

/** Une ligne de l'aperçu des rencontres. */
interface EncounterRow {
  key: string;
  speciesId: number;
  formId: number | null;
  kind: 'roamer' | 'special' | 'normal';
  /** Part des rencontres. */
  share: number;
  /** Infobulle propre aux fuyards et rencontres spéciales. */
  title?: string;
  isNew: boolean;
  /** Ball lancée (null : pas de capture tentée). */
  ballItemId: string | null;
  /** Chance de capture avec cette Ball (null : pas de capture tentée). */
  chance: number | null;
}

/**
 * Réglages d'une expédition (équipe, Balls par catégorie, baies) et aperçu des rencontres et
 * du butin selon le temps passé. Sans accès aux données du joueur : le jeu et le simulateur de
 * l'admin le partagent. À poser dans un `Modal` aux classes `LAUNCH_DIALOG_CLASS` : bandeau en
 * haut, barre de départ en bas, le reste défile.
 */
export function LaunchExpeditionForm({
  ctx,
  zone,
  chain,
  charm,
  owned,
  unlimitedItems = false,
  bonuses,
  weather: forcedWeather,
  roamers: roamersHere = [],
  caught,
  team,
  members,
  renderTeam,
  onAutoTeam,
  extra,
  pending,
  error,
  submitLabel,
  previewMinutes: duration = 60,
  rememberSettings = false,
  onCancel,
  onSubmit,
}: {
  ctx: GameContext;
  zone: Zone;
  /** Maillon de la chaîne de zone qu'aurait cette expédition. */
  chain: number;
  /** Multiplicateur du Charme Chroma (1 = aucun). */
  charm: number;
  /** Quantité possédée d'un objet. */
  owned: (itemId: string) => number;
  /** Stock illimité (simulateur) : les quantités ne sont pas affichées. */
  unlimitedItems?: boolean;
  /** Bonus permanents du joueur (aucun par défaut). */
  bonuses?: PlayerBonuses;
  /** Météo de la zone imposée (simulateur) ; par défaut, celle du moment. */
  weather?: Weather | null;
  /** Pokémon fuyards cachés dans la zone en ce moment. */
  roamers?: RoamerDto[];
  /** Captures du Pokédex (catégorie « nouveau » ou « déjà capturé ») ; absent = tout est nouveau. */
  caught?: CaughtDex;
  team: string[];
  members: PokemonDto[];
  /**
   * Choix de l'équipe (un `TeamPicker`), selon sa PE, l'environnement des talents de l'expédition
   * et les règles qu'elle ne respecte pas ; `onDone` ferme la fenêtre du choix.
   */
  renderTeam: (team: TeamChoice) => ReactNode;
  /** Sélection automatique de l'équipe (bouton à côté de « Gérer »). */
  onAutoTeam?: () => void;
  /** Réglages supplémentaires, en tête de la colonne des réglages. */
  extra?: ReactNode;
  pending: boolean;
  error: ReactNode;
  /**
   * Temps d'expédition des estimations (XP, butin, fuyards) : une heure par défaut ; le simulateur
   * le règle et s'en sert comme temps passé.
   */
  previewMinutes?: number;
  /** Retient les Balls et baies choisies pour la zone, à chaque changement (jeu). */
  rememberSettings?: boolean;
  /** Libellé du bouton de départ (par défaut « Partir »). */
  submitLabel?: string;
  onCancel: () => void;
  /** Avec `previewMinutes`, que le simulateur utilise comme temps passé. */
  onSubmit: (input: StartExpeditionInput, minutes: number) => void;
}) {
  const shinyBonus = useShinyBonus();
  const perfectIvs = chainPerfectIvs(ctx, chain);
  const nextIvThreshold = nextChainPerfectIvThreshold(ctx, chain);
  const {
    maxDurationMinutes,
    maxTeamSize,
    encounterIntervalMinutes,
    encounterIntervalGrowthMinutes,
    lootIntervalMinutes,
    berryDurationMinutes,
  } = ctx.balance.expeditions;
  // Période des estimations : « par heure » par défaut.
  const per = duration === 60 ? 'par heure' : `en ${formatDuration(duration)}`;
  // Du multiplicateur le plus faible au plus fort : la Ball par défaut reste la plus courante.
  const balls = ctx.content.items
    .filter((i) => ctx.itemEffect(i.id, 'ball') && (unlimitedItems || owned(i.id) > 0))
    .sort(
      (a, b) =>
        ctx.itemEffect(a.id, 'ball')!.catchMultiplier -
        ctx.itemEffect(b.id, 'ball')!.catchMultiplier,
    )
    .map((i) => i.id);
  // Baies de capture puis de rencontres, de la plus faible à la plus forte.
  const berriesWith = (type: 'captureBoost' | 'encounterBoost') =>
    ctx.content.items
      .filter((i) => ctx.itemEffect(i.id, type) && (unlimitedItems || owned(i.id) > 0))
      .sort(
        (a, b) => ctx.itemEffect(a.id, type)!.multiplier - ctx.itemEffect(b.id, type)!.multiplier,
      )
      .map((i) => i.id);
  const captureBerries = berriesWith('captureBoost');
  const encounterBerries = berriesWith('encounterBoost');
  // Réglages du dernier départ dans cette zone ; ce qui n'est plus dans le sac retombe sur le
  // choix par défaut.
  const [saved] = useState(() => (rememberSettings ? storedZoneSettings(zone.id) : {}));
  // Par défaut : la meilleure Ball (hors capture assurée, comme la Master Ball) pour les nouveaux
  // Pokémon et les shiny, la plus courante pour ceux déjà capturés.
  const bestBall =
    balls.filter((id) => !ctx.itemEffect(id, 'ball')!.guaranteed).at(-1) ?? balls[0] ?? null;
  const defaultBall: BallPlan = { new: bestBall, shiny: bestBall, caught: balls[0] ?? null };
  const [ballChoice, setBallChoice] = useState<Partial<BallPlan>>(saved.balls ?? {});
  // Sélecteurs par nombre d'IV parfaits : masqués, ces Pokémon prennent la Ball de « déjà
  // capturé » ; affichés, chacun a la sienne (par défaut, celle de « déjà capturé »).
  const [showIvBalls, setShowIvBalls] = useState(saved.showIvBalls ?? false);
  const ivCategories = showIvBalls ? IV_BALL_CATEGORIES : [];
  const ballFor = (category: BallCategory): string | null => {
    const chosen = ballChoice[category];
    if (chosen === null) return null;
    if (chosen && balls.includes(chosen)) return chosen;
    return category === 'new' || category === 'shiny' || category === 'caught'
      ? defaultBall[category]
      : ballFor('caught');
  };
  const ballCategories = [...BASE_BALL_CATEGORIES, ...ivCategories];
  const ballPlan = Object.fromEntries(ballCategories.map((c) => [c, ballFor(c)])) as BallPlan;
  const [berryChoice, setBerryId] = useState(saved.berryItemId ?? null);
  const [berryCount, setBerryCount] = useState(saved.berryCount ?? 1);
  const [encounterBerryChoice, setEncounterBerryId] = useState(saved.encounterBerryItemId ?? null);
  const [encounterBerryCount, setEncounterBerryCount] = useState(saved.encounterBerryCount ?? 1);
  // Transfert automatique (jeu seulement) : filtre global, ou celui retenu pour la zone.
  const [globalAutoTransfer] = useState(loadGlobalAutoTransfer);
  const [zoneAutoTransfer, setZoneAutoTransfer] = useState<ZoneAutoTransfer>(() =>
    saved.autoTransfer?.custom
      ? { custom: true, filter: parseFilter(saved.autoTransfer.filter) }
      : { custom: false },
  );
  const [autoTransferOpen, setAutoTransferOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [tab, setTab] = useState<'encounters' | 'loot'>('encounters');
  // Sur un écran étroit, l'aperçu se replie en une ligne (déplié sur ordinateur).
  const [previewOpen, setPreviewOpen] = useState(false);
  const autoTransfer = rememberSettings
    ? effectiveAutoTransfer(zoneAutoTransfer, globalAutoTransfer)
    : null;
  useEffect(() => {
    if (!rememberSettings) return;
    storeZoneSettings(zone.id, {
      autoTransfer: zoneAutoTransfer,
      balls: ballChoice,
      showIvBalls,
      berryItemId: berryChoice,
      berryCount,
      encounterBerryItemId: encounterBerryChoice,
      encounterBerryCount,
    });
  }, [
    rememberSettings,
    zone.id,
    zoneAutoTransfer,
    ballChoice,
    showIvBalls,
    berryChoice,
    berryCount,
    encounterBerryChoice,
    encounterBerryCount,
  ]);
  const berryId = berryChoice && captureBerries.includes(berryChoice) ? berryChoice : null;
  const encounterBerryId =
    encounterBerryChoice && encounterBerries.includes(encounterBerryChoice)
      ? encounterBerryChoice
      : null;

  // Talents de l'équipe et météo de la zone : estimations à l'instant présent (celui du départ).
  const now = useNow(30_000);
  const placeWeather = forcedWeather !== undefined ? forcedWeather : zoneWeather(zone, now);
  const forecast = forcedWeather !== undefined ? undefined : zoneWeatherForecast(zone, now);
  const site = { ...zone, weather: placeWeather };
  const env = expeditionEnv(site, members, new Date().getHours());
  const check = checkTeam(ctx, site, members, env.hour);
  const minMinutes = expeditionMinMinutes(ctx, zone.minDurationMinutes, env);
  // Rythme des rencontres avec les talents de l'équipe (comme au serveur) : l'intervalle et son
  // allongement à chaque heure passée se divisent par leur multiplicateur. Baies à part : leur
  // effet ne dure qu'un temps.
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
  const berryLimit = maxExpeditionBerries(ctx);
  const maxBerries = (itemId: string | null) =>
    itemId ? (unlimitedItems ? berryLimit : Math.min(berryLimit, owned(itemId))) : 0;
  const berriesTaken = Math.min(berryCount, maxBerries(berryId));
  const encounterBerriesTaken = Math.min(encounterBerryCount, maxBerries(encounterBerryId));
  const encounterBerry = encounterBerryId
    ? { itemId: encounterBerryId, quantity: encounterBerriesTaken }
    : null;
  const plan = expeditionPlan(ctx, duration, env, encounterBerry);
  const weather = resolveWeather(ctx, env);
  const { encounters } = plan;
  const xp = expectedExpeditionXp(ctx, zone, duration, bonuses, env);
  const boost = berryId ? ctx.itemEffect(berryId, 'captureBoost')?.multiplier : undefined;
  // Bonus permanents et talents de l'équipe, comme au serveur.
  const captureBonus = abilityBonuses(ctx, env, bonuses ?? NO_BONUSES).capture;
  const attracted = attractedTypes(ctx, env);
  const possibleEncounters = encounterProbabilities(ctx, zone, undefined, attracted);
  const activeAbilities = activityAbilityEffects(ctx, env);
  // Les talents qui attirent un type attirent aussi les fuyards de ce type.
  const roamers = roamersHere.map((r) => ({
    ...r,
    encounterChance: roamerEncounterChance(ctx, r, r.encounterChance, attracted),
  }));
  // Rencontres spéciales qu'ouvre l'équipe (Pokémon requis exact).
  const specials = specialEncountersFor(ctx, zone, members);
  // Fuyards puis rencontres spéciales dans le même pool que les autres, comme au serveur : chacun
  // est tiré avant les Pokémon de la zone, qui se partagent le reste. Une fois croisé, il en sort
  // et les autres retrouvent leur part entière.
  const extraChances = [
    ...roamers.map((r) => r.encounterChance),
    ...specials.map((sp) => sp.chance),
  ];
  const missedAll = (n: number) =>
    extraChances.slice(0, n).reduce((rest, chance) => rest * (1 - chance / 100), 1);
  const roamerShares = roamers.map((r, i) => missedAll(i) * (r.encounterChance / 100));
  const specialShares = specials.map((sp, i) => missedAll(roamers.length + i) * (sp.chance / 100));
  const normalShare = missedAll(extraChances.length);
  const isNew = (speciesId: number, formId: number | null) =>
    !caught || isNewToDex(caught, { speciesId, formId });
  // Ball lancée selon la catégorie du Pokémon (nouveau ou déjà capturé ; null : pas de capture).
  const ballIdFor = (speciesId: number, formId: number | null) =>
    ballPlan[isNew(speciesId, formId) ? 'new' : 'caught'];
  // Chance de capture avec la Ball de la catégorie du Pokémon (null : pas de capture tentée).
  const captureChanceFor = (speciesId: number, formId: number | null, withBerry = true) => {
    const ballItemId = ballIdFor(speciesId, formId);
    const ball = ballItemId ? ctx.itemEffect(ballItemId, 'ball') : undefined;
    if (!ball) return null;
    return captureProbability(ctx, {
      captureRate: ctx.species(speciesId, formId)!.captureRate,
      ballMultiplier: ball.catchMultiplier,
      guaranteed: ball.guaranteed === true,
      boostMultiplier: withBerry ? boost : undefined,
      affinityCount: check.affinityCount,
      bonusMultiplier: captureBonus,
    });
  };
  // Aperçu des rencontres : fuyards, rencontres spéciales, puis Pokémon de la zone.
  const encounterRows: EncounterRow[] = [
    ...roamers.map((r, i) => ({
      key: `roamer:${r.questId}`,
      speciesId: r.speciesId,
      formId: r.formId ?? null,
      kind: 'roamer' as const,
      share: roamerShares[i]!,
      title: `Pokémon fuyard : ${formatChance(roamerMeetChance(r.encounterChance, encounters))} de chances de le croiser ${per}. Une fois croisé, il ne revient plus et les autres Pokémon retrouvent leur part entière.`,
    })),
    ...specials.map((sp, i) => ({
      key: `special:${sp.speciesId}:${sp.formId ?? ''}`,
      speciesId: sp.speciesId,
      formId: sp.formId ?? null,
      kind: 'special' as const,
      share: specialShares[i]!,
      title: `Rencontre spéciale : ${formatChance(roamerMeetChance(sp.chance, encounters))} de chances de la croiser ${per}, une fois au plus par expédition. Jamais chromatique.`,
    })),
    ...possibleEncounters.map(({ speciesId, formId, probability }) => ({
      key: `${speciesId}:${formId ?? ''}`,
      speciesId,
      formId,
      kind: 'normal' as const,
      share: probability * normalShare,
    })),
  ].map((row) => ({
    ...row,
    isNew: isNew(row.speciesId, row.formId),
    ballItemId: ballIdFor(row.speciesId, row.formId),
    chance: captureChanceFor(row.speciesId, row.formId),
  }));
  const maxShare = Math.max(0.0001, ...encounterRows.map((r) => r.share));
  // Moyennes sur la période des estimations : captures (la baie de capture n'agit que le temps
  // couvert par les baies envoyées), et Balls lancées (une par rencontre de la catégorie,
  // capturée ou non).
  const berryShare = berryId ? Math.min(1, (berriesTaken * berryDurationMinutes) / duration) : 0;
  const expectedCaptures = Math.round(
    encounters *
      encounterRows.reduce((sum, r) => {
        if (r.chance === null) return sum;
        const plain = berryShare < 1 ? captureChanceFor(r.speciesId, r.formId, false)! : 0;
        return sum + r.share * (berryShare * r.chance + (1 - berryShare) * plain);
      }, 0),
  );
  const ballUsage = new Map<string, number>();
  for (const r of encounterRows) {
    if (r.ballItemId)
      ballUsage.set(r.ballItemId, (ballUsage.get(r.ballItemId) ?? 0) + r.share * encounters);
  }
  const usageText = [...ballUsage]
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => {
      const count = n < 1 ? '< 1' : `≈ ${Math.round(n)}`;
      if (unlimitedItems) return `${count} ${itemName(ctx, id)}`;
      // Durée que couvre le stock, au même rythme (rencontres de plus en plus espacées comprises).
      const lasts = encounterMinutes(ctx, (owned(id) * encounters) / n, env, encounterBerry);
      return `${count} ${itemName(ctx, id)} (${
        lasts >= maxDurationMinutes ? 'stock suffisant' : `stock pour ${formatDuration(lasts)}`
      })`;
    })
    .join(' · ');
  // Chance de chaque objet à chaque tirage (un toutes les `lootIntervalMinutes` min).
  const lootTable = zone.lootTableId ? ctx.lootTable(zone.lootTableId) : undefined;
  const loot = (lootTable?.entries ?? [])
    .map((e) => ({ itemId: e.itemId, probability: e.chance, min: e.min, max: e.max }))
    .sort((a, b) => b.probability - a.probability);
  const maxLoot = Math.max(0.0001, ...loot.map((l) => l.probability));
  const shownTab = loot.length > 0 ? tab : 'encounters';

  const shinyRate = formatShinyRate(
    Math.min(
      1,
      shinyProbability(ctx, { chain, charm, bonus: shinyBonus }) *
        abilityMultiplier(ctx, env, 'shinyChance'),
    ),
  );
  const shinyDetails = [
    chain > 0 && `chaîne ${chain}`,
    charm > 1 && 'Charme Chroma',
    shinyBonus > 1 && `bonus +${formatPercentBonus(shinyBonus)}`,
  ]
    .filter(Boolean)
    .join(', ');
  const chainText = [
    chain > 0 && `Chaîne ${chain}`,
    perfectIvs > 0 &&
      `chaque Pokémon sauvage aura au moins ${perfectIvs} IV parfait${perfectIvs > 1 ? 's' : ''}`,
    nextIvThreshold !== null &&
      `prochain IV parfait garanti à ${nextIvThreshold} maillon${nextIvThreshold > 1 ? 's' : ''}`,
  ]
    .filter(Boolean)
    .join(' · ');
  const tint = zoneTint(zoneSpecies(ctx, zone));
  const powerOk = check.power >= zone.minPower;
  const status =
    team.length === 0
      ? { tone: 'idle' as const, text: 'Choisis ton équipe' }
      : check.errors.length > 0
        ? { tone: 'bad' as const, text: teamErrorText(check.errors[0]!) }
        : { tone: 'ok' as const, text: 'Équipe prête' };
  const captureText = `≈ ${expectedCaptures} capture${expectedCaptures > 1 ? 's' : ''} ${per}`;
  const berriesChosen = [
    ...(berryId ? [{ itemId: berryId, count: berriesTaken }] : []),
    ...(encounterBerryId ? [{ itemId: encounterBerryId, count: encounterBerriesTaken }] : []),
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Bandeau de la zone, comme sur sa carte : nom au milieu, PE et météo à gauche. */}
      <header className="relative flex min-h-[4.5rem] shrink-0 flex-wrap items-center gap-2 border-b-[3px] border-ink px-3 py-3 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:px-4">
        {zone.image ? (
          <img
            src={zone.image}
            alt=""
            className="absolute inset-0 h-full w-full object-cover dark:brightness-75"
          />
        ) : (
          <span
            aria-hidden
            className={`absolute inset-0 ${TINTED_BANNER}`}
            style={{ '--tint': tint, ...CHECKER } as CSSProperties}
          />
        )}
        <div className="relative flex items-center gap-1.5">
          <span className={`inline-flex items-center gap-1 whitespace-nowrap ${BANNER_LABEL}`}>
            PE <span className="font-sans text-sm leading-none">≥</span> {zone.minPower}
          </span>
          {(weather || placeWeather || forecast) && (
            <WeatherIcon
              weather={weather ?? 'clear'}
              activity="expedition"
              note={weather !== placeWeather ? TEAM_WEATHER_NOTE : undefined}
              forecast={forecast}
              className="rounded border-2 border-ink bg-win px-1 text-base leading-snug"
            />
          )}
        </div>
        {/* z-10 : placé en tête par `order-first`, le nom serait peint sous le fond du bandeau. */}
        <h2 className="relative z-10 order-first max-w-full rounded border-2 border-ink bg-win px-3 py-1.5 text-center font-pixel text-xs leading-normal sm:order-none">
          {zone.name}
        </h2>
        <div className="relative ml-auto flex justify-end sm:ml-0">
          <button
            type="button"
            className="btn-ghost px-2.5 py-2"
            aria-label="Fermer"
            onClick={onCancel}
          >
            <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="2.5" />
            </svg>
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain lg:flex lg:flex-col lg:overflow-hidden">
        <div className="space-y-2 px-3 pt-3 sm:px-4 lg:shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 basis-60 text-sm text-slate-600 dark:text-slate-300">
              {zone.description}
            </p>
            {chainText && (
              <p
                className="rounded-md border-2 border-dashed border-amber-600 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 dark:border-[#a07a20] dark:bg-[#3d3416] dark:text-[#f8d878]"
                title="Relance la zone avant la fin du délai pour allonger la chaîne."
              >
                ✦ {capitalize(chainText)}
              </p>
            )}
          </div>
          <dl className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 sm:gap-2">
            <Stat label="Arrêt dès" value={formatDuration(minMinutes)} />
            <Stat label="Retour après" value={formatDuration(maxDurationMinutes)} />
            <Stat
              label="Rencontre"
              value={`1 / ${formatShortMinutes(encounterInterval)}`}
              sub={growthText}
              title={encounterTitle}
              tone={encounterSpeed > 1 ? 'better' : encounterSpeed < 1 ? 'worse' : undefined}
            />
            <Stat label="Butin" value={`1 / ${lootIntervalMinutes} min`} />
            <Stat
              label="✦ Shiny"
              value={shinyRate}
              title={shinyDetails ? `Taux chromatique (${shinyDetails})` : 'Taux chromatique'}
              accent
            />
          </dl>
          {roamers.map((r) => (
            <p
              key={r.questId}
              className="flex items-center gap-2 rounded-md border-2 border-amber-500 bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:border-[#a07a20] dark:bg-amber-950/40 dark:text-amber-300"
            >
              <PokemonSprite speciesId={r.speciesId} formId={r.formId} size={40} />
              <span>
                <strong>{speciesName(ctx, r.speciesId, r.formId)}</strong> se cache ici ! Partez à
                sa recherche.
              </span>
            </p>
          ))}
          {specials.map((sp) => (
            <p
              key={`special:${sp.speciesId}:${sp.formId ?? ''}`}
              className="flex items-center gap-2 rounded-md border-2 border-violet-400 bg-violet-50 px-2 py-1 text-xs text-violet-800 dark:bg-violet-950/40 dark:text-violet-300"
            >
              <PokemonSprite speciesId={sp.speciesId} formId={sp.formId} size={40} />
              <span>
                ✧ Grâce à{' '}
                <strong>{speciesName(ctx, sp.requiredSpeciesId, sp.requiredFormId)}</strong>,{' '}
                <strong>{speciesName(ctx, sp.speciesId, sp.formId)}</strong> peut apparaître !
                Chances de le croiser {per} :{' '}
                {formatChance(roamerMeetChance(sp.chance, encounters))}. Il reçoit la Ball de sa
                catégorie (nouveau ou déjà capturé).
              </span>
            </p>
          ))}
        </div>

        <div className="grid gap-3 p-3 sm:p-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_24rem] lg:grid-rows-[minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-3 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
            {extra}

            <section className="tile p-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <h3 className={SECTION_TITLE}>
                  Équipe {members.length} / {maxTeamSize}
                </h3>
                <PowerGauge
                  power={check.power}
                  minPower={zone.minPower}
                  className="order-2 w-full sm:order-none sm:w-auto sm:min-w-16 sm:flex-1"
                />
                <span
                  className={`order-1 ml-auto text-sm font-bold whitespace-nowrap sm:order-none sm:ml-0 ${
                    powerOk
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  PE {check.power}
                  {zone.minPower > 0 && ` / ${zone.minPower}`}
                </span>
                <div className="order-3 grid w-full grid-cols-2 gap-2 sm:order-none sm:flex sm:w-auto">
                  {onAutoTeam && <AutoSelectButton onClick={onAutoTeam} label="⚡ Auto" />}
                  <button type="button" className="btn-primary" onClick={() => setTeamOpen(true)}>
                    {members.length > 0 ? 'Gérer' : 'Choisir'}
                  </button>
                </div>
              </div>
              {(zone.requiredTypes.length > 0 || zone.affinityTypes.length > 0) && (
                <p className="mt-2 flex flex-wrap items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                  {zone.requiredTypes.map((r) => (
                    <span key={r.type} className="flex items-center gap-1">
                      Requis : {r.count} × <TypeBadge type={r.type} />
                    </span>
                  ))}
                  {zone.affinityTypes.length > 0 && <span className="ml-1">Affinité :</span>}
                  {zone.affinityTypes.map((t) => (
                    <TypeBadge key={t} type={t} />
                  ))}
                </p>
              )}
              <div className="mt-3">
                <TeamSlots
                  ctx={ctx}
                  env={env}
                  members={members}
                  xp={xp}
                  maxTeamSize={maxTeamSize}
                  onOpen={() => setTeamOpen(true)}
                />
              </div>
              {members.length > 0 && (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  ≈ <strong className="text-slate-900 dark:text-slate-100">{formatXp(xp)}</strong>{' '}
                  par Pokémon {per} (moyenne, selon les rencontres)
                  {activeAbilities.length > 0 && (
                    <>
                      {' · '}
                      <span className="text-emerald-700 dark:text-emerald-400">
                        ✦ talent actif ici
                      </span>
                    </>
                  )}
                </p>
              )}
              {team.length > 0 && check.errors.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-sm font-medium text-red-600 dark:text-red-400">
                  {check.errors.map((e) => (
                    <li key={e.code}>{teamErrorText(e)}</li>
                  ))}
                </ul>
              )}
              <TeamPickerDialog
                open={teamOpen}
                onClose={() => setTeamOpen(false)}
                title={`Équipe · ${zone.name}`}
                header={<SiteChips site={zone} />}
              >
                {renderTeam({
                  power: check.power,
                  env,
                  errors: check.errors.map(teamErrorText),
                  onDone: () => setTeamOpen(false),
                })}
              </TeamPickerDialog>
            </section>

            <Section
              title="Balls à lancer"
              help={`Rien n’est réservé au départ : à chaque rencontre (${encounterPace}), la Ball de sa catégorie est prise dans ton sac. S’il n’en reste plus à ce moment-là, le Pokémon n’est pas capturé. Les captures se découvrent au retour.${
                showIvBalls
                  ? ' Un Pokémon déjà capturé sans IV parfait reçoit la Ball de « Déjà capturé ».'
                  : ''
              }`}
              summary={BASE_BALL_CATEGORIES.map((category) => {
                const id = planBall(ballPlan, category);
                return (
                  <span key={category} className="inline-flex items-center gap-0.5 pl-1">
                    {BALL_ROWS[category].short}
                    {id ? (
                      <img
                        src={itemIcon(ctx, id)}
                        alt={itemName(ctx, id)}
                        className="size-6 [image-rendering:pixelated]"
                      />
                    ) : (
                      <span className="font-pixel text-red-600 dark:text-red-400">⊘</span>
                    )}
                  </span>
                );
              })}
            >
              {balls.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Aucune Ball dans ton sac : aucun Pokémon ne sera capturé.
                </p>
              ) : (
                <div className="-mx-1 overflow-x-auto px-1">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b-2 border-well-line">
                        <th
                          scope="col"
                          className="pb-1.5 align-bottom text-xs font-normal text-slate-500 dark:text-slate-400"
                        >
                          Pokémon rencontré
                        </th>
                        {balls.map((id) => (
                          <th key={id} scope="col" className="pb-1.5 align-bottom sm:px-0.5">
                            <ItemBubble ctx={ctx} itemId={id}>
                              <span className="relative mx-auto grid size-8 place-items-center sm:size-9">
                                <img
                                  src={itemIcon(ctx, id)}
                                  alt={itemName(ctx, id)}
                                  className="size-7 [image-rendering:pixelated] sm:size-8"
                                />
                                {!unlimitedItems && (
                                  <span className={COUNT_BADGE}>{owned(id)}</span>
                                )}
                              </span>
                            </ItemBubble>
                          </th>
                        ))}
                        <th
                          scope="col"
                          className="pb-1.5 text-center align-bottom text-[11px] leading-tight font-normal text-slate-500 sm:px-0.5 dark:text-slate-400"
                        >
                          <span aria-hidden className="font-pixel sm:hidden">
                            ⊘
                          </span>
                          <span className="max-sm:sr-only">Ne pas capturer</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {ballCategories.map((category) => {
                        const row = BALL_ROWS[category];
                        const chosen = planBall(ballPlan, category);
                        return (
                          <tr
                            key={category}
                            className="border-b border-well-line/60 last:border-b-0"
                          >
                            <th scope="row" className="py-1 pr-2 font-normal">
                              <span className="block text-sm font-medium">{row.label}</span>
                              <span className="hidden text-xs text-slate-500 sm:block dark:text-slate-400">
                                {row.hint}
                              </span>
                            </th>
                            {[...balls, null].map((id) => {
                              const on = chosen === id;
                              return (
                                <td key={id ?? 'none'} className="py-1 sm:px-0.5">
                                  <button
                                    type="button"
                                    aria-pressed={on}
                                    aria-label={`${row.label} : ${id ? itemName(ctx, id) : 'ne pas capturer'}`}
                                    onClick={() => setBallChoice({ ...ballChoice, [category]: id })}
                                    className={`mx-auto grid h-9 w-8 place-items-center sm:w-10 rounded-md border-2 ${
                                      on
                                        ? SELECTED_CELL
                                        : 'border-transparent hover:border-well-line'
                                    }`}
                                  >
                                    {!on ? (
                                      <span className="size-2.5 rounded-full border-2 border-slate-400 dark:border-slate-500" />
                                    ) : id ? (
                                      <img
                                        src={itemIcon(ctx, id)}
                                        alt=""
                                        className="size-7 [image-rendering:pixelated]"
                                      />
                                    ) : (
                                      <span className="font-pixel text-xs text-red-600 dark:text-red-400">
                                        ⊘
                                      </span>
                                    )}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {balls.length > 0 && (
                  <button
                    type="button"
                    className="rounded-md border-2 border-dashed border-well-line px-2.5 py-1 text-xs text-slate-600 hover:border-slate-500 dark:text-slate-300"
                    aria-expanded={showIvBalls}
                    onClick={() => setShowIvBalls(!showIvBalls)}
                  >
                    {showIvBalls
                      ? '− Masquer les Balls par IV parfaits'
                      : '+ Une Ball selon les IV parfaits'}
                  </button>
                )}
                {usageText && (
                  <p className="min-w-0 basis-full text-xs text-slate-500 sm:flex-1 sm:basis-0 sm:text-right dark:text-slate-400">
                    {capitalize(per)} :{' '}
                    <span className="text-slate-900 dark:text-slate-100">{usageText}</span>
                  </p>
                )}
              </div>
            </Section>

            <Section
              title="Baies"
              note="facultatives"
              help={`Une baie de capture et une baie de rencontres au plus. Chacune agit ${berryDurationMinutes} min, l’une après l’autre dès le départ ; celles pas encore entamées sont rendues au retour.`}
              summary={
                berriesChosen.length === 0
                  ? 'Aucune'
                  : berriesChosen.map((b) => (
                      <span key={b.itemId} className="inline-flex items-center gap-0.5">
                        <img
                          src={itemIcon(ctx, b.itemId)}
                          alt={itemName(ctx, b.itemId)}
                          className="size-6 [image-rendering:pixelated]"
                        />
                        ×{b.count}
                      </span>
                    ))
              }
            >
              {captureBerries.length + encounterBerries.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Aucune baie utile dans ton sac.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  <BerrySlot
                    ctx={ctx}
                    title="Capture"
                    items={captureBerries}
                    selected={berryId}
                    quantity={unlimitedItems ? undefined : owned}
                    onSelect={(id) => setBerryId(berryId === id ? null : id)}
                    effect={
                      berryId &&
                      `Capture ${formatMultiplier(ctx.itemEffect(berryId, 'captureBoost')!.multiplier)}`
                    }
                    count={berriesTaken}
                    max={maxBerries(berryId)}
                    minutesEach={berryDurationMinutes}
                    onCount={setBerryCount}
                    empty="Aucune baie de capture dans ton sac."
                  />
                  <BerrySlot
                    ctx={ctx}
                    title="Rencontres"
                    items={encounterBerries}
                    selected={encounterBerryId}
                    quantity={unlimitedItems ? undefined : owned}
                    onSelect={(id) => setEncounterBerryId(encounterBerryId === id ? null : id)}
                    effect={
                      encounterBerryId &&
                      `Rencontres ${formatMultiplier(ctx.itemEffect(encounterBerryId, 'encounterBoost')!.multiplier)}`
                    }
                    count={encounterBerriesTaken}
                    max={maxBerries(encounterBerryId)}
                    minutesEach={berryDurationMinutes}
                    onCount={setEncounterBerryCount}
                    empty="Aucune baie de rencontres dans ton sac."
                  />
                </div>
              )}
            </Section>
          </div>

          <aside
            aria-label="Aperçu de l’expédition"
            className="tile flex min-w-0 flex-col overflow-hidden lg:min-h-0"
          >
            {/* Écran étroit : aperçu replié en une ligne, déplié au toucher. */}
            <button
              type="button"
              className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left lg:hidden"
              aria-expanded={previewOpen}
              onClick={() => setPreviewOpen(!previewOpen)}
            >
              <h3 className={SECTION_TITLE}>Aperçu</h3>
              <span className="min-w-0 flex-1 text-right text-xs text-slate-600 dark:text-slate-300">
                ≈ {encounters} rencontre{encounters > 1 ? 's' : ''} · {captureText}
              </span>
              <Chevron open={previewOpen} />
            </button>
            {!previewOpen && (
              <div className="flex flex-wrap gap-1 px-3 pb-3 lg:hidden">
                {encounterRows.map((row) => (
                  <span key={row.key} className="sprite-well size-10">
                    <PokemonSprite
                      speciesId={row.speciesId}
                      formId={row.formId}
                      size={36}
                      alt={speciesName(ctx, row.speciesId, row.formId)}
                    />
                  </span>
                ))}
              </div>
            )}
            <div className={`${previewOpen ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col lg:flex`}>
              <div className="border-ink p-2 max-lg:border-t-2 max-lg:border-well-line lg:border-b-[3px]">
                <ViewTabs
                  tabs={[
                    { id: 'encounters', label: 'Rencontres', badge: encounterRows.length },
                    ...(loot.length > 0
                      ? [{ id: 'loot' as const, label: 'Butin', badge: loot.length }]
                      : []),
                  ]}
                  selected={shownTab}
                  onSelect={setTab}
                />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {shownTab === 'encounters' ? (
                  <>
                    <div
                      className={`${PREVIEW_ROW} pb-1 text-[11px] text-slate-500 dark:text-slate-400`}
                    >
                      <span>Pokémon</span>
                      <span>Apparition</span>
                      <span className="text-right">Capture</span>
                    </div>
                    <ul className="space-y-1">
                      {encounterRows.map((row) => (
                        <li
                          key={row.key}
                          className={`${PREVIEW_ROW} ${row.chance === null ? 'opacity-40' : ''}`}
                          title={row.title ?? (row.isNew ? 'Pas encore capturé' : 'Déjà capturé')}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span
                              className={`sprite-well size-10 shrink-0 ${
                                row.kind === 'roamer'
                                  ? 'border-amber-500'
                                  : row.kind === 'special'
                                    ? 'border-violet-400'
                                    : ''
                              }`}
                            >
                              <PokemonSprite
                                speciesId={row.speciesId}
                                formId={row.formId}
                                size={36}
                              />
                            </span>
                            <span className="min-w-0">
                              <span
                                className={`block truncate text-sm font-medium ${
                                  row.kind === 'roamer'
                                    ? 'text-amber-800 dark:text-amber-300'
                                    : row.kind === 'special'
                                      ? 'text-violet-800 dark:text-violet-300'
                                      : ''
                                }`}
                              >
                                {row.kind === 'roamer' ? '✦ ' : row.kind === 'special' ? '✧ ' : ''}
                                {ctx.species(row.speciesId, row.formId)!.nameFr}
                              </span>
                              <span
                                className={`flex items-center gap-1 text-[11px] ${
                                  row.isNew
                                    ? 'text-amber-700 dark:text-amber-300'
                                    : 'text-slate-500 dark:text-slate-400'
                                }`}
                              >
                                <BallIcon dim={row.isNew} className="h-3 w-3" />
                                {row.kind === 'roamer'
                                  ? 'Fuyard'
                                  : row.kind === 'special'
                                    ? 'Rencontre spéciale'
                                    : row.isNew
                                      ? 'Nouveau'
                                      : 'Déjà capturé'}
                              </span>
                            </span>
                          </span>
                          <ShareBar value={row.share} max={maxShare} />
                          <span className="text-right text-sm font-semibold tabular-nums">
                            {row.chance === null ? '—' : `${Math.round(row.chance * 100)} %`}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                      Grisé : pas de Ball prévue (un shiny reçoit toujours la Ball « Shiny »).
                    </p>
                  </>
                ) : (
                  <>
                    <div
                      className={`${PREVIEW_ROW} pb-1 text-[11px] text-slate-500 dark:text-slate-400`}
                    >
                      <span>Un tirage toutes les {lootIntervalMinutes} min</span>
                      <span>Chance</span>
                      <span className="text-right">Qté</span>
                    </div>
                    <ul className="space-y-1">
                      {loot.map(({ itemId, probability, min, max }) => (
                        <li key={itemId} className={PREVIEW_ROW}>
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="sprite-well size-10 shrink-0">
                              <img
                                src={itemIcon(ctx, itemId)}
                                alt=""
                                className="size-8 object-contain [image-rendering:pixelated]"
                              />
                            </span>
                            <span className="min-w-0 truncate text-sm font-medium">
                              {itemName(ctx, itemId)}
                            </span>
                          </span>
                          <ShareBar value={probability} max={maxLoot} />
                          <span className="text-right text-sm text-slate-600 tabular-nums dark:text-slate-300">
                            × {min === max ? min : `${min}–${max}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
            {rememberSettings && (
              <div className="flex items-center gap-2 border-t-[3px] border-ink bg-slate-50 px-3 py-2.5 dark:bg-hud-pill">
                <div className="min-w-0 flex-1">
                  <h3 className={SECTION_TITLE}>Transfert auto</h3>
                  <p
                    className="text-xs text-slate-600 dark:text-slate-300"
                    title="Captures transférées contre des Bonbons au retour de l'expédition"
                  >
                    {zoneAutoTransfer.custom ? 'Réglage de la zone' : 'Réglage global'} ·{' '}
                    <strong className="text-slate-900 dark:text-slate-100">
                      {autoTransferLabel(autoTransfer)}
                    </strong>
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-ghost shrink-0 px-3 py-2"
                  onClick={() => setAutoTransferOpen(true)}
                >
                  Régler
                </button>
                <ZoneAutoTransferDialog
                  open={autoTransferOpen}
                  zoneName={zone.name}
                  value={zoneAutoTransfer}
                  globalFilter={globalAutoTransfer}
                  onClose={() => setAutoTransferOpen(false)}
                  onSave={setZoneAutoTransfer}
                />
              </div>
            )}
          </aside>
        </div>
      </div>

      {/* Barre de départ, toujours visible : état de l'équipe, résumé et départ. */}
      <footer className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t-[3px] border-ink bg-tile px-3 py-2.5 sm:px-4">
        {error && (
          <p className="order-first w-full text-sm font-medium text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <StatusPill tone={status.tone} text={status.text} />
        <span className="hidden min-w-0 flex-1 truncate text-sm text-slate-600 sm:block dark:text-slate-300">
          {[
            members.length > 0 && `${members.length} Pokémon · ≈ ${formatXp(xp)} par Pokémon`,
            captureText,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
        {rememberSettings && (
          <span className="hidden text-right text-[11px] leading-tight text-slate-500 xl:block dark:text-slate-400">
            Réglages retenus
            <br />
            pour {zone.name}
          </span>
        )}
        <div className="grid w-full grid-cols-[auto_minmax(0,1fr)] gap-2 sm:flex sm:w-auto">
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Annuler
          </button>
          <button
            type="button"
            className="btn-primary px-6 py-3"
            disabled={check.errors.length > 0 || pending}
            onClick={() =>
              onSubmit(
                {
                  zoneId: zone.id,
                  team,
                  balls: ballPlan,
                  berryItemId: berryId,
                  ...(berryId ? { berryCount: berriesTaken } : {}),
                  encounterBerryItemId: encounterBerryId,
                  ...(encounterBerryId ? { encounterBerryCount: encounterBerriesTaken } : {}),
                  autoTransfer,
                },
                duration,
              )
            }
          >
            {submitLabel ?? 'Partir'}
          </button>
        </div>
      </footer>
    </div>
  );
}

/** Colonnes d'une ligne de l'aperçu : Pokémon (ou objet), part, capture (ou quantité). */
const PREVIEW_ROW = 'grid grid-cols-[minmax(0,1fr)_5rem_3.25rem] items-center gap-x-2';

/** Chiffre de l'en-tête (arrêt, retour, rythme, taux chromatique). */
/** Durée courte lisible : « 30 s », « 3 min », « 3 min 30 s ». */
function formatShortMinutes(minutes: number): string {
  const seconds = Math.round(minutes * 60);
  const m = Math.floor(seconds / 60);
  const r = seconds % 60;
  if (m === 0) return `${r} s`;
  return r === 0 ? `${m} min` : `${m} min ${r} s`;
}

function Stat({
  label,
  value,
  sub,
  title,
  accent = false,
  tone,
}: {
  label: string;
  value: string;
  /** Précision sous la valeur (ex. l'allongement de l'intervalle). */
  sub?: string | null;
  title?: string;
  accent?: boolean;
  /** Valeur modifiée par l'équipe (talents) : en vert si meilleure, en rouge si moins bonne. */
  tone?: 'better' | 'worse';
}) {
  return (
    <div
      title={title}
      className={`flex min-w-0 flex-col gap-0.5 rounded-md border-2 bg-slate-50 px-2 py-1 sm:px-2.5 sm:py-1.5 dark:bg-hud-pill ${
        accent ? 'border-amber-500 dark:border-[#a07a20]' : 'border-well-line'
      }`}
    >
      <dt
        className={`font-pixel text-[8px] leading-normal uppercase ${
          accent ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400'
        }`}
      >
        {label}
      </dt>
      <dd
        className={`truncate text-sm font-semibold ${
          tone === 'better'
            ? 'text-emerald-700 dark:text-emerald-400'
            : tone === 'worse'
              ? 'text-red-700 dark:text-red-400'
              : ''
        }`}
      >
        {value}
      </dd>
      {sub && (
        <dd className="truncate text-[11px] leading-tight text-slate-500 dark:text-slate-400">
          {sub}
        </dd>
      )}
    </div>
  );
}

/** Part d'une rencontre ou chance d'un objet : pourcentage et barre (relative au plus fréquent). */
function ShareBar({ value, max }: { value: number; max: number }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-xs font-medium tabular-nums">{formatChance(value)}</span>
      <span className="block h-1.5 overflow-hidden rounded-sm border border-ink bg-well">
        <span className="block h-full bg-[#48a8e8]" style={{ width: `${(value / max) * 100}%` }} />
      </span>
    </span>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 10 6"
      aria-hidden
      className={`h-1.5 w-2.5 shrink-0 text-slate-500 transition-transform dark:text-slate-400 ${open ? 'rotate-180' : ''}`}
    >
      <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/** Explication d'une section, dans une bulle au survol (ou au toucher). */
function HelpBubble({ text }: { text: string }) {
  return (
    <HoverBubble width={260} height={130} className="inline-flex shrink-0" content={text}>
      <span className="grid size-5 cursor-help place-items-center rounded border-2 border-well-line font-pixel text-[8px] text-slate-500 dark:text-slate-400">
        <span aria-hidden>?</span>
        <span className="sr-only">{text}</span>
      </span>
    </HoverBubble>
  );
}

/**
 * Section des réglages : toujours dépliée sur ordinateur ; sur un écran étroit, repliée en une
 * ligne qui résume le choix (les réglages sont retenus par zone, il suffit de les vérifier).
 */
function Section({
  title,
  note,
  help,
  summary,
  children,
}: {
  title: string;
  note?: string;
  help?: string;
  summary: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="tile">
      <div className="flex min-h-11 items-center gap-2 px-3 py-2">
        <h3 className={SECTION_TITLE}>{title}</h3>
        {note && <span className="text-xs text-slate-500 dark:text-slate-400">{note}</span>}
        {help && <HelpBubble text={help} />}
        <button
          type="button"
          className="flex min-h-9 min-w-0 flex-1 items-center justify-end gap-2 lg:hidden"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <span className="sr-only">
            {open ? 'Replier' : 'Déplier'} : {title}
          </span>
          {!open && (
            <span className="flex min-w-0 items-center justify-end gap-1.5 text-xs text-slate-600 dark:text-slate-300">
              {summary}
            </span>
          )}
          <Chevron open={open} />
        </button>
      </div>
      <div className={`px-3 pb-3 ${open ? '' : 'hidden'} lg:block`}>{children}</div>
    </section>
  );
}

/** Nom et description d'un objet au survol. */
function ItemBubble({
  ctx,
  itemId,
  children,
}: {
  ctx: GameContext;
  itemId: string;
  children: ReactNode;
}) {
  return (
    <HoverBubble
      width={220}
      height={70}
      focusable={false}
      className="block"
      content={
        <span className="block space-y-0.5">
          <span className="block font-medium">{itemName(ctx, itemId)}</span>
          {ctx.item(itemId)?.description && (
            <span className="block">{ctx.item(itemId)!.description}</span>
          )}
        </span>
      }
    >
      {children}
    </HoverBubble>
  );
}

/** Baies d'une sorte (capture ou rencontres) : choix de la baie et nombre à envoyer. */
function BerrySlot({
  ctx,
  title,
  items,
  selected,
  quantity,
  onSelect,
  effect,
  count,
  max,
  minutesEach,
  onCount,
  empty,
}: {
  ctx: GameContext;
  title: string;
  items: readonly string[];
  selected: string | null;
  /** Quantité possédée ; absente = stock illimité (simulateur). */
  quantity?: (itemId: string) => number;
  onSelect: (itemId: string) => void;
  /** Effet de la baie choisie (« Capture ×1,5 »). */
  effect: string | null;
  count: number;
  max: number;
  /** Temps d'effet de chaque baie. */
  minutesEach: number;
  onCount: (count: number) => void;
  empty: string;
}) {
  const setCount = (n: number) => onCount(Math.max(1, Math.min(max, n)));
  return (
    <div className="rounded-md border-2 border-well-line p-2.5">
      <p className="font-pixel text-[8px] leading-normal text-slate-500 uppercase dark:text-slate-400">
        {title}
      </p>
      {items.length === 0 ? (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{empty}</p>
      ) : (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex flex-wrap gap-1.5">
            {items.map((itemId) => {
              const on = itemId === selected;
              return (
                <ItemBubble key={itemId} ctx={ctx} itemId={itemId}>
                  <button
                    type="button"
                    onClick={() => onSelect(itemId)}
                    aria-pressed={on}
                    aria-label={itemName(ctx, itemId)}
                    className={`relative grid size-11 place-items-center rounded-md border-2 ${
                      on ? SELECTED_CELL : 'border-well-line bg-well hover:border-slate-500'
                    }`}
                  >
                    <img
                      src={itemIcon(ctx, itemId)}
                      alt=""
                      className="size-8 [image-rendering:pixelated]"
                    />
                    {quantity && <span className={COUNT_BADGE}>{quantity(itemId)}</span>}
                  </button>
                </ItemBubble>
              );
            })}
          </div>
          {selected ? (
            <div className="flex items-center gap-1.5 text-xs">
              <button
                type="button"
                className="btn-ghost size-8 p-0"
                aria-label="Une baie de moins"
                disabled={count <= 1}
                onClick={() => setCount(count - 1)}
              >
                −
              </button>
              <input
                type="number"
                className="input w-14 px-1 py-1 text-center"
                aria-label={`Nombre de baies (${title.toLowerCase()})`}
                min={1}
                max={max}
                value={count}
                onChange={(e) => setCount(Number(e.target.value) || 1)}
              />
              <button
                type="button"
                className="btn-ghost size-8 p-0"
                aria-label="Une baie de plus"
                disabled={count >= max}
                onClick={() => setCount(count + 1)}
              >
                +
              </button>
              <span className="text-slate-500 dark:text-slate-400">/ {max}</span>
            </div>
          ) : (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Touche une baie pour l’emporter.
            </span>
          )}
        </div>
      )}
      {selected && effect && (
        <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300">
          {effect} pendant les {formatDuration(count * minutesEach)} qui suivent le départ.
        </p>
      )}
    </div>
  );
}
