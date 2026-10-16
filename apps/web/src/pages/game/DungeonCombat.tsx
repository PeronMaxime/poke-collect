import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Dungeon } from '@poke/content';
import { TYPE_COLORS } from '@poke/data';
import { dungeonAttack, simulateDungeon } from '@poke/game-core';
import type { DungeonEvent, DungeonFighter, GameContext } from '@poke/game-core';
import type { ClaimDungeonResponse, DungeonRunDto, DungeonsResponse } from '@poke/shared';
import { PokemonSprite, ShinyStar, TypeBadge } from '../../components/ui';
import { api } from '../../lib/api';
import { PLAYER_STATE_KEYS, keys } from '../../lib/game';
import { errorText, formatCountdown } from '../../lib/labels';

/**
 * Combat d'un donjon, en temps réel. L'état vient de la même simulation que le serveur
 * (`simulateDungeon`), recalculée à chaque image : l'affichage a un léger retard
 * (`TRAVEL_MS`) pour que chaque projectile parte de l'attaquant et touche le défenseur à
 * l'instant où les PV baissent.
 */

/** Durée du trajet d'un projectile (et retard de l'affichage sur le combat). */
const TRAVEL_MS = 380;
/** Durée d'affichage des dégâts et de l'efficacité après l'impact. */
const POPUP_MS = 900;

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
  if (e === 0) return 'Aucun effet…';
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

/** Encadré de nom, niveau et PV d'un combattant. */
function FighterCard({
  name,
  level,
  hp,
  maxHp,
  shiny,
}: {
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  shiny?: boolean;
}) {
  return (
    <div className="w-40 rounded-lg bg-white/85 px-2 py-1 text-xs shadow dark:bg-slate-900/85">
      <div className="flex items-baseline justify-between gap-1">
        <span className="truncate font-semibold">
          {name} {shiny && <ShinyStar />}
        </span>
        <span className="shrink-0 text-slate-500">N.{level}</span>
      </div>
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

const OUTCOME_LABELS = {
  win: 'Victoire !',
  loss: 'Ton équipe est K.O.…',
  timeout: 'Temps écoulé…',
  fled: 'Tu as pris la fuite.',
} as const;

export function DungeonCombat({
  ctx,
  dungeon,
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
  dungeon: Dungeon | undefined;
  run: DungeonRunDto;
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
  onFinished: (result: ClaimDungeonResponse) => void;
}) {
  const queryClient = useQueryClient();
  const { setup } = run;
  const startedAt = Date.parse(run.startedAt);
  // Changement demandé, en attente de la réponse du serveur (affiché tout de suite). `base` :
  // nombre de commandes connues à la demande, pour l'ignorer dès que le cache contient la réponse
  // (pas effacé à la réponse, sinon il disparaîtrait une image avant que le cache ne soit diffusé).
  const [pending, setPending] = useState<{ atMs: number; member: number; base: number } | null>(
    null,
  );
  const [confirmFlee, setConfirmFlee] = useState(false);
  const [finished, setFinished] = useState(false);
  const now = useFrameNow(!finished, visible);
  const elapsed = Math.max(0, Math.min(now + offsetMs - startedAt, setup.timeLimitMs));
  const displayMs = Math.max(0, elapsed - TRAVEL_MS);
  const awaiting = pending !== null && run.commands.length === pending.base;
  const commands = useMemo(
    () =>
      pending && awaiting
        ? [...run.commands, { atMs: pending.atMs, member: pending.member }]
        : run.commands,
    [run.commands, pending, awaiting],
  );
  const live = simulateDungeon(setup, commands, run.fledAtMs, elapsed);
  const shown = simulateDungeon(setup, commands, run.fledAtMs, displayMs).state;
  const outcome = live.state.outcome;
  const over = outcome !== null && displayMs >= (live.state.endedAtMs ?? 0);

  const refresh = () =>
    Promise.all(PLAYER_STATE_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  const updateRun = (next: DungeonRunDto) =>
    queryClient.setQueryData<DungeonsResponse>(keys.dungeons, (old) =>
      // L'heure du serveur suit la date de mise à jour du cache : le décalage d'horloge reste juste.
      old
        ? { ...old, active: next, serverTime: new Date(Date.now() + offsetMs).toISOString() }
        : old,
    );

  const switchMember = useMutation({
    mutationFn: (input: { member: number; atMs: number }) =>
      api<DungeonRunDto>(`/api/dungeons/${run.id}/switch`, { method: 'POST', json: input }),
    onSuccess: (next) => updateRun(next),
    onError: () => setPending(null),
  });

  const claim = useMutation({
    mutationFn: () =>
      api<ClaimDungeonResponse>(`/api/dungeons/${run.id}/claim`, { method: 'POST' }),
    onSuccess: (data) => {
      onFinished(data);
      return refresh();
    },
    onError: () => {
      if (!visible) onClaimError();
    },
  });

  const flee = useMutation({
    mutationFn: () => api<ClaimDungeonResponse>(`/api/dungeons/${run.id}/flee`, { method: 'POST' }),
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
  const hit = (side: 'player' | 'enemy') =>
    popups.some((e) => e.side !== side && displayMs - e.atMs < 220 && e.damage > 0);
  const remaining = setup.enemies.slice(shown.enemyIndex + 1);
  const timeLeft = setup.timeLimitMs - displayMs;

  function send(member: number) {
    if (outcome !== null || awaiting || member === shown.active) return;
    if (shown.hp[member] === 0) return;
    // Daté à l'instant affiché (pas à l'instant réel, en avance de `TRAVEL_MS`) : le Pokémon
    // entre aussitôt, et le joueur agit sur ce qu'il voit. Le serveur tolère ce léger retard.
    const atMs = Math.round(displayMs);
    setPending({ atMs, member, base: run.commands.length });
    switchMember.mutate({ member, atMs });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-lg font-semibold">Donjon : {dungeon?.name ?? run.dungeonId}</h2>
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

      <div
        className="relative h-72 overflow-hidden rounded-2xl border border-slate-200 select-none sm:h-80 dark:border-slate-800"
        style={{
          background:
            'radial-gradient(ellipse 30% 9% at 22% 84%, #0002 60%, transparent 62%), radial-gradient(ellipse 26% 8% at 76% 56%, #0002 60%, transparent 62%), linear-gradient(to bottom, #bfdbfe 0%, #e0f2fe 52%, #bbf7d0 52%, #86efac 100%)',
        }}
      >
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
                  {i === remaining.length - 1 && (
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

        {/* Adversaire, à droite. */}
        <div className="absolute top-12 left-3 sm:left-6">
          <FighterCard
            name={fighterName(ctx, enemy)}
            level={enemy.level}
            hp={shown.enemyHp}
            maxHp={enemy.maxHp}
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
              size={shown.enemyIndex === setup.enemies.length - 1 ? 144 : 120}
            />
          </div>
        </div>

        {/* Notre Pokémon, à gauche, retourné pour regarder l'adversaire. */}
        <div className="absolute right-3 bottom-3 sm:right-6">
          <FighterCard
            name={fighterName(ctx, player)}
            level={player.level}
            hp={playerHp}
            maxHp={player.maxHp}
            shiny={player.isShiny}
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
        {popups.map((e) => (
          <DamagePopup key={`${e.side}-${e.atMs}`} event={e} age={displayMs - e.atMs} />
        ))}

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
          const attack = f.attackType ? dungeonAttack(setup.settings, f.attackType) : null;
          return (
            <button
              key={i}
              type="button"
              disabled={ko || isActive || outcome !== null}
              onClick={() => send(i)}
              title={ko ? 'K.O.' : isActive ? 'Au combat' : 'Envoyer au combat'}
              className={`flex items-center gap-2 rounded-xl border p-1.5 text-left text-xs transition ${
                isActive
                  ? 'border-brand-500 bg-brand-500/10'
                  : ko
                    ? 'border-slate-200 opacity-50 grayscale dark:border-slate-800'
                    : 'border-slate-200 hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800'
              }`}
            >
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
              </span>
            </button>
          );
        })}
      </div>
      {switchMember.error && (
        <p className="text-sm text-red-600">{errorText(switchMember.error)}</p>
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
