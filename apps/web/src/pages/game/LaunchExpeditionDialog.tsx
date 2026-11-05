import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Weather, Zone } from '@poke/content';
import {
  IV_BALL_CATEGORIES,
  NO_BONUSES,
  planBall,
  abilityBonuses,
  abilityMultiplier,
  attractedTypes,
  captureProbability,
  chainPerfectIvs,
  checkTeam,
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
import { HoverBubble, Modal, PokemonSprite, TypeBadge, useNow } from '../../components/ui';
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
  GAME_ERRORS,
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
  AutoTransferButton,
  ZoneAutoTransferDialog,
  effectiveAutoTransfer,
  loadGlobalAutoTransfer,
  parseFilter,
} from './AutoTransferSettings';
import type { ZoneAutoTransfer } from './AutoTransferSettings';
import { TeamPicker, pillClass, useTeamPicker } from './TeamPicker';
import { TeamSection } from './TeamSection';
import { TEAM_WEATHER_NOTE, WeatherIcon, zoneWeatherForecast } from './WeatherIcon';
import { formatXp, usePlayerBonuses } from './XpPreview';

export { pillClass };

/** Les objets rares (1 %, menthes…) ne doivent pas s'afficher « 0 % ». */
function formatChance(p: number): string {
  const pct = p * 100;
  return pct < 1 ? '< 1 %' : `${Math.round(pct)} %`;
}

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

/** Colonnes d'une ligne des rencontres : Pokémon, apparition, capture. */
const ENCOUNTER_ROW = 'grid grid-cols-[minmax(0,1fr)_4.5rem_4rem] items-center gap-x-1';

/** Cellule « Capture » d'une rencontre ; un tiret quand aucune capture n'est tentée. */
function CaptureChance({ chance }: { chance: number | null }) {
  return (
    <span
      className="text-right tabular-nums text-slate-500"
      title="Chance de capture avec la Ball et la baie choisies"
    >
      {chance === null ? '—' : `${Math.round(chance * 100)} %`}
    </span>
  );
}

/** En-tête des colonnes des rencontres (répété en haut de chaque colonne sur grand écran). */
function EncounterHeader({ className = '' }: { className?: string }) {
  return (
    <li
      aria-hidden
      className={`${ENCOUNTER_ROW} pb-1 text-[11px] font-medium text-slate-500 ${className}`}
    >
      <span>Pokémon</span>
      <span className="text-right">Apparition</span>
      <span className="text-right">Capture</span>
    </li>
  );
}

const LOOT_ROW = 'grid grid-cols-[minmax(0,1fr)_4.5rem_4rem] items-center gap-x-1';

/** En-tête des colonnes du butin (répété en haut de chaque colonne sur grand écran). */
function LootHeader({ className = '' }: { className?: string }) {
  return (
    <li
      aria-hidden
      className={`${LOOT_ROW} pb-1 text-[11px] font-medium text-slate-500 ${className}`}
    >
      <span>Objet</span>
      <span className="text-right">Chance</span>
      <span className="text-right">Quantité</span>
    </li>
  );
}

/** Catégories de Pokémon rencontrés, chacune avec sa Ball. */
const BALL_ROWS: Record<BallCategory, { label: string; hint: string }> = {
  new: { label: 'Nouveau Pokémon', hint: 'Absent de ton Pokédex.' },
  shiny: { label: 'Shiny', hint: 'Chromatique, nouveau ou non.' },
  caught: { label: 'Déjà capturé', hint: 'Déjà dans ton Pokédex.' },
  ...(Object.fromEntries(
    IV_BALL_CATEGORIES.map((c, i) => [
      c,
      {
        label: `Déjà capturé · ${i + 1} IV parfait${i > 0 ? 's' : ''}`,
        hint: `Déjà dans ton Pokédex, avec ${i + 1} IV à 31.`,
      },
    ]),
  ) as Record<IvBallCategory, { label: string; hint: string }>),
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
    <Modal open onClose={onClose} wide>
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
        renderTeam={(power, env) => (
          <TeamPicker ctx={ctx} zone={zone} picker={picker} power={power} abilityEnv={env} />
        )}
        pending={start.isPending}
        error={
          start.error &&
          (start.error instanceof ApiError
            ? (GAME_ERRORS[start.error.code] ?? start.error.code)
            : 'Erreur inconnue')
        }
        onCancel={onClose}
        rememberSettings
        onSubmit={(input) => start.mutate(input)}
      />
    </Modal>
  );
}

/**
 * Réglages d'une expédition (équipe, Balls par catégorie, baies) et aperçu des rencontres et
 * du butin selon le temps passé. Sans accès aux données du joueur : le jeu et le simulateur de
 * l'admin le partagent.
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
  /** Choix de l'équipe, selon sa PE et l'environnement des talents de l'expédition. */
  renderTeam: (power: number, env: AbilityEnv) => ReactNode;
  /** Réglages supplémentaires, sous l'aperçu de la durée. */
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
    encounterIntervalMinutes,
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
  const ballPlan = Object.fromEntries(
    [...BASE_BALL_CATEGORIES, ...ivCategories].map((c) => [c, ballFor(c)]),
  ) as BallPlan;
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
  // Chance de capture avec la Ball de la catégorie du Pokémon (null : pas de capture tentée).
  const captureChanceFor = (speciesId: number, formId: number | null) => {
    const ballItemId =
      ballPlan[!caught || isNewToDex(caught, { speciesId, formId }) ? 'new' : 'caught'];
    const ball = ballItemId ? ctx.itemEffect(ballItemId, 'ball') : undefined;
    if (!ball) return null;
    return captureProbability(ctx, {
      captureRate: ctx.species(speciesId, formId)!.captureRate,
      ballMultiplier: ball.catchMultiplier,
      guaranteed: ball.guaranteed === true,
      boostMultiplier: boost,
      affinityCount: check.affinityCount,
      bonusMultiplier: captureBonus,
    });
  };
  // Chance de chaque objet à chaque tirage (un toutes les `lootIntervalMinutes` min).
  const lootTable = zone.lootTableId ? ctx.lootTable(zone.lootTableId) : undefined;
  const loot = (lootTable?.entries ?? [])
    .map((e) => ({ itemId: e.itemId, probability: e.chance, min: e.min, max: e.max }))
    .sort((a, b) => b.probability - a.probability);

  return (
    <>
      <h2 className="flex items-center gap-2 text-xl font-bold">
        {zone.name}
        {(weather || placeWeather || forecast) && (
          <WeatherIcon
            weather={weather ?? 'clear'}
            activity="expedition"
            note={weather !== placeWeather ? TEAM_WEATHER_NOTE : undefined}
            forecast={forecast}
          />
        )}
      </h2>
      <p className="text-sm text-slate-500">{zone.description}</p>

      <p className="mt-3 text-sm">
        Arrêt possible après <strong>{formatDuration(minMinutes)}</strong>, retour de lui-même après{' '}
        <strong>{formatDuration(maxDurationMinutes)}</strong>. Une rencontre toutes les{' '}
        {encounterIntervalMinutes} min, un butin toutes les {lootIntervalMinutes} min.
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Taux chromatique :{' '}
        {formatShinyRate(
          Math.min(
            1,
            shinyProbability(ctx, { chain, charm, bonus: shinyBonus }) *
              abilityMultiplier(ctx, env, 'shinyChance'),
          ),
        )}
        {(chain > 0 || charm > 1 || shinyBonus > 1) &&
          ` (${[
            chain > 0 && `chaîne ${chain}`,
            charm > 1 && 'Charme Chroma',
            shinyBonus > 1 && `bonus +${formatPercentBonus(shinyBonus)}`,
          ]
            .filter(Boolean)
            .join(', ')})`}
        .
        {perfectIvs > 0 &&
          ` Chaque Pokémon sauvage aura au moins ${perfectIvs} IV parfait${perfectIvs > 1 ? 's' : ''}.`}
        {nextIvThreshold !== null &&
          ` Prochain IV parfait garanti à ${nextIvThreshold} maillon${nextIvThreshold > 1 ? 's' : ''}.`}
      </p>
      {roamers.map((r) => (
        <p
          key={r.questId}
          className="mt-2 flex items-center gap-2 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
        >
          <PokemonSprite speciesId={r.speciesId} formId={r.formId} size={40} />
          <span>
            <strong>{speciesName(ctx, r.speciesId, r.formId)}</strong> se cache ici ! Partez à sa
            recherche.
          </span>
        </p>
      ))}
      {specials.map((sp) => (
        <p
          key={`special:${sp.speciesId}:${sp.formId ?? ''}`}
          className="mt-2 flex items-center gap-2 rounded-lg bg-violet-50 px-2 py-1 text-xs text-violet-800 dark:bg-violet-950/40 dark:text-violet-300"
        >
          <PokemonSprite speciesId={sp.speciesId} formId={sp.formId} size={40} />
          <span>
            ✧ Grâce à <strong>{speciesName(ctx, sp.requiredSpeciesId, sp.requiredFormId)}</strong>,{' '}
            <strong>{speciesName(ctx, sp.speciesId, sp.formId)}</strong> peut apparaître ! Chances
            de le croiser {per} : {formatChance(roamerMeetChance(sp.chance, encounters))}. Il reçoit
            la Ball de sa catégorie (nouveau ou déjà capturé).
          </span>
        </p>
      ))}
      {extra}

      <TeamSection
        ctx={ctx}
        title={`Équipe · ${zone.name}`}
        env={env}
        members={members}
        xp={xp}
        maxTeamSize={ctx.balance.expeditions.maxTeamSize}
        power={check.power}
        minPower={zone.minPower}
        xpNote={`≈ ${formatXp(xp)} par Pokémon ${per} (moyenne, selon les rencontres).`}
        errors={check.errors.map(teamErrorText)}
      >
        {renderTeam(check.power, env)}
      </TeamSection>

      <h3 className="mt-5 text-sm font-semibold">Balls à lancer</h3>
      <div className="mt-2 divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {[...BASE_BALL_CATEGORIES, ...ivCategories].map((category) => (
          <div
            key={category}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2"
          >
            <div className="flex min-w-0 items-start gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">{BALL_ROWS[category].label}</p>
                <p className="text-xs text-slate-500">{BALL_ROWS[category].hint}</p>
              </div>
              {category === 'caught' && (
                <button
                  type="button"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-300 text-sm font-bold text-slate-600 hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-300"
                  title={
                    showIvBalls
                      ? 'Masquer les Balls par IV parfaits (même Ball que « déjà capturé »)'
                      : 'Choisir une Ball selon le nombre d’IV parfaits'
                  }
                  aria-expanded={showIvBalls}
                  onClick={() => setShowIvBalls(!showIvBalls)}
                >
                  {showIvBalls ? '−' : '+'}
                </button>
              )}
            </div>
            <ItemTiles
              ctx={ctx}
              items={balls}
              selected={planBall(ballPlan, category)}
              quantity={unlimitedItems ? undefined : owned}
              noneLabel="Ne pas capturer"
              onSelect={(itemId) => setBallChoice({ ...ballChoice, [category]: itemId })}
            />
          </div>
        ))}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Rien n’est réservé au départ : à chaque rencontre (toutes les {encounterIntervalMinutes}{' '}
        min), la Ball de sa catégorie est prise dans ton sac. S’il n’en reste plus à ce moment-là,
        le Pokémon n’est pas capturé. Les captures se découvrent au retour.
        {showIvBalls &&
          ' Un Pokémon déjà capturé sans IV parfait reçoit la Ball de « Déjà capturé ».'}
      </p>

      <h3 className="mt-5 text-sm font-semibold">Baies à envoyer (optionnelles)</h3>
      {captureBerries.length + encounterBerries.length === 0 ? (
        <p className="mt-1 text-xs text-slate-500">Aucune baie utile dans ton sac.</p>
      ) : (
        <>
          <ItemTiles
            ctx={ctx}
            className="mt-2 justify-start"
            items={[...captureBerries, ...encounterBerries]}
            selected={[berryId, encounterBerryId]}
            quantity={unlimitedItems ? undefined : owned}
            onSelect={(itemId) => {
              if (!itemId) return;
              if (captureBerries.includes(itemId)) {
                setBerryId(berryId === itemId ? null : itemId);
              } else {
                setEncounterBerryId(encounterBerryId === itemId ? null : itemId);
              }
            }}
          />
          <p className="mt-1 text-xs text-slate-500">
            Une baie de capture et une baie de rencontres au plus. Chacune agit{' '}
            {berryDurationMinutes} min, l’une après l’autre dès le départ ; celles pas encore
            entamées sont rendues au retour.
          </p>
          {berryId && (
            <BerryCount
              ctx={ctx}
              itemId={berryId}
              effect={`Capture ${formatMultiplier(ctx.itemEffect(berryId, 'captureBoost')!.multiplier)}`}
              count={berriesTaken}
              max={maxBerries(berryId)}
              minutesEach={berryDurationMinutes}
              onCount={setBerryCount}
            />
          )}
          {encounterBerryId && (
            <BerryCount
              ctx={ctx}
              itemId={encounterBerryId}
              effect={`Rencontres ${formatMultiplier(ctx.itemEffect(encounterBerryId, 'encounterBoost')!.multiplier)}`}
              count={encounterBerriesTaken}
              max={maxBerries(encounterBerryId)}
              minutesEach={berryDurationMinutes}
              onCount={setEncounterBerryCount}
            />
          )}
        </>
      )}

      {rememberSettings && (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-x-2">
            <AutoTransferButton
              label={zoneAutoTransfer.custom ? 'Transfert auto (zone)' : 'Transfert auto (global)'}
              filter={autoTransfer}
              onClick={() => setAutoTransferOpen(true)}
              className="-ml-3"
            />
          </div>
          <ZoneAutoTransferDialog
            open={autoTransferOpen}
            zoneName={zone.name}
            value={zoneAutoTransfer}
            globalFilter={globalAutoTransfer}
            onClose={() => setAutoTransferOpen(false)}
            onSave={setZoneAutoTransfer}
          />
        </>
      )}

      <h3 className="mt-5 text-sm font-semibold">Rencontres possibles</h3>
      <ul className="mt-2 grid gap-x-6 gap-y-0.5 text-xs sm:grid-cols-2">
        <EncounterHeader />
        {roamers.length + specials.length + possibleEncounters.length > 1 && (
          <EncounterHeader className="hidden sm:grid" />
        )}
        {roamers.map((r, i) => {
          const species = ctx.species(r.speciesId, r.formId)!;
          const chance = captureChanceFor(r.speciesId, r.formId);
          return (
            <li
              key={`roamer:${r.questId}`}
              className={`${ENCOUNTER_ROW} text-amber-800 dark:text-amber-300 ${chance === null ? 'opacity-40' : ''}`}
              title={`Pokémon fuyard : ${formatChance(roamerMeetChance(r.encounterChance, encounters))} de chances de le croiser ${per}. Une fois croisé, il ne revient plus et les autres Pokémon retrouvent leur part entière.`}
            >
              <span className="flex min-w-0 items-center gap-1">
                <PokemonSprite
                  speciesId={r.speciesId}
                  formId={r.formId}
                  size={32}
                  className="shrink-0"
                />
                <span className="min-w-0 truncate">✦ {species.nameFr}</span>
              </span>
              <span className="text-right tabular-nums">{formatChance(roamerShares[i]!)}</span>
              <CaptureChance chance={chance} />
            </li>
          );
        })}
        {specials.map((sp, i) => {
          const species = ctx.species(sp.speciesId, sp.formId)!;
          const chance = captureChanceFor(sp.speciesId, sp.formId ?? null);
          return (
            <li
              key={`special:${sp.speciesId}:${sp.formId ?? ''}`}
              className={`${ENCOUNTER_ROW} text-violet-800 dark:text-violet-300 ${chance === null ? 'opacity-40' : ''}`}
              title={`Rencontre spéciale : ${formatChance(roamerMeetChance(sp.chance, encounters))} de chances de la croiser ${per}, une fois au plus par expédition. Jamais chromatique.`}
            >
              <span className="flex min-w-0 items-center gap-1">
                <PokemonSprite
                  speciesId={sp.speciesId}
                  formId={sp.formId}
                  size={32}
                  className="shrink-0"
                />
                <span className="min-w-0 truncate">✧ {species.nameFr}</span>
              </span>
              <span className="text-right tabular-nums">{formatChance(specialShares[i]!)}</span>
              <CaptureChance chance={chance} />
            </li>
          );
        })}
        {possibleEncounters.map(({ speciesId, formId, probability }) => {
          const species = ctx.species(speciesId, formId)!;
          const chance = captureChanceFor(speciesId, formId);
          const isNew = !caught || isNewToDex(caught, { speciesId, formId });
          return (
            <li
              key={`${speciesId}:${formId ?? ''}`}
              className={`${ENCOUNTER_ROW} ${chance === null ? 'opacity-40' : ''}`}
              title={isNew ? 'Pas encore capturé' : 'Déjà capturé'}
            >
              <span className="flex min-w-0 items-center gap-1">
                <PokemonSprite
                  speciesId={speciesId}
                  formId={formId}
                  size={32}
                  className="shrink-0"
                />
                <BallIcon
                  label={isNew ? 'Pas encore capturé' : 'Déjà capturé'}
                  dim={isNew}
                  className="h-3.5 w-3.5"
                />
                <span className="min-w-0 truncate">{species.nameFr}</span>
              </span>
              <span className="text-right tabular-nums">
                {Math.round(probability * normalShare * 100)} %
              </span>
              <CaptureChance chance={chance} />
            </li>
          );
        })}
      </ul>
      <p className="mt-1 text-xs text-slate-500">
        <BallIcon className="inline h-3 w-3 align-[-1px]" /> déjà capturé,{' '}
        <BallIcon dim className="inline h-3 w-3 align-[-1px]" /> pas encore capturé. Grisé : pas de
        Ball prévue (un shiny reçoit toujours la Ball « Shiny »).
      </p>

      {loot.length > 0 && (
        <>
          <h3 className="mt-5 text-sm font-semibold">
            Butin possible à chaque tirage (toutes les {lootIntervalMinutes} min)
          </h3>
          <ul className="mt-2 grid gap-x-6 gap-y-0.5 text-xs sm:grid-cols-2">
            <LootHeader />
            {loot.length > 1 && <LootHeader className="hidden sm:grid" />}
            {loot.map(({ itemId, probability, min, max }) => (
              <li key={itemId} className={LOOT_ROW} title={itemName(ctx, itemId)}>
                <span className="flex min-w-0 items-center gap-1">
                  <img
                    src={itemIcon(ctx, itemId)}
                    alt=""
                    className="h-8 w-8 shrink-0 object-contain"
                  />
                  <span className="min-w-0 truncate">{itemName(ctx, itemId)}</span>
                </span>
                <span className="text-right tabular-nums">{formatChance(probability)}</span>
                <span className="text-right tabular-nums text-slate-500">
                  × {min === max ? min : `${min}–${max}`}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {zone.requiredTypes.length > 0 && (
        <p className="mt-3 flex flex-wrap items-center gap-1 text-xs text-slate-500">
          Types requis :
          {zone.requiredTypes.map((r) => (
            <span key={r.type} className="flex items-center gap-1">
              {r.count} × <TypeBadge type={r.type} />
            </span>
          ))}
        </p>
      )}

      {team.length > 0 && check.errors.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm text-red-600">
          {check.errors.map((e) => (
            <li key={e.code}>{teamErrorText(e)}</li>
          ))}
        </ul>
      )}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-6 flex items-center justify-end gap-2">
        <button className="btn-ghost" onClick={onCancel}>
          Annuler
        </button>
        <button
          className="btn-primary"
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
    </>
  );
}

/**
 * Choix d'objets en vignettes, comme les graines de la ferme : icône, quantité possédée, nom et
 * description au survol. `noneLabel` ajoute une vignette « aucun ».
 */
function ItemTiles({
  ctx,
  items,
  selected,
  quantity,
  noneLabel,
  className = '',
  onSelect,
}: {
  ctx: GameContext;
  items: readonly string[];
  /** Objet(s) sélectionné(s) ; null = aucun. */
  selected: string | null | readonly (string | null)[];
  /** Quantité possédée ; absente = stock illimité (simulateur). */
  quantity?: (itemId: string) => number;
  noneLabel?: string;
  className?: string;
  onSelect: (itemId: string | null) => void;
}) {
  const chosen = new Set(Array.isArray(selected) ? selected : [selected]);
  const tile = (on: boolean) =>
    `relative grid size-10 place-items-center rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 ${
      on ? 'ring-2 ring-brand-500' : 'hover:border-brand-500'
    }`;
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {items.map((itemId) => (
        <HoverBubble
          key={itemId}
          width={220}
          height={70}
          focusable={false}
          content={
            <span className="block space-y-0.5">
              <span className="block font-medium">{itemName(ctx, itemId)}</span>
              {ctx.item(itemId)?.description && (
                <span className="block">{ctx.item(itemId)!.description}</span>
              )}
            </span>
          }
        >
          <button
            type="button"
            onClick={() => onSelect(itemId)}
            aria-pressed={chosen.has(itemId)}
            aria-label={itemName(ctx, itemId)}
            className={tile(chosen.has(itemId))}
          >
            <img
              src={itemIcon(ctx, itemId)}
              alt=""
              className="size-8 [image-rendering:pixelated]"
            />
            {quantity && (
              <span className="absolute -right-1 -bottom-1 rounded-full bg-slate-700 px-1 font-mono text-[10px] text-white">
                {quantity(itemId)}
              </span>
            )}
          </button>
        </HoverBubble>
      ))}
      {noneLabel && (
        <button
          type="button"
          onClick={() => onSelect(null)}
          aria-pressed={chosen.has(null)}
          aria-label={noneLabel}
          title={noneLabel}
          className={`${tile(chosen.has(null))} text-lg text-slate-400`}
        >
          ⊘
        </button>
      )}
    </div>
  );
}

/** Nombre de baies d'une sorte à envoyer, et le temps qu'elles couvrent. */
function BerryCount({
  ctx,
  itemId,
  effect,
  count,
  max,
  minutesEach,
  onCount,
}: {
  ctx: GameContext;
  itemId: string;
  effect: string;
  count: number;
  max: number;
  /** Temps d'effet de chaque baie. */
  minutesEach: number;
  onCount: (count: number) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <img src={itemIcon(ctx, itemId)} alt="" className="size-6 [image-rendering:pixelated]" />
      <span className="font-medium">{itemName(ctx, itemId)}</span>
      <label className="flex items-center gap-1 text-xs text-slate-500">
        Nombre
        <input
          type="number"
          className="input w-20 py-1"
          min={1}
          max={max}
          value={count}
          onChange={(e) => onCount(Math.max(1, Math.min(max, Number(e.target.value) || 1)))}
        />
        / {max}
      </label>
      <span className="text-xs text-slate-500">
        {effect} pendant les {formatDuration(count * minutesEach)} qui suivent le départ.
      </span>
    </div>
  );
}
