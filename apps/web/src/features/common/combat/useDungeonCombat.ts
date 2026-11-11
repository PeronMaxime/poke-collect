/**
 * État d'un combat en temps réel (donjon, dresseur ou légendaire). Il vient de la même simulation
 * que le serveur (`simulateDungeon`), recalculée à chaque image à partir des ordres connus ; les
 * ordres du joueur (changement, baie) sont affichés tout de suite, puis confirmés par le serveur.
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryKey } from '@tanstack/react-query';
import { combatWeatherSource, healReadyAt, simulateDungeon } from '@poke/game-core';
import type { DungeonCommand, DungeonEvent, GameContext } from '@poke/game-core';
import type { CombatItemInput, DungeonRunDto } from '@poke/shared';
import { ApiError } from '../../../lib/api';
import {
  endCombat,
  keys,
  refreshAfterCombat,
  sendCombatOrder,
  useInventory,
} from '../../../lib/queries';
import type { CombatApi } from '../../../lib/queries';
import { TRAVEL_MS, shownEvents, weatherDisplay } from './events';

/** Combat en cours (tentative de donjon ou combat de dresseur) : ce qu'il faut pour le rejouer. */
export type CombatRun = Pick<DungeonRunDto, 'id' | 'setup' | 'commands' | 'fledAtMs' | 'startedAt'>;

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

/** Ce que reçoit l'écran de combat. */
export interface DungeonCombatProps<R extends CombatRun, C> {
  ctx: GameContext;
  /** Titre de la fenêtre (« Donjon : … », « Combat contre … »). */
  title: string;
  /** Famille du combat (dresseur, donjon, légendaire) : la racine de ses routes. */
  apiBase: CombatApi;
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
}

/** Tout ce qu'affichent les pièces de l'écran de combat. */
export type CombatModel = ReturnType<typeof useDungeonCombat<CombatRun, unknown>>;

/**
 * Ordres envoyés au serveur (changement de Pokémon, baie, fuite) et réclamation du résultat :
 * automatique à la fin du combat, le temps de lire l'issue ; fenêtre fermée, elle attend que le
 * joueur demande le résultat depuis la liste (`claimRequested`).
 */
function useCombatActions<R extends CombatRun, C>({
  apiBase,
  queryKey,
  run,
  offsetMs,
  visible,
  claimRequested,
  over,
  onOver,
  onClaimError,
  onFinished,
  setPending,
  setFinished,
}: Pick<
  DungeonCombatProps<R, C>,
  | 'apiBase'
  | 'queryKey'
  | 'run'
  | 'offsetMs'
  | 'visible'
  | 'claimRequested'
  | 'onOver'
  | 'onClaimError'
  | 'onFinished'
> & {
  /** Fin du combat atteinte à l'écran. */
  over: boolean;
  setPending: (pending: null) => void;
  setFinished: (finished: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const refresh = () => refreshAfterCombat(queryClient, queryKey);
  const updateRun = (next: R) =>
    queryClient.setQueryData<{ active: R | null; serverTime: string }>(queryKey, (old) =>
      // L'heure du serveur suit la date de mise à jour du cache : le décalage d'horloge reste juste.
      old
        ? { ...old, active: next, serverTime: new Date(Date.now() + offsetMs).toISOString() }
        : old,
    );

  const switchMember = useMutation({
    mutationFn: (input: { member: number; atMs: number }) =>
      sendCombatOrder<R>(apiBase, run.id, 'switch', input),
    onSuccess: (next) => updateRun(next),
    onError: () => setPending(null),
  });

  const giveItem = useMutation({
    mutationFn: (input: CombatItemInput) => sendCombatOrder<R>(apiBase, run.id, 'item', input),
    onSuccess: (next) => {
      updateRun(next);
      return queryClient.invalidateQueries({ queryKey: keys.inventory });
    },
    onError: () => setPending(null),
  });

  const claim = useMutation({
    mutationFn: () => endCombat<C>(apiBase, run.id, 'claim'),
    onSuccess: (data) => {
      onFinished(data);
      return refresh();
    },
    onError: (err) => {
      // Déjà réglé par le serveur (rattrapage lancé par une autre requête, comme la liste des
      // Pokémon, ou par un autre onglet) : ce combat en cache est périmé. On recharge : la fenêtre
      // disparaît et le résultat s'affiche depuis le dernier combat réglé.
      if (err instanceof ApiError && err.code === 'ALREADY_CLAIMED') return refresh();
      if (!visible) onClaimError();
    },
  });

  const flee = useMutation({
    mutationFn: () => endCombat<C>(apiBase, run.id, 'flee'),
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
  }, [over, fleeing, visible, claimRequested, claimMutate, setFinished]);
  return { switchMember, giveItem, claim, flee };
}

/**
 * Combat rejoué jusqu'à l'instant affiché : combattants, PV, événements visibles, baies de soin
 * utilisables, et les ordres que le joueur peut donner (`send`, `heal`).
 */
export function useDungeonCombat<R extends CombatRun, C>(props: DungeonCombatProps<R, C>) {
  const { ctx, title, bossLast = false, run, offsetMs, visible, onHide } = props;
  const { setup } = run;
  const startedAt = Date.parse(run.startedAt);
  // Changement ou baie demandés, en attente de la réponse du serveur (affichés tout de suite).
  // `base` : nombre de commandes connues à la demande, pour l'ignorer dès que le cache contient la
  // réponse (pas effacé à la réponse, sinon il disparaîtrait une image avant que le cache ne soit
  // diffusé).
  const [pending, setPending] = useState<{ command: DungeonCommand; base: number } | null>(null);
  const inventory = useInventory();
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
  const { switchMember, giveItem, claim, flee } = useCombatActions({
    ...props,
    over,
    setPending,
    setFinished,
  });

  // Météo affichée : celle du lieu au tout début si un talent impose la sienne, puis celle-ci.
  const weatherSource = useMemo(() => combatWeatherSource(ctx, setup), [ctx, setup]);
  const { startWeather, shownWeather, weatherBanner } = weatherDisplay(
    setup,
    !!weatherSource,
    displayMs,
  );

  const player = setup.team[shown.active]!;
  const enemy = setup.enemies[shown.enemyIndex]!;
  const playerHp = shown.hp[shown.active] ?? 0;
  const { inFlight, popups, statusPopups, abilityPopups, itemPopups } = shownEvents(
    live.events,
    displayMs,
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
  // Phase 2 d'un légendaire : il se déchaîne sous une part de ses PV (annoncé quelques secondes).
  const enrage = live.events.find(
    (e): e is DungeonEvent & { kind: 'enrage' } =>
      e.kind === 'enrage' && e.index === shown.enemyIndex && e.atMs <= displayMs,
  );
  const enrageAge = enrage ? displayMs - enrage.atMs : Infinity;
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

  return {
    ctx,
    title,
    bossLast,
    onHide,
    setup,
    shown,
    outcome,
    over,
    displayMs,
    startWeather,
    shownWeather,
    weatherSource,
    weatherBanner,
    player,
    enemy,
    playerHp,
    inFlight,
    popups,
    statusPopups,
    abilityPopups,
    itemPopups,
    healItems,
    canHeal,
    hit,
    remaining,
    enrage,
    enrageAge,
    timeLeft,
    send,
    heal,
    switchMember,
    giveItem,
    claim,
    flee,
  };
}
