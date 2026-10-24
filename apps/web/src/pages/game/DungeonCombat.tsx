import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryKey } from '@tanstack/react-query';
import { TYPE_COLORS } from '@poke/data';
import {
  STATUS_LABELS,
  WEATHER_LABELS,
  abilityEffectSummary,
  combatWeatherSource,
  dungeonAttack,
  dungeonStatChanges,
  healReadyAt,
  simulateDungeon,
} from '@poke/game-core';
import type { DungeonStat, Status, Weather } from '@poke/content';
import type { DungeonCommand, DungeonEvent, DungeonFighter, GameContext } from '@poke/game-core';
import type { CombatItemInput, DungeonRunDto } from '@poke/shared';
import { PokemonSprite, ShinyStar, TypeBadge } from '../../components/ui';
import { api } from '../../lib/api';
import { PLAYER_STATE_KEYS, keys, useInventory } from '../../lib/game';
import { abilityLabel, errorText, formatCountdown, itemIcon, itemName } from '../../lib/labels';

/** Combat en cours (tentative de donjon ou combat de dresseur) : ce qu'il faut pour le rejouer. */
export type CombatRun = Pick<DungeonRunDto, 'id' | 'setup' | 'commands' | 'fledAtMs' | 'startedAt'>;

/**
 * Combat en temps réel (donjon ou dresseur). L'état vient de la même simulation que le serveur
 * (`simulateDungeon`), recalculée à chaque image : l'affichage a un léger retard
 * (`TRAVEL_MS`) pour que chaque projectile parte de l'attaquant et touche le défenseur à
 * l'instant où les PV baissent.
 */

/** Durée du trajet d'un projectile (et retard de l'affichage sur le combat). */
const TRAVEL_MS = 380;
/** Durée d'affichage des dégâts et de l'efficacité après l'impact. */
const POPUP_MS = 900;
/** Durée d'affichage du nom d'un talent qui se déclenche. */
const ABILITY_POPUP_MS = 1600;

/** Symbole de chaque type, au cœur du projectile. */
const TYPE_GLYPHS: Record<string, string> = {
  normal: '✦',
  fire: '🔥',
  water: '💧',
  grass: '🍃',
  electric: '⚡',
  ice: '❄️',
  fighting: '👊',
  poison: '☠️',
  ground: '⛰️',
  flying: '🌪️',
  psychic: '🌀',
  bug: '🐛',
  rock: '🪨',
  ghost: '👻',
  dragon: '🐉',
  dark: '🌑',
  steel: '⚙️',
  fairy: '✨',
};

/** Pas de l'horloge quand le combat n'est pas affiché : juste de quoi repérer sa fin. */
const HIDDEN_TICK_MS = 250;

/**
 * Heure courante tant que `active` est vrai : à chaque image (requestAnimationFrame) si
 * `smooth`, sinon quelques fois par seconde (combat masqué, qui continue de tourner).
 */
function useFrameNow(active: boolean, smooth: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    if (!smooth) {
      const id = window.setInterval(() => setNow(Date.now()), HIDDEN_TICK_MS);
      return () => window.clearInterval(id);
    }
    let frame = requestAnimationFrame(function tick() {
      setNow(Date.now());
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [active, smooth]);
  return now;
}

function effectivenessText(e: number): string | null {
  if (e > 1) return 'Super efficace !';
  if (e < 1) return 'Pas très efficace…';
  return null;
}

const fighterName = (ctx: GameContext, f: DungeonFighter) =>
  ctx.species(f.speciesId, f.formId)?.nameFr ?? `#${f.speciesId}`;

export function HpBar({
  hp,
  max,
  className = '',
}: {
  hp: number;
  max: number;
  className?: string;
}) {
  const ratio = max > 0 ? hp / max : 0;
  const color = ratio > 0.5 ? 'bg-emerald-500' : ratio > 0.2 ? 'bg-amber-400' : 'bg-red-500';
  return (
    <div
      className={`h-2 overflow-hidden rounded-full bg-slate-300/70 dark:bg-slate-700 ${className}`}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-200 ${color}`}
        style={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%` }}
      />
    </div>
  );
}

const STATUS_BADGES: Record<Status, string> = {
  paralysis: 'PAR',
  burn: 'BRÛ',
  poison: 'PSN',
  sleep: 'SOM',
  freeze: 'GEL',
};
const STATUS_COLORS: Record<Status, string> = {
  paralysis: 'bg-yellow-400 text-slate-900',
  burn: 'bg-orange-500 text-white',
  poison: 'bg-purple-500 text-white',
  sleep: 'bg-slate-400 text-white',
  freeze: 'bg-cyan-400 text-slate-900',
};
const WEATHER_ICONS = { sun: '☀️', rain: '🌧️', sand: '🌪️', hail: '🌨️' } as const;

/**
 * Météo imposée par un talent : le combat s'ouvre sur celle du lieu, qui laisse place à celle du
 * talent après `WEATHER_CHANGE_MS`, annoncée pendant `WEATHER_BANNER_MS` (affichage seulement :
 * le combat se joue tout entier sous la météo du talent).
 */
const WEATHER_CHANGE_MS = 1200;
const WEATHER_BANNER_MS = 2600;
const WEATHER_CHANGE_TEXTS: Record<Weather | 'clear', string> = {
  sun: 'Le soleil brille fort !',
  rain: 'Il commence à pleuvoir !',
  sand: 'Une tempête de sable se lève !',
  hail: 'Il commence à grêler !',
  clear: 'La météo redevient normale.',
};

/** Ombres des deux Pokémon au sol. */
const ARENA_SHADOWS =
  'radial-gradient(ellipse 30% 9% at 22% 84%, #0002 60%, transparent 62%), radial-gradient(ellipse 26% 8% at 76% 56%, #0002 60%, transparent 62%)';
/** Ciel et sol de l'arène selon la météo (temps clair par défaut). */
const ARENA_BACKGROUNDS: Record<Weather | 'clear', string> = {
  clear: 'linear-gradient(to bottom, #bfdbfe 0%, #e0f2fe 52%, #bbf7d0 52%, #86efac 100%)',
  sun: 'radial-gradient(circle at 88% 10%, #fffbeb 0 5%, #fde68a 8%, transparent 30%), linear-gradient(to bottom, #fdba74 0%, #fef3c7 52%, #d9f99d 52%, #a3e635 100%)',
  rain: 'linear-gradient(to bottom, #475569 0%, #94a3b8 52%, #65a30d 52%, #3f6212 100%)',
  sand: 'linear-gradient(to bottom, #d4a373 0%, #f5deb3 52%, #e9c46a 52%, #c9953f 100%)',
  hail: 'linear-gradient(to bottom, #94a3b8 0%, #e2e8f0 52%, #f1f5f9 52%, #cbd5e1 100%)',
};

/**
 * Ce que fait un talent en combat (donjons et dresseurs) : ses effets qui y agissent. Ceux des
 * donjons, les mêmes en combat de dresseur hormis la PE minimale, qui ne joue pas pendant le combat.
 */
function dungeonAbilityText(ctx: GameContext, ability: string): string {
  return abilityEffectSummary(ctx, ability, ['dungeon']) ?? 'Sans effet en combat';
}

/** Variations de statistiques d'un combattant : hausses en vert, baisses en rouge. */
function StatChanges({
  changes,
  className = '',
}: {
  changes: Partial<Record<DungeonStat, number>>;
  className?: string;
}) {
  const entries = Object.entries(changes) as [DungeonStat, number][];
  if (entries.length === 0) return null;
  return (
    <span
      className={`flex flex-wrap gap-x-1.5 text-[10px] leading-tight font-semibold ${className}`}
    >
      {entries.map(([stat, percent]) => (
        <span
          key={stat}
          className={
            percent > 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-red-600 dark:text-red-400'
          }
        >
          {DUNGEON_STAT_SHORT[stat]}
          {percent > 0 ? '+' : '−'}
          {Math.abs(percent)} %
        </span>
      ))}
    </span>
  );
}

/**
 * Talent d'un combattant, expliqué au survol : bulle au-dessus (calée à droite) ou, avec
 * `below`, en dessous (calée à gauche), pour rester dans l'arène.
 */
function AbilityTag({
  ctx,
  ability,
  neutralizedBy,
  below = false,
}: {
  ctx: GameContext;
  ability: string;
  /** Talent du Pokémon en face qui neutralise celui-ci (Gaz Inhibiteur, Brise Moule…). */
  neutralizedBy: string | null;
  below?: boolean;
}) {
  return (
    <span className="group flex min-w-0" tabIndex={0}>
      <span
        className={`cursor-help truncate text-[10px] font-semibold text-violet-700 underline decoration-dotted dark:text-violet-300 ${
          neutralizedBy ? 'line-through opacity-60' : ''
        }`}
      >
        {abilityLabel(ability)}
      </span>
      <span
        className={`pointer-events-none invisible absolute z-20 w-max max-w-[16rem] rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-normal text-slate-700 opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100 group-focus:visible group-focus:opacity-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 ${
          below ? 'top-full left-0 mt-1' : 'right-0 bottom-full mb-1'
        }`}
      >
        <span className="block font-semibold text-violet-700 dark:text-violet-300">
          {abilityLabel(ability)}
        </span>
        {dungeonAbilityText(ctx, ability)}
        {neutralizedBy && (
          <span className="mt-0.5 block text-red-600 dark:text-red-400">
            Neutralisé par {abilityLabel(neutralizedBy)}, le talent du Pokémon en face
          </span>
        )}
      </span>
    </span>
  );
}

/** Talent qui neutralise celui du Pokémon en face (Gaz Inhibiteur, Brise Moule…) ; null = aucun. */
const suppressorAbility = (f: DungeonFighter): string | null =>
  f.traits?.suppressAbility ? f.ability || 'talent' : null;

/** Encadré de nom, talent, variations de statistiques, niveau et PV d'un combattant. */
function FighterCard({
  ctx,
  name,
  level,
  hp,
  maxHp,
  shiny,
  status,
  ability,
  neutralizedBy = null,
  statChanges,
  tooltipBelow,
}: {
  ctx: GameContext;
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  shiny?: boolean;
  status?: Status | null;
  ability?: string | null;
  neutralizedBy?: string | null;
  statChanges: Partial<Record<DungeonStat, number>>;
  tooltipBelow?: boolean;
}) {
  return (
    <div className="relative w-48 rounded-lg bg-white/85 px-2 py-1 text-xs shadow dark:bg-slate-900/85">
      <div className="flex items-baseline justify-between gap-1">
        <span className="flex min-w-0 items-baseline gap-1">
          <span className="shrink-0 font-semibold">
            {name} {shiny && <ShinyStar />}
          </span>
          {status && (
            <span
              title={STATUS_LABELS[status]}
              className={`shrink-0 rounded px-1 text-[9px] font-bold ${STATUS_COLORS[status]}`}
            >
              {STATUS_BADGES[status]}
            </span>
          )}
          {ability && (
            <AbilityTag
              ctx={ctx}
              ability={ability}
              neutralizedBy={neutralizedBy}
              below={tooltipBelow}
            />
          )}
        </span>
        <span className="shrink-0 text-slate-500">N.{level}</span>
      </div>
      <StatChanges changes={statChanges} className="mt-0.5" />
      <HpBar hp={hp} max={maxHp} className="mt-1" />
      <p className="mt-0.5 text-right font-mono text-[10px] text-slate-500">
        {hp} / {maxHp}
      </p>
    </div>
  );
}

/** Projectile d'une attaque en vol : de l'attaquant vers le défenseur, en arc. */
function Projectile({
  event,
  progress,
}: {
  event: DungeonEvent & { kind: 'attack' };
  progress: number;
}) {
  const fromPlayer = event.side === 'player';
  // Positions (en % de l'arène) des deux sprites.
  const [x0, y0, x1, y1] = fromPlayer ? [22, 66, 76, 38] : [76, 38, 22, 66];
  const x = x0 + (x1 - x0) * progress;
  const y = y0 + (y1 - y0) * progress - Math.sin(Math.PI * progress) * 12;
  const color = TYPE_COLORS[event.attackType] ?? '#888';
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute grid h-9 w-9 place-items-center rounded-full text-base"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        background: `radial-gradient(circle, #fff 0%, ${color} 55%, ${color}00 75%)`,
        boxShadow: `0 0 18px 6px ${color}aa`,
        transform: `translate(-50%, -50%) scale(${0.7 + progress * 0.5}) rotate(${progress * 360}deg)`,
      }}
    >
      {TYPE_GLYPHS[event.attackType] ?? '✦'}
    </span>
  );
}

/** Dégâts et efficacité qui s'envolent au-dessus du défenseur après l'impact. */
function DamagePopup({ event, age }: { event: DungeonEvent & { kind: 'attack' }; age: number }) {
  const onEnemy = event.side === 'player';
  const t = age / POPUP_MS;
  const text = effectivenessText(event.effectiveness);
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute -translate-x-1/2 text-center font-bold whitespace-nowrap drop-shadow"
      style={{
        left: onEnemy ? '76%' : '22%',
        top: `calc(${onEnemy ? 10 : 34}% - ${t * 28}px)`,
        opacity: 1 - t * t,
        textShadow: '0 0 3px #fff, 0 0 3px #fff, 0 0 2px #fff',
      }}
    >
      <span className={`block text-lg ${event.damage > 0 ? 'text-red-600' : 'text-slate-500'}`}>
        {event.damage > 0 ? `−${event.damage}` : '0'}
      </span>
      {event.critical && <span className="block text-[11px] text-red-600">Coup critique !</span>}
      {text && (
        <span
          className={`block text-[11px] ${event.effectiveness > 1 ? 'text-amber-600' : 'text-slate-600 dark:text-slate-300'}`}
        >
          {text}
        </span>
      )}
    </span>
  );
}

const ABILITY_EFFECT_TEXTS: Record<
  DungeonAbilityEvent['effect'],
  (amount: number, stats: readonly DungeonStat[]) => string
> = {
  immunity: (n) => (n > 0 ? `Absorbé ! +${n} PV` : 'Sans effet !'),
  sturdy: () => 'Tient bon !',
  regenerator: (n) => `+${n} PV`,
  moxie: (n) => `Attaque +${n} %`,
  intimidate: (n, stats) =>
    `${stats.map((st) => DUNGEON_STAT_SHORT[st]).join(', ') || 'Attaque'} adverse −${n} %`,
  contactDamage: (n) => `L’attaquant perd ${n} PV`,
  aftermath: (n) => `L’attaquant perd ${n} PV`,
  naturalCure: () => 'Statut guéri',
  suppressAbility: () => 'Talent adverse neutralisé',
};

type DungeonAbilityEvent = DungeonEvent & { kind: 'ability' };

const DUNGEON_STAT_SHORT: Record<DungeonStat, string> = {
  attack: 'Atq.',
  defense: 'Déf.',
  'special-attack': 'Atq. Spé.',
  'special-defense': 'Déf. Spé.',
  speed: 'Vit.',
};
type DungeonStatusEvent = DungeonEvent & { kind: 'status' };

/** Statut infligé, sommeil, réveil ou dégâts de statut et de météo, au-dessus du Pokémon. */
function statusText(e: DungeonStatusEvent): string {
  const label = e.status ? STATUS_LABELS[e.status] : 'Météo';
  switch (e.change) {
    case 'inflicted':
      return `${label} !`;
    case 'skipped':
      return e.status === 'freeze' ? 'Gelé…' : 'Dort…';
    case 'cured':
      return e.status === 'freeze' ? 'Dégèle !' : 'Se réveille !';
    case 'damage':
      return `${label} −${e.amount}`;
  }
}

function StatusPopup({ event, age }: { event: DungeonStatusEvent; age: number }) {
  const onEnemy = event.side === 'enemy';
  const t = age / ABILITY_POPUP_MS;
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute -translate-x-1/2 rounded-lg bg-white/85 px-2 py-0.5 text-center text-[11px] font-semibold whitespace-nowrap text-amber-700 shadow dark:bg-slate-900/85 dark:text-amber-300"
      style={{
        left: onEnemy ? '76%' : '22%',
        top: `calc(${onEnemy ? 28 : 52}% - ${t * 16}px)`,
        opacity: 1 - t * t,
      }}
    >
      {statusText(event)}
    </span>
  );
}

/** Talent qui se déclenche : son nom et son effet, au-dessus du Pokémon qui l'a. */
function AbilityPopup({ event, age }: { event: DungeonAbilityEvent; age: number }) {
  const onEnemy = event.side === 'enemy';
  const t = age / ABILITY_POPUP_MS;
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute -translate-x-1/2 rounded-lg bg-white/85 px-2 py-0.5 text-center text-[11px] font-semibold whitespace-nowrap text-violet-700 shadow dark:bg-slate-900/85 dark:text-violet-300"
      style={{
        left: onEnemy ? '76%' : '22%',
        top: `calc(${onEnemy ? 22 : 46}% - ${t * 16}px)`,
        opacity: 1 - t * t,
      }}
    >
      {abilityLabel(event.ability)} ·{' '}
      {ABILITY_EFFECT_TEXTS[event.effect](event.amount, event.stats ?? [])}
    </span>
  );
}

type DungeonItemEvent = DungeonEvent & { kind: 'item' };

/** Baie donnée au Pokémon actif : PV rendus, au-dessus de lui. */
function ItemPopup({
  ctx,
  event,
  age,
}: {
  ctx: GameContext;
  event: DungeonItemEvent;
  age: number;
}) {
  const t = age / ABILITY_POPUP_MS;
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute flex -translate-x-1/2 items-center gap-1 rounded-lg bg-white/85 px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-emerald-700 shadow dark:bg-slate-900/85 dark:text-emerald-300"
      style={{ left: '22%', top: `calc(40% - ${t * 16}px)`, opacity: 1 - t * t }}
    >
      <img src={itemIcon(ctx, event.itemId)} alt="" width={18} height={18} />
      {itemName(ctx, event.itemId)} · +{event.amount} PV
    </span>
  );
}

const OUTCOME_LABELS = {
  win: 'Victoire !',
  loss: 'Ton équipe est K.O.…',
  timeout: 'Temps écoulé…',
  fled: 'Tu as pris la fuite.',
} as const;

export function DungeonCombat<R extends CombatRun, C>({
  ctx,
  title,
  apiBase,
  queryKey,
  bossLast = false,
  run,
  offsetMs,
  visible,
  onHide,
  claimRequested,
  onOver,
  onClaimError,
  onFinished,
}: {
  ctx: GameContext;
  /** Titre de la fenêtre (« Donjon : … », « Combat contre … »). */
  title: string;
  /** Routes du combat : `${apiBase}/${id}/switch`, `/item`, `/claim`, `/flee`. */
  apiBase: string;
  /** Requête dont `active` est ce combat (mise à jour après un changement de Pokémon). */
  queryKey: QueryKey;
  /** Le dernier adversaire est un boss (plus grand, couronné). */
  bossLast?: boolean;
  run: R;
  /** Décalage entre l'horloge du serveur et celle du navigateur. */
  offsetMs: number;
  /** Fenêtre du combat affichée (masquée, le combat continue et se réclame à sa fin). */
  visible: boolean;
  onHide: () => void;
  /** Le joueur demande le résultat d'un combat terminé alors que sa fenêtre était fermée. */
  claimRequested: boolean;
  /** Fin du combat atteinte : la liste propose alors d'en voir le résultat. */
  onOver: () => void;
  /** Échec de la réclamation demandée fenêtre fermée : la fenêtre s'ouvre pour réessayer. */
  onClaimError: () => void;
  onFinished: (result: C) => void;
}) {
  const queryClient = useQueryClient();
  const { setup } = run;
  const startedAt = Date.parse(run.startedAt);
  // Changement ou baie demandés, en attente de la réponse du serveur (affichés tout de suite).
  // `base` : nombre de commandes connues à la demande, pour l'ignorer dès que le cache contient la
  // réponse (pas effacé à la réponse, sinon il disparaîtrait une image avant que le cache ne soit
  // diffusé).
  const [pending, setPending] = useState<{ command: DungeonCommand; base: number } | null>(null);
  const inventory = useInventory();
  const [confirmFlee, setConfirmFlee] = useState(false);
  const [finished, setFinished] = useState(false);
  const now = useFrameNow(!finished, visible);
  const elapsed = Math.max(0, Math.min(now + offsetMs - startedAt, setup.timeLimitMs));
  const displayMs = Math.max(0, elapsed - TRAVEL_MS);
  const awaiting = pending !== null && run.commands.length === pending.base;
  const commands = useMemo(
    () => (pending && awaiting ? [...run.commands, pending.command] : run.commands),
    [run.commands, pending, awaiting],
  );
  const live = simulateDungeon(setup, commands, run.fledAtMs, elapsed);
  const shown = simulateDungeon(setup, commands, run.fledAtMs, displayMs).state;
  const outcome = live.state.outcome;
  const over = outcome !== null && displayMs >= (live.state.endedAtMs ?? 0);

  const refresh = () =>
    Promise.all(PLAYER_STATE_KEYS.map((key) => queryClient.invalidateQueries({ queryKey: key })));
  const updateRun = (next: R) =>
    queryClient.setQueryData<{ active: R | null; serverTime: string }>(queryKey, (old) =>
      // L'heure du serveur suit la date de mise à jour du cache : le décalage d'horloge reste juste.
      old
        ? { ...old, active: next, serverTime: new Date(Date.now() + offsetMs).toISOString() }
        : old,
    );

  const switchMember = useMutation({
    mutationFn: (input: { member: number; atMs: number }) =>
      api<R>(`${apiBase}/${run.id}/switch`, { method: 'POST', json: input }),
    onSuccess: (next) => updateRun(next),
    onError: () => setPending(null),
  });

  const giveItem = useMutation({
    mutationFn: (input: CombatItemInput) =>
      api<R>(`${apiBase}/${run.id}/item`, { method: 'POST', json: input }),
    onSuccess: (next) => {
      updateRun(next);
      return queryClient.invalidateQueries({ queryKey: keys.inventory });
    },
    onError: () => setPending(null),
  });

  const claim = useMutation({
    mutationFn: () => api<C>(`${apiBase}/${run.id}/claim`, { method: 'POST' }),
    onSuccess: (data) => {
      onFinished(data);
      return refresh();
    },
    onError: () => {
      if (!visible) onClaimError();
    },
  });

  const flee = useMutation({
    mutationFn: () => api<C>(`${apiBase}/${run.id}/flee`, { method: 'POST' }),
    onSuccess: (data) => {
      setFinished(true);
      onFinished(data);
      return refresh();
    },
  });

  // Fin du combat : réclamation automatique, le temps de lire l'issue. Fenêtre fermée, on
  // attend que le joueur demande le résultat depuis la liste, puis on réclame aussitôt.
  const claimMutate = claim.mutate;
  const fleeing = flee.isPending || flee.isSuccess;
  useEffect(() => {
    if (over) onOver();
  }, [over, onOver]);
  useEffect(() => {
    if (!over || fleeing || (!visible && !claimRequested)) return;
    const timer = window.setTimeout(
      () => {
        setFinished(true);
        claimMutate();
      },
      visible ? 1200 : 0,
    );
    return () => window.clearTimeout(timer);
  }, [over, fleeing, visible, claimRequested, claimMutate]);

  // Météo affichée : celle du lieu au tout début si un talent impose la sienne, puis celle-ci.
  const weatherSource = useMemo(() => combatWeatherSource(ctx, setup), [ctx, setup]);
  const startWeather = weatherSource ? (setup.placeWeather ?? null) : (setup.weather ?? null);
  const shownWeather =
    weatherSource && displayMs < WEATHER_CHANGE_MS ? startWeather : (setup.weather ?? null);
  const sinceChange = displayMs - WEATHER_CHANGE_MS;
  const weatherBanner =
    sinceChange < 0 || sinceChange >= WEATHER_BANNER_MS
      ? null
      : sinceChange >= WEATHER_BANNER_MS - 500
        ? 'fading'
        : 'shown';

  const player = setup.team[shown.active]!;
  const enemy = setup.enemies[shown.enemyIndex]!;
  const playerHp = shown.hp[shown.active] ?? 0;
  const inFlight = live.events.filter(
    (e): e is DungeonEvent & { kind: 'attack' } =>
      e.kind === 'attack' && e.atMs > displayMs && e.atMs <= displayMs + TRAVEL_MS,
  );
  const popups = live.events.filter(
    (e): e is DungeonEvent & { kind: 'attack' } =>
      e.kind === 'attack' && e.atMs <= displayMs && e.atMs > displayMs - POPUP_MS,
  );
  const statusPopups = live.events.filter(
    (e): e is DungeonStatusEvent =>
      e.kind === 'status' && e.atMs <= displayMs && e.atMs > displayMs - ABILITY_POPUP_MS,
  );
  const abilityPopups = live.events.filter(
    (e): e is DungeonAbilityEvent =>
      e.kind === 'ability' && e.atMs <= displayMs && e.atMs > displayMs - ABILITY_POPUP_MS,
  );
  const itemPopups = live.events.filter(
    (e): e is DungeonItemEvent =>
      e.kind === 'item' && e.atMs <= displayMs && e.atMs > displayMs - ABILITY_POPUP_MS,
  );
  // Baies de soin du sac (la baie en cours d'envoi est déjà décomptée).
  const healItems = (inventory.data ?? []).flatMap((s) => {
    const effect = ctx.itemEffect(s.itemId, 'battleHeal');
    const sent =
      awaiting && pending && 'itemId' in pending.command && pending.command.itemId === s.itemId;
    const quantity = s.quantity - (sent ? 1 : 0);
    if (!effect || quantity <= 0) return [];
    // Recharge : secondes avant de pouvoir en redonner une.
    const readyAt = healReadyAt(commands, s.itemId, effect.cooldownSeconds * 1000);
    const cooldownLeft = Math.ceil((readyAt - displayMs) / 1000);
    return [{ itemId: s.itemId, quantity, effect, cooldownLeft }];
  });
  const canHeal = outcome === null && !awaiting && playerHp > 0 && playerHp < player.maxHp;
  const hit = (side: 'player' | 'enemy') =>
    popups.some((e) => e.side !== side && displayMs - e.atMs < 220 && e.damage > 0);
  const remaining = setup.enemies.slice(shown.enemyIndex + 1);
  const timeLeft = setup.timeLimitMs - displayMs;

  function send(member: number) {
    if (outcome !== null || awaiting || member === shown.active) return;
    if (shown.hp[member] === 0 || (shown.recallReadyAt[member] ?? 0) > displayMs) return;
    // Daté à l'instant affiché (pas à l'instant réel, en avance de `TRAVEL_MS`) : le Pokémon
    // entre aussitôt, et le joueur agit sur ce qu'il voit. Le serveur tolère ce léger retard.
    const atMs = Math.round(displayMs);
    setPending({ command: { atMs, member }, base: run.commands.length });
    switchMember.mutate({ member, atMs });
  }

  function heal(itemId: string, fraction: number) {
    if (!canHeal || healItems.some((h) => h.itemId === itemId && h.cooldownLeft > 0)) return;
    const atMs = Math.round(displayMs);
    setPending({ command: { atMs, itemId, heal: fraction }, base: run.commands.length });
    giveItem.mutate({ itemId, atMs });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-lg font-semibold">{title}</h2>
          <span className="text-sm text-slate-500">
            Adversaire {Math.min(shown.enemyIndex + 1, setup.enemies.length)} /{' '}
            {setup.enemies.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onHide}
          className="-mt-1 -mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-xl leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          title="Fermer (le combat continue)"
          aria-label="Fermer la fenêtre du combat"
        >
          ×
        </button>
      </div>

      <div className="relative h-72 overflow-hidden rounded-2xl border border-slate-200 select-none sm:h-80 dark:border-slate-800">
        {/* Décor du lieu, puis celui de la météo du talent, en fondu. */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ background: ARENA_BACKGROUNDS[startWeather ?? 'clear'] }}
        />
        <div
          aria-hidden
          className="absolute inset-0 transition-opacity duration-1000"
          style={{
            background: ARENA_BACKGROUNDS[setup.weather ?? 'clear'],
            opacity: shownWeather === (setup.weather ?? null) ? 1 : 0,
          }}
        />
        <div aria-hidden className="absolute inset-0" style={{ background: ARENA_SHADOWS }} />
        {/* Météo du combat : pluie, sable ou grêle qui tombent, reflets du soleil. */}
        {shownWeather && (
          <div
            key={shownWeather}
            aria-hidden
            className="pointer-events-none absolute inset-0 animate-[dungeon-fade_1000ms_ease-out]"
          >
            <div className={`absolute inset-0 weather-${shownWeather}`} />
          </div>
        )}
        {/* Adversaires restants, en petit et grisés. */}
        <div className="absolute inset-x-0 top-2 flex justify-center">
          <div className="flex items-center gap-0.5 rounded-full bg-white/70 px-2 py-0.5 dark:bg-slate-900/70">
            {remaining.length === 0 ? (
              <span className="px-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                Dernier adversaire !
              </span>
            ) : (
              remaining.map((f, i) => (
                <span key={i} title={fighterName(ctx, f)} className="relative">
                  <PokemonSprite
                    speciesId={f.speciesId}
                    formId={f.formId}
                    size={30}
                    className="opacity-60 grayscale"
                  />
                  {bossLast && i === remaining.length - 1 && (
                    <span className="absolute -top-1 -right-0.5 text-[10px]" title="Boss">
                      👑
                    </span>
                  )}
                </span>
              ))
            )}
          </div>
        </div>

        <span
          className={`absolute top-2 left-2 rounded-full px-2 py-0.5 font-mono text-sm font-semibold shadow ${
            timeLeft < 30_000 ? 'bg-red-500 text-white' : 'bg-white/85 dark:bg-slate-900/85'
          }`}
          title="Temps restant"
        >
          ⏱ {formatCountdown(timeLeft)}
        </span>
        {shownWeather && (
          <span
            key={shownWeather}
            className="absolute top-2 right-2 animate-[dungeon-enter_400ms_ease-out] rounded-full bg-white/85 px-2 py-0.5 text-sm font-semibold shadow dark:bg-slate-900/85"
          >
            {WEATHER_ICONS[shownWeather]} {WEATHER_LABELS[shownWeather]}
          </span>
        )}
        {weatherSource && weatherBanner && (
          <div className="pointer-events-none absolute inset-x-0 top-[40%] z-10 flex justify-center">
            <p
              className="flex animate-[dungeon-enter_400ms_ease-out] items-center gap-2 rounded-2xl bg-white/90 py-1 pr-4 pl-1 text-sm shadow-lg transition-opacity duration-500 dark:bg-slate-900/90"
              style={{ opacity: weatherBanner === 'fading' ? 0 : 1 }}
            >
              <PokemonSprite
                speciesId={weatherSource.fighter.speciesId}
                formId={weatherSource.fighter.formId}
                shiny={weatherSource.fighter.isShiny}
                size={40}
                className={weatherSource.side === 'player' ? '-scale-x-100' : ''}
              />
              <span>
                <span className="font-semibold text-violet-700 dark:text-violet-300">
                  {weatherSource.side === 'enemy' && 'Adversaire : '}
                  {fighterName(ctx, weatherSource.fighter)} · {abilityLabel(weatherSource.ability)}
                </span>
                <span className="block font-medium">
                  {WEATHER_CHANGE_TEXTS[setup.weather ?? 'clear']}
                </span>
              </span>
            </p>
          </div>
        )}

        {/* Adversaire, à droite. */}
        <div className="absolute top-12 left-3 sm:left-6">
          <FighterCard
            ctx={ctx}
            name={fighterName(ctx, enemy)}
            level={enemy.level}
            hp={shown.enemyHp}
            maxHp={enemy.maxHp}
            status={shown.enemyStatus}
            ability={enemy.ability}
            neutralizedBy={suppressorAbility(player)}
            statChanges={dungeonStatChanges(setup, shown, 'enemy', shown.enemyIndex)}
            tooltipBelow
          />
        </div>
        <div
          key={`enemy-${shown.enemyIndex}`}
          className={`absolute top-[38%] left-[76%] -translate-x-1/2 -translate-y-1/2 transition-opacity duration-300 ${
            shown.enemyHp === 0 ? 'opacity-0' : 'animate-[dungeon-enter_400ms_ease-out]'
          }`}
        >
          <div className={hit('enemy') ? 'animate-[dungeon-hit_220ms_linear]' : ''}>
            <PokemonSprite
              speciesId={enemy.speciesId}
              formId={enemy.formId}
              size={bossLast && shown.enemyIndex === setup.enemies.length - 1 ? 144 : 120}
            />
          </div>
        </div>

        {/* Notre Pokémon, à gauche, retourné pour regarder l'adversaire. */}
        <div className="absolute right-3 bottom-3 sm:right-6">
          <FighterCard
            ctx={ctx}
            name={fighterName(ctx, player)}
            level={player.level}
            hp={playerHp}
            maxHp={player.maxHp}
            shiny={player.isShiny}
            status={shown.statuses[shown.active]}
            ability={player.ability}
            neutralizedBy={suppressorAbility(enemy)}
            statChanges={dungeonStatChanges(setup, shown, 'player', shown.active)}
          />
        </div>
        <div
          key={`player-${shown.active}`}
          className={`absolute top-[66%] left-[22%] -translate-x-1/2 -translate-y-1/2 transition-opacity duration-300 ${
            playerHp === 0 ? 'opacity-0' : 'animate-[dungeon-enter_300ms_ease-out]'
          }`}
        >
          <div className={hit('player') ? 'animate-[dungeon-hit_220ms_linear]' : ''}>
            <PokemonSprite
              speciesId={player.speciesId}
              formId={player.formId}
              shiny={player.isShiny}
              size={136}
              className="-scale-x-100"
            />
          </div>
        </div>

        {inFlight.map((e) => (
          <Projectile
            key={`${e.side}-${e.atMs}`}
            event={e}
            progress={1 - (e.atMs - displayMs) / TRAVEL_MS}
          />
        ))}
        {statusPopups.map((e, i) => (
          <StatusPopup key={`s-${e.side}-${e.atMs}-${i}`} event={e} age={displayMs - e.atMs} />
        ))}
        {abilityPopups.map((e, i) => (
          <AbilityPopup key={`a-${e.side}-${e.atMs}-${i}`} event={e} age={displayMs - e.atMs} />
        ))}
        {popups.map((e) => (
          <DamagePopup key={`${e.side}-${e.atMs}`} event={e} age={displayMs - e.atMs} />
        ))}
        {itemPopups.map((e, i) => (
          <ItemPopup key={`i-${e.atMs}-${i}`} ctx={ctx} event={e} age={displayMs - e.atMs} />
        ))}

        {/* Baies de soin du sac : données au Pokémon actif. */}
        {healItems.length > 0 && (
          <div className="absolute bottom-2 left-2 z-10 flex gap-1.5">
            {healItems.map(({ itemId, quantity, effect, cooldownLeft }) => (
              <button
                key={itemId}
                type="button"
                disabled={!canHeal || cooldownLeft > 0}
                onClick={() => heal(itemId, effect.fraction)}
                title={
                  cooldownLeft > 0
                    ? `${itemName(ctx, itemId)} : de nouveau possible dans ${cooldownLeft} s`
                    : `${itemName(ctx, itemId)} : rend ${Math.round(effect.fraction * 100)} % de ses PV au Pokémon actif`
                }
                aria-label={`Donner une ${itemName(ctx, itemId)} (${quantity} restantes)`}
                className="relative grid h-10 w-10 place-items-center rounded-full bg-white/85 shadow transition enabled:hover:scale-110 enabled:hover:bg-white disabled:opacity-50 dark:bg-slate-900/85"
              >
                <img
                  src={itemIcon(ctx, itemId)}
                  alt=""
                  width={28}
                  height={28}
                  className="[image-rendering:pixelated]"
                />
                {cooldownLeft > 0 && (
                  <span className="absolute inset-0 grid place-items-center rounded-full bg-slate-900/70 text-xs font-bold text-white tabular-nums">
                    {cooldownLeft}
                  </span>
                )}
                <span className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white tabular-nums">
                  {quantity}
                </span>
              </button>
            ))}
          </div>
        )}

        {over && outcome && (
          <div className="absolute inset-0 grid place-items-center bg-slate-950/40 backdrop-blur-[1px]">
            <p className="animate-[dungeon-enter_400ms_ease-out] rounded-2xl bg-white px-6 py-3 text-xl font-bold shadow-lg dark:bg-slate-900">
              {OUTCOME_LABELS[outcome]}
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {setup.team.map((f, i) => {
          const hp = shown.hp[i] ?? 0;
          const isActive = shown.active === i;
          const ko = hp === 0;
          // Rappelé récemment : secondes avant qu'il puisse revenir.
          const recallLeft = Math.ceil(((shown.recallReadyAt[i] ?? 0) - displayMs) / 1000);
          const recalled = !ko && !isActive && recallLeft > 0;
          const attack = f.attackType ? dungeonAttack(setup.settings, f.attackType) : null;
          const neutralizedBy = isActive ? suppressorAbility(enemy) : null;
          return (
            <button
              key={i}
              type="button"
              disabled={ko || isActive || recalled || outcome !== null}
              onClick={() => send(i)}
              title={
                ko
                  ? 'K.O.'
                  : isActive
                    ? 'Au combat'
                    : recalled
                      ? `Rappelé : de retour possible dans ${recallLeft} s`
                      : 'Envoyer au combat'
              }
              className={`relative flex items-start gap-2 rounded-xl border p-1.5 text-left text-xs transition ${
                isActive
                  ? 'border-brand-500 bg-brand-500/10'
                  : ko
                    ? 'border-slate-200 opacity-50 grayscale dark:border-slate-800'
                    : recalled
                      ? 'border-slate-200 opacity-70 dark:border-slate-800'
                      : 'border-slate-200 hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800'
              }`}
            >
              {recalled && (
                <span className="absolute top-1 left-1 grid h-6 min-w-6 place-items-center rounded-full bg-slate-900/80 px-1 text-[11px] font-bold tabular-nums text-white">
                  {recallLeft}
                </span>
              )}
              <PokemonSprite
                speciesId={f.speciesId}
                formId={f.formId}
                shiny={f.isShiny}
                size={44}
                className="-scale-x-100"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {fighterName(ctx, f)} {f.isShiny && <ShinyStar />}
                </span>
                <HpBar hp={hp} max={f.maxHp} className="my-0.5" />
                <span className="flex items-center justify-between gap-1 text-[10px] text-slate-500">
                  {ko ? 'K.O.' : `${hp} / ${f.maxHp}`}
                  {f.attackType && (
                    <span title={attack?.name}>
                      <TypeBadge type={f.attackType} />
                    </span>
                  )}
                </span>
                <StatChanges
                  changes={dungeonStatChanges(setup, shown, 'player', i)}
                  className="mt-0.5"
                />
                {f.ability && (
                  <span className="mt-0.5 block text-[10px] leading-snug text-slate-600 dark:text-slate-300">
                    <span
                      className={`font-semibold text-violet-700 dark:text-violet-300 ${
                        neutralizedBy ? 'line-through opacity-60' : ''
                      }`}
                    >
                      {abilityLabel(f.ability)}
                    </span>{' '}
                    : {dungeonAbilityText(ctx, f.ability)}
                    {neutralizedBy && (
                      <span className="text-red-600 dark:text-red-400">
                        {' '}
                        (neutralisé par {abilityLabel(neutralizedBy)})
                      </span>
                    )}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {(switchMember.error || giveItem.error) && (
        <p className="text-sm text-red-600">{errorText(switchMember.error ?? giveItem.error)}</p>
      )}
      {(claim.error || flee.error) && (
        <p className="flex items-center gap-2 text-sm text-red-600">
          {errorText(claim.error ?? flee.error)}
          {claim.error && (
            <button className="btn-ghost py-1" onClick={() => claim.mutate()}>
              Réessayer
            </button>
          )}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          Clique sur un Pokémon pour l’envoyer au combat. Le combat continue même si tu fermes cette
          fenêtre ou quittes la page.
        </p>
        {confirmFlee ? (
          <span className="flex shrink-0 items-center gap-2">
            <button
              className="btn-danger"
              disabled={flee.isPending || outcome !== null}
              onClick={() => flee.mutate()}
            >
              {flee.isPending ? 'Fuite…' : 'Fuir sans récompense'}
            </button>
            <button className="btn-ghost" onClick={() => setConfirmFlee(false)}>
              Non
            </button>
          </span>
        ) : (
          <button
            className="btn-ghost shrink-0"
            disabled={outcome !== null}
            onClick={() => setConfirmFlee(true)}
          >
            Fuir
          </button>
        )}
      </div>
    </div>
  );
}
