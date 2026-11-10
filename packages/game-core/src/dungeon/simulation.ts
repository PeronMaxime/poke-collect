import type { DungeonStat, Status } from '@poke/content';
import { DUNGEON_STATS } from '@poke/content';
import { createRng } from '../rng';
import { attackDamage, attackIntervalMs, attackTypeAgainst, stateStatMultiplier } from './rules';
import type {
  DungeonAbilityEffect,
  DungeonEvent,
  DungeonOutcome,
  DungeonSimulation,
  DungeonState,
} from './state';
import {
  MAX_SPEED_BOOST,
  SKIPPED_TURNS,
  STATUS_DAMAGE,
  WEATHER_DAMAGE,
  WEATHER_TYPE_IMMUNITY,
  canGetStatus,
  freshMods,
  hpShare,
  intimidation,
} from './status';
import type { FighterMods } from './status';
import { statModifierPercent } from './traits';
import { isHealCommand } from './types';
import type { DungeonCommand, DungeonFighter, DungeonSetup, HolderUp } from './types';

/**
 * Déroulement d'un combat.
 */

/**
 * État du combat `untilMs` après le départ (au plus tard à la fin du temps imparti). Les
 * commandes invalides (Pokémon K.O. ou déjà actif) sont ignorées. À égalité de temps : commande,
 * puis attaque du joueur, puis attaque de l'adversaire.
 */
export function simulateDungeon(
  setup: DungeonSetup,
  commands: readonly DungeonCommand[],
  fledAtMs: number | null,
  untilMs: number,
): DungeonSimulation {
  const { team, enemies, settings } = setup;
  const weather = setup.weather ?? null;
  const rng = createRng(setup.seed);
  // Porteurs de bonus d'équipe encore debout : PV restants ; adversaires pas encore vaincus.
  const teamUp: HolderUp = (i) => hp[i]! > 0;
  const enemyUp: HolderUp = (i) => i >= enemyIndex;
  const interval = (f: DungeonFighter, m: FighterMods, up: HolderUp, hpFraction = 1) =>
    attackIntervalMs(
      settings,
      f.stats.speed *
        m.stats.speed *
        stateStatMultiplier(f.traits, 'speed', hpFraction, !!m.status, up) *
        (m.status === 'paralysis' ? 0.5 : 1),
    );
  const queue = [...commands].sort((a, b) => a.atMs - b.atMs);
  const stopAt = Math.min(fledAtMs ?? Infinity, setup.timeLimitMs);
  const events: DungeonEvent[] = [];

  const hp = team.map((f) => f.maxHp);
  const mods = team.map(freshMods);
  const recallReadyAt = team.map(() => 0);
  let enemyMods = freshMods();
  let active = 0;
  let enemyIndex = 0;
  let enemyHp = enemies[0]?.maxHp ?? 0;
  let defeated = 0;
  let nextPlayer = Infinity;
  let nextEnemy = Infinity;
  let outcome: DungeonOutcome | null = null;
  let endedAtMs: number | null = null;
  let t = 0;
  let ci = 0;
  const chipTickMs = settings.chipTickMs ?? 0;
  let nextTick = chipTickMs > 0 ? chipTickMs : Infinity;

  type Side = 'player' | 'enemy';
  const current = (side: Side) => (side === 'player' ? team[active]! : enemies[enemyIndex]!);
  const indexOf = (side: Side) => (side === 'player' ? active : enemyIndex);
  const modsOf = (side: Side) => (side === 'player' ? mods[active]! : enemyMods);
  const hpOf = (side: Side) => (side === 'player' ? hp[active]! : enemyHp);
  const setHp = (side: Side, value: number) => {
    if (side === 'player') hp[active] = value;
    else enemyHp = value;
  };
  const other = (side: Side): Side => (side === 'player' ? 'enemy' : 'player');
  const upOf = (side: Side) => (side === 'player' ? teamUp : enemyUp);
  const suppressAnnounced = new Set<string>();
  /** Adversaires déjà déchaînés. */
  const enraged = new Set<number>();
  /** Déchaînement de l'adversaire en face, dès que ses PV passent sous le seuil. */
  const checkEnrage = () => {
    const f = enemies[enemyIndex];
    if (!f?.enrage || enraged.has(enemyIndex) || enemyHp <= 0) return;
    if (enemyHp > f.enrage.hpFraction * f.maxHp) return;
    enraged.add(enemyIndex);
    const factor = 1 + f.enrage.percent / 100;
    for (const stat of DUNGEON_STATS) enemyMods.stats[stat] *= factor;
    events.push({ kind: 'enrage', atMs: t, index: enemyIndex, percent: f.enrage.percent });
  };
  /** Talent neutralisé : le Pokémon en face a le Gaz Inhibiteur. */
  const neutralized = (side: Side) =>
    !!(side === 'player' ? enemies[enemyIndex] : team[active])?.traits?.suppressAbility;
  /** Combattant actif tel qu'il se bat : sans ses talents ni les bonus d'équipe s'il est neutralisé. */
  const fighterOf = (side: Side): DungeonFighter => {
    const f = current(side);
    if (!neutralized(side) || (!f.traits && !f.baseStats)) return f;
    return {
      ...f,
      stats: f.baseStats ?? f.stats,
      traits: undefined,
      abilityStatPercents: undefined,
    };
  };
  const trigger = (
    side: Side,
    effect: DungeonAbilityEffect,
    amount: number,
    stats?: DungeonStat[],
  ) =>
    events.push({
      kind: 'ability',
      atMs: t,
      side,
      index: indexOf(side),
      ability: current(side).ability ?? '',
      effect,
      amount,
      ...(stats && { stats }),
    });
  const statusEvent = (
    side: Side,
    status: Status | null,
    change: 'inflicted' | 'cured' | 'skipped' | 'damage',
    amount = 0,
  ) => events.push({ kind: 'status', atMs: t, side, index: indexOf(side), status, change, amount });
  /** Pertes de la brûlure, du poison et de la météo du Pokémon en face (événements compris). */
  const chipLoss = (side: Side): number => {
    const f = fighterOf(side);
    const m = modsOf(side);
    let total = 0;
    const statusLoss = m.status ? (STATUS_DAMAGE[m.status] ?? 0) : 0;
    if (statusLoss > 0) {
      const lost = Math.max(1, hpShare(f, statusLoss));
      total += lost;
      statusEvent(side, m.status, 'damage', lost);
    }
    const weatherImmune =
      !!f.traits?.weatherImmunity ||
      f.types.some((ty) => (weather && WEATHER_TYPE_IMMUNITY[weather]?.includes(ty)) ?? false);
    if ((weather === 'sand' || weather === 'hail') && !weatherImmune) {
      const lost = Math.max(1, hpShare(f, WEATHER_DAMAGE));
      total += lost;
      statusEvent(side, null, 'damage', lost);
    }
    return total;
  };
  const inflict = (side: Side, status: Status) => {
    const m = modsOf(side);
    if (!canGetStatus(fighterOf(side), m, status, weather, upOf(side))) return;
    m.status = status;
    m.statusTurns = SKIPPED_TURNS[status] ?? 0;
    statusEvent(side, status, 'inflicted');
  };

  /**
   * Entrée en combat : Gaz Inhibiteur (le sien, ou celui du Pokémon en face), puis Intimidation
   * (le Pokémon qui entre baisse des statistiques de celui d'en face).
   */
  const enter = (side: Side) => {
    for (const holder of [side, other(side)]) {
      // Une annonce par face-à-face (au départ, les deux entrées se suivent).
      const key = `${holder}:${indexOf(holder)}:${indexOf(other(holder))}`;
      if (
        current(holder).traits?.suppressAbility &&
        current(other(holder)).traits &&
        !suppressAnnounced.has(key)
      ) {
        suppressAnnounced.add(key);
        trigger(holder, 'suppressAbility', 0);
      }
    }
    const target = modsOf(other(side));
    // Un événement par baisse distincte (Attaque −25 %, Vitesse −10 %…).
    const byPercent = new Map<number, DungeonStat[]>();
    for (const [stat, percent] of intimidation(fighterOf(side).traits)) {
      if (percent <= 0) continue;
      target.stats[stat] *= Math.max(0, 1 - percent / 100);
      byPercent.set(percent, [...(byPercent.get(percent) ?? []), stat]);
    }
    for (const [percent, stats] of byPercent) trigger(side, 'intimidate', percent, stats);
  };
  /** K.O. de l'adversaire : le suivant entre, ou victoire. Renvoie vrai si le combat est fini. */
  const enemyDown = (): boolean => {
    defeated++;
    if (enemyIndex === enemies.length - 1) {
      outcome = 'win';
      endedAtMs = t;
      return true;
    }
    enemyIndex++;
    enemyHp = enemies[enemyIndex]!.maxHp;
    enemyMods = freshMods();
    nextEnemy = t + interval(fighterOf('enemy'), enemyMods, enemyUp);
    events.push({ kind: 'enemy', atMs: t, index: enemyIndex });
    enter('enemy');
    return false;
  };
  /**
   * K.O. du Pokémon actif : le suivant encore debout (dans l'ordre de l'équipe) qui n'a pas été
   * rappelé récemment, sinon le premier debout, ou défaite.
   */
  const playerDown = (): boolean => {
    const standing = Array.from(
      { length: team.length - 1 },
      (_, i) => (active + 1 + i) % team.length,
    ).filter((i) => hp[i]! > 0);
    const next = standing.find((i) => recallReadyAt[i]! <= t) ?? standing[0];
    if (next === undefined) {
      outcome = 'loss';
      endedAtMs = t;
      return true;
    }
    active = next;
    nextPlayer =
      t + interval(fighterOf('player'), mods[next]!, teamUp, hp[next]! / team[next]!.maxHp);
    events.push({ kind: 'switch', atMs: t, member: next, auto: true });
    enter('player');
    return false;
  };
  const down = (side: Side) => (side === 'player' ? playerDown() : enemyDown());
  const schedule = (side: Side) => {
    const f = fighterOf(side);
    const at = t + interval(f, modsOf(side), upOf(side), hpOf(side) / f.maxHp);
    if (side === 'player') nextPlayer = at;
    else nextEnemy = at;
  };

  if (team[0]) nextPlayer = interval(fighterOf('player'), mods[0]!, teamUp);
  if (enemies[0]) nextEnemy = interval(fighterOf('enemy'), enemyMods, enemyUp);

  if (team.length === 0) {
    outcome = 'loss';
    endedAtMs = 0;
  } else if (enemies.length === 0) {
    outcome = 'win';
    endedAtMs = 0;
  } else {
    enter('player');
    enter('enemy');
  }

  while (outcome === null) {
    const nextCommand = ci < queue.length ? queue[ci]!.atMs : Infinity;
    const next = Math.min(nextCommand, nextPlayer, nextEnemy, nextTick);
    if (next > stopAt || next > untilMs) {
      if (stopAt <= untilMs) {
        outcome = fledAtMs !== null && fledAtMs <= setup.timeLimitMs ? 'fled' : 'timeout';
        endedAtMs = stopAt;
        t = stopAt;
      } else {
        t = untilMs;
      }
      break;
    }
    t = next;

    if (nextCommand === t) {
      const command = queue[ci++]!;
      if (isHealCommand(command)) {
        const max = team[active]!.maxHp;
        const before = hp[active]!;
        if (before > 0 && before < max) {
          hp[active] = Math.min(max, before + Math.max(1, Math.round(command.heal * max)));
          events.push({
            kind: 'item',
            atMs: t,
            member: active,
            itemId: command.itemId,
            amount: hp[active]! - before,
          });
        }
        continue;
      }
      const { member } = command;
      if (
        member !== active &&
        member >= 0 &&
        member < team.length &&
        hp[member]! > 0 &&
        recallReadyAt[member]! <= t
      ) {
        // Talents du Pokémon qui sort : Régé-Force (soin), Médic Nature (statut guéri).
        const leaving = fighterOf('player');
        const regen = hpShare(leaving, leaving.traits?.regenerator ?? 0);
        if (regen > 0 && hp[active]! < leaving.maxHp) {
          const healed = Math.min(leaving.maxHp, hp[active]! + regen) - hp[active]!;
          hp[active] = hp[active]! + healed;
          trigger('player', 'regenerator', healed);
        }
        if (leaving.traits?.naturalCure && mods[active]!.status) {
          mods[active]!.status = null;
          mods[active]!.statusTurns = 0;
          trigger('player', 'naturalCure', 0);
        }
        recallReadyAt[active] = t + (settings.recallCooldownMs ?? 0);
        active = member;
        nextPlayer =
          t +
          interval(fighterOf('player'), mods[member]!, teamUp, hp[member]! / team[member]!.maxHp);
        events.push({ kind: 'switch', atMs: t, member, auto: false });
        enter('player');
      }
      continue;
    }

    // Pertes à intervalle fixe (météo, brûlure, poison) : l'adversaire tombe d'abord.
    if (nextTick === t && nextTick < Math.min(nextPlayer, nextEnemy)) {
      nextTick += chipTickMs;
      for (const holder of ['enemy', 'player'] as const) {
        const lost = chipLoss(holder);
        if (lost > 0) setHp(holder, Math.max(0, hpOf(holder) - lost));
      }
      checkEnrage();
      if (enemyHp === 0 && down('enemy')) break;
      if (hp[active] === 0 && down('player')) break;
      continue;
    }

    const side: Side = nextPlayer <= nextEnemy ? 'player' : 'enemy';
    const target = other(side);
    const attacker = fighterOf(side);
    const defender = fighterOf(target);
    const attackerMods = modsOf(side);
    const targetMods = modsOf(target);

    // Endormi ou gelé : il saute son attaque (sans tirage), puis se réveille ou dégèle.
    if (attackerMods.statusTurns > 0) {
      attackerMods.statusTurns--;
      statusEvent(side, attackerMods.status, 'skipped');
      if (attackerMods.statusTurns === 0) {
        statusEvent(side, attackerMods.status, 'cured');
        attackerMods.status = null;
      }
      schedule(side);
      continue;
    }

    const roll = rng.next();
    const attackType = attackTypeAgainst(attacker, defender);
    const before = hpOf(target);
    const immunity = defender.traits?.immunities.find((i) => i.type === attackType);
    let damage = 0;
    let effectiveness = 0;
    let critical = false;
    if (immunity) {
      const healed = Math.min(defender.maxHp, before + hpShare(defender, immunity.heal));
      setHp(target, healed);
      trigger(target, 'immunity', healed - before);
    } else {
      // Sans chance de critique (tentatives antérieures), aucun tirage : la suite est inchangée.
      // Le tirage a lieu même contre un Pokémon insensible aux critiques (Armurbaston).
      const attackerUp = upOf(side);
      const defenderUp = upOf(target);
      const attackerHpFraction = hpOf(side) / attacker.maxHp;
      const defenderHpFraction = before / defender.maxHp;
      const critPercent =
        (attacker.traits?.critPercent ?? 0) +
        statModifierPercent(
          attacker.traits,
          'critChance',
          attackerHpFraction,
          !!attackerMods.status,
          attackerUp,
        );
      const critChance = Math.min(
        1,
        Math.max(0, (settings.critChance ?? 0) * (1 + critPercent / 100)),
      );
      critical = critChance > 0 && rng.chance(critChance) && !defender.traits?.critImmunity;
      const special = attacker.category === 'special';
      const attackStat = special ? 'special-attack' : 'attack';
      const defenseStat = special ? 'special-defense' : 'defense';
      ({ damage, effectiveness } = attackDamage(settings, attacker, defender, attackType, roll, {
        attackMultiplier:
          attackerMods.stats[attackStat] *
          stateStatMultiplier(
            attacker.traits,
            attackStat,
            attackerHpFraction,
            !!attackerMods.status,
            attackerUp,
          ),
        defenseMultiplier:
          targetMods.stats[defenseStat] *
          stateStatMultiplier(
            defender.traits,
            defenseStat,
            defenderHpFraction,
            !!targetMods.status,
            defenderUp,
          ),
        attackerHpFraction,
        defenderHpFraction,
        attackerUp,
        defenderUp,
        attackerStatus: attackerMods.status,
        defenderStatus: targetMods.status,
        weather,
        critical,
      }));
      if (
        defender.traits?.sturdy &&
        !targetMods.sturdyUsed &&
        before === defender.maxHp &&
        before > 1 &&
        damage >= before
      ) {
        damage = before - 1;
        targetMods.sturdyUsed = true;
        trigger(target, 'sturdy', 0);
      }
      setHp(target, Math.max(0, before - damage));
    }
    const ko = hpOf(target) === 0;
    events.push({
      kind: 'attack',
      atMs: t,
      side,
      attacker: indexOf(side),
      defender: indexOf(target),
      attackType,
      damage,
      effectiveness,
      ...(critical && { critical }),
      ko,
    });
    schedule(side);

    // Talents après l'attaque : Turbo, Impudence, statuts infligés, contact et explosion.
    if (attacker.traits?.speedBoost) {
      attackerMods.stats.speed = Math.min(
        MAX_SPEED_BOOST,
        attackerMods.stats.speed * (1 + attacker.traits.speedBoost / 100),
      );
    }
    if (ko && attacker.traits?.moxie) {
      attackerMods.stats.attack *= 1 + attacker.traits.moxie / 100;
      attackerMods.stats['special-attack'] *= 1 + attacker.traits.moxie / 100;
      trigger(side, 'moxie', attacker.traits.moxie);
    }
    const physical = attacker.category === 'physical';
    if (damage > 0 && !ko) {
      for (const s of attacker.traits?.inflict ?? []) {
        if (s.trigger === 'attack' && rng.chance(s.chance)) inflict(target, s.status);
      }
    }
    let recoil = 0;
    if (physical && damage > 0) {
      for (const s of defender.traits?.inflict ?? []) {
        if (s.trigger === 'contact' && rng.chance(s.chance)) inflict(side, s.status);
      }
      if (defender.traits?.contactDamage) {
        const lost = Math.max(1, hpShare(attacker, defender.traits.contactDamage));
        recoil += lost;
        trigger(target, 'contactDamage', lost);
      }
    }
    if (physical && ko && defender.traits?.aftermath) {
      const lost = Math.max(1, hpShare(attacker, defender.traits.aftermath));
      recoil += lost;
      trigger(target, 'aftermath', lost);
    }
    // Fin de son attaque : brûlure, poison et météo (sauf pertes à intervalle fixe).
    if (!chipTickMs) recoil += chipLoss(side);
    if (recoil > 0) setHp(side, Math.max(0, hpOf(side) - recoil));
    const attackerKo = recoil > 0 && hpOf(side) === 0;

    checkEnrage();
    // Le défenseur tombe d'abord (un boss vaincu est une victoire), puis l'attaquant.
    if (ko && down(target)) break;
    if (attackerKo && down(side)) break;
  }

  return {
    state: {
      elapsedMs: endedAtMs ?? t,
      outcome,
      endedAtMs,
      active,
      hp,
      enemyIndex,
      enemyHp,
      defeated,
      nextPlayerAttackAt: nextPlayer,
      nextEnemyAttackAt: nextEnemy,
      statuses: mods.map((m) => m.status),
      enemyStatus: enemyMods.status,
      recallReadyAt,
      statMods: mods.map((m) => ({ ...m.stats })),
      enemyStatMods: { ...enemyMods.stats },
    },
    events,
  };
}

/**
 * Variation (en %, arrondie) de chaque statistique d'un combattant à l'instant de `state` :
 * talents (fixes et selon son état), changements du combat et paralysie. Sans les variations
 * nulles. Un adversaire pas encore entré n'a que ses talents ; le talent du Pokémon actif ne
 * joue plus face à un Gaz Inhibiteur.
 */
export function dungeonStatChanges(
  setup: DungeonSetup,
  state: DungeonState,
  side: 'player' | 'enemy',
  index: number,
): Partial<Record<DungeonStat, number>> {
  const player = side === 'player';
  const f = player ? setup.team[index] : setup.enemies[index];
  if (!f) return {};
  const onField = index === (player ? state.active : state.enemyIndex);
  const facing = player ? setup.enemies[state.enemyIndex] : setup.team[state.active];
  const neutralized = onField && !!facing?.traits?.suppressAbility;
  const changes = player ? state.statMods[index] : onField ? state.enemyStatMods : undefined;
  const hp = player ? (state.hp[index] ?? 0) : onField ? state.enemyHp : f.maxHp;
  const status = player ? state.statuses[index] : onField ? state.enemyStatus : null;
  const up: HolderUp = player ? (i) => (state.hp[i] ?? 0) > 0 : (i) => i >= state.enemyIndex;
  const out: Partial<Record<DungeonStat, number>> = {};
  for (const stat of DUNGEON_STATS) {
    let mult = changes?.[stat] ?? 1;
    if (!neutralized) {
      // Bonus du talent tel qu'annoncé (Coloforce : +50 %), pas le rapport des statistiques
      // arrondies ; les dégâts, eux, restent calculés sur les statistiques arrondies.
      if (f.abilityStatPercents) mult *= 1 + (f.abilityStatPercents[stat] ?? 0) / 100;
      else if (f.baseStats) mult *= f.stats[stat] / f.baseStats[stat];
      mult *= stateStatMultiplier(f.traits, stat, hp / f.maxHp, !!status, up);
    }
    if (stat === 'speed' && status === 'paralysis') mult *= 0.5;
    const percent = Math.round((mult - 1) * 100);
    if (percent !== 0) out[stat] = percent;
  }
  return out;
}
