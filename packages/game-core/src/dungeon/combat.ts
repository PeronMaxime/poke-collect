import type { DungeonStat, Status, Weather } from '@poke/content';
import { DUNGEON_STATS } from '@poke/content';
import { createRng } from '../rng';
import type { Rng } from '../rng';
import { attackIntervalMs, stateStatMultiplier } from './rules';
import type { DungeonAbilityEffect, DungeonEvent, DungeonOutcome, DungeonState } from './state';
import {
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
import type { DungeonCombatSettings, DungeonFighter, DungeonSetup, HolderUp } from './types';

/**
 * L'état d'un combat en cours de simulation, et ce qui le fait changer sans être une attaque :
 * entrée d'un Pokémon, K.O., statut infligé, pertes de la brûlure, du poison et de la météo,
 * déchaînement d'un boss. Interne au dossier : `simulation.ts` enchaîne ces opérations dans
 * l'ordre du temps.
 *
 * Tout est modifié sur place, et chaque changement visible ajoute un événement à `events` : c'est
 * ce journal que le jeu anime.
 */

/** Un camp : l'équipe du joueur ou la suite d'adversaires. */
export type Side = 'player' | 'enemy';

/** Le camp d'en face. */
export const other = (side: Side): Side => (side === 'player' ? 'enemy' : 'player');

/** Combat en cours de simulation : un Pokémon actif par camp, à l'instant `t` (ms depuis le départ). */
export class Combat {
  readonly team: readonly DungeonFighter[];
  readonly enemies: readonly DungeonFighter[];
  readonly settings: DungeonCombatSettings;
  readonly weather: Weather | null;
  /** Tirages du combat, dans l'ordre des attaques : ne jamais en ajouter un hors d'une attaque. */
  readonly rng: Rng;
  readonly events: DungeonEvent[] = [];

  /** PV de chaque membre de l'équipe ; 0 : K.O. */
  readonly hp: number[];
  readonly mods: FighterMods[];
  /** Instant à partir duquel chaque membre rappelé peut revenir. */
  readonly recallReadyAt: number[];
  enemyMods = freshMods();
  /** Membre de l'équipe au combat. */
  active = 0;
  /** Adversaire en face ; les précédents sont vaincus. */
  enemyIndex = 0;
  enemyHp: number;
  defeated = 0;
  /** Instant de la prochaine attaque de chaque camp. */
  nextPlayer = Infinity;
  nextEnemy = Infinity;
  outcome: DungeonOutcome | null = null;
  endedAtMs: number | null = null;
  t = 0;

  /** Face-à-face où le Gaz Inhibiteur a déjà été annoncé. */
  private readonly suppressAnnounced = new Set<string>();
  /** Adversaires déjà déchaînés. */
  private readonly enraged = new Set<number>();

  /** Met les deux premiers Pokémon face à face ; un camp vide perd d'emblée. */
  constructor(setup: DungeonSetup) {
    this.team = setup.team;
    this.enemies = setup.enemies;
    this.settings = setup.settings;
    this.weather = setup.weather ?? null;
    this.rng = createRng(setup.seed);
    this.hp = this.team.map((f) => f.maxHp);
    this.mods = this.team.map(freshMods);
    this.recallReadyAt = this.team.map(() => 0);
    this.enemyHp = this.enemies[0]?.maxHp ?? 0;

    if (this.team[0]) this.schedule('player');
    if (this.enemies[0]) this.schedule('enemy');
    if (this.team.length === 0) this.end('loss');
    else if (this.enemies.length === 0) this.end('win');
    else {
      this.enter('player');
      this.enter('enemy');
    }
  }

  // --- Lecture ---------------------------------------------------------------------------------

  /** Porteurs de bonus d'équipe encore debout : PV restants ; adversaires pas encore vaincus. */
  readonly teamUp: HolderUp = (i) => this.hp[i]! > 0;
  readonly enemyUp: HolderUp = (i) => i >= this.enemyIndex;

  upOf(side: Side): HolderUp {
    return side === 'player' ? this.teamUp : this.enemyUp;
  }

  /** Pokémon actif d'un camp, tel que la mise en place le décrit. */
  current(side: Side): DungeonFighter {
    return side === 'player' ? this.team[this.active]! : this.enemies[this.enemyIndex]!;
  }

  indexOf(side: Side): number {
    return side === 'player' ? this.active : this.enemyIndex;
  }

  modsOf(side: Side): FighterMods {
    return side === 'player' ? this.mods[this.active]! : this.enemyMods;
  }

  hpOf(side: Side): number {
    return side === 'player' ? this.hp[this.active]! : this.enemyHp;
  }

  /** Talent neutralisé : le Pokémon en face a le Gaz Inhibiteur. */
  private neutralized(side: Side): boolean {
    const facing = side === 'player' ? this.enemies[this.enemyIndex] : this.team[this.active];
    return !!facing?.traits?.suppressAbility;
  }

  /** Combattant actif tel qu'il se bat : sans ses talents ni les bonus d'équipe s'il est neutralisé. */
  fighterOf(side: Side): DungeonFighter {
    const f = this.current(side);
    if (!this.neutralized(side) || (!f.traits && !f.baseStats)) return f;
    return {
      ...f,
      stats: f.baseStats ?? f.stats,
      traits: undefined,
      abilityStatPercents: undefined,
    };
  }

  // --- Écriture --------------------------------------------------------------------------------

  setHp(side: Side, value: number): void {
    if (side === 'player') this.hp[this.active] = value;
    else this.enemyHp = value;
  }

  /** Retire des PV au Pokémon actif d'un camp, sans descendre sous 0. */
  lose(side: Side, amount: number): void {
    this.setHp(side, Math.max(0, this.hpOf(side) - amount));
  }

  /** Programme la prochaine attaque d'un camp : sa cadence dépend de sa Vitesse du moment. */
  schedule(side: Side): void {
    const f = this.fighterOf(side);
    const m = this.modsOf(side);
    const speed =
      f.stats.speed *
      m.stats.speed *
      stateStatMultiplier(
        f.traits,
        'speed',
        this.hpOf(side) / f.maxHp,
        !!m.status,
        this.upOf(side),
      ) *
      (m.status === 'paralysis' ? 0.5 : 1);
    const at = this.t + attackIntervalMs(this.settings, speed);
    if (side === 'player') this.nextPlayer = at;
    else this.nextEnemy = at;
  }

  /** Termine le combat, à l'instant courant ou à `atMs` (fuite, temps écoulé). */
  end(outcome: DungeonOutcome, atMs = this.t): void {
    this.outcome = outcome;
    this.endedAtMs = atMs;
    this.t = atMs;
  }

  /** Événement « talent déclenché » du Pokémon actif d'un camp. */
  trigger(side: Side, effect: DungeonAbilityEffect, amount: number, stats?: DungeonStat[]): void {
    this.events.push({
      kind: 'ability',
      atMs: this.t,
      side,
      index: this.indexOf(side),
      ability: this.current(side).ability ?? '',
      effect,
      amount,
      ...(stats && { stats }),
    });
  }

  statusEvent(
    side: Side,
    status: Status | null,
    change: 'inflicted' | 'cured' | 'skipped' | 'damage',
    amount = 0,
  ): void {
    this.events.push({
      kind: 'status',
      atMs: this.t,
      side,
      index: this.indexOf(side),
      status,
      change,
      amount,
    });
  }

  /** Inflige un statut au Pokémon actif d'un camp, s'il peut le recevoir. */
  inflict(side: Side, status: Status): void {
    const m = this.modsOf(side);
    if (!canGetStatus(this.fighterOf(side), m, status, this.weather, this.upOf(side))) return;
    m.status = status;
    m.statusTurns = SKIPPED_TURNS[status] ?? 0;
    this.statusEvent(side, status, 'inflicted');
  }

  /**
   * PV que la brûlure, le poison et la météo coûtent au Pokémon actif d'un camp. Les événements
   * sont émis ici ; les PV sont retirés par l'appelant.
   */
  chipLoss(side: Side): number {
    const f = this.fighterOf(side);
    const m = this.modsOf(side);
    const { weather } = this;
    let total = 0;
    const statusLoss = m.status ? (STATUS_DAMAGE[m.status] ?? 0) : 0;
    if (statusLoss > 0) {
      const lost = Math.max(1, hpShare(f, statusLoss));
      total += lost;
      this.statusEvent(side, m.status, 'damage', lost);
    }
    const weatherImmune =
      !!f.traits?.weatherImmunity ||
      f.types.some((ty) => (weather && WEATHER_TYPE_IMMUNITY[weather]?.includes(ty)) ?? false);
    if ((weather === 'sand' || weather === 'hail') && !weatherImmune) {
      const lost = Math.max(1, hpShare(f, WEATHER_DAMAGE));
      total += lost;
      this.statusEvent(side, null, 'damage', lost);
    }
    return total;
  }

  /** Déchaînement de l'adversaire en face, dès que ses PV passent sous le seuil. */
  checkEnrage(): void {
    const f = this.enemies[this.enemyIndex];
    if (!f?.enrage || this.enraged.has(this.enemyIndex) || this.enemyHp <= 0) return;
    if (this.enemyHp > f.enrage.hpFraction * f.maxHp) return;
    this.enraged.add(this.enemyIndex);
    const factor = 1 + f.enrage.percent / 100;
    for (const stat of DUNGEON_STATS) this.enemyMods.stats[stat] *= factor;
    this.events.push({
      kind: 'enrage',
      atMs: this.t,
      index: this.enemyIndex,
      percent: f.enrage.percent,
    });
  }

  /**
   * Entrée en combat : Gaz Inhibiteur (le sien, ou celui du Pokémon en face), puis Intimidation
   * (le Pokémon qui entre baisse des statistiques de celui d'en face).
   */
  enter(side: Side): void {
    for (const holder of [side, other(side)]) {
      // Une annonce par face-à-face (au départ, les deux entrées se suivent).
      const key = `${holder}:${this.indexOf(holder)}:${this.indexOf(other(holder))}`;
      if (
        this.current(holder).traits?.suppressAbility &&
        this.current(other(holder)).traits &&
        !this.suppressAnnounced.has(key)
      ) {
        this.suppressAnnounced.add(key);
        this.trigger(holder, 'suppressAbility', 0);
      }
    }
    const target = this.modsOf(other(side));
    // Un événement par baisse distincte (Attaque −25 %, Vitesse −10 %…).
    const byPercent = new Map<number, DungeonStat[]>();
    for (const [stat, percent] of intimidation(this.fighterOf(side).traits)) {
      if (percent <= 0) continue;
      target.stats[stat] *= Math.max(0, 1 - percent / 100);
      byPercent.set(percent, [...(byPercent.get(percent) ?? []), stat]);
    }
    for (const [percent, stats] of byPercent) this.trigger(side, 'intimidate', percent, stats);
  }

  /** Fait entrer un autre membre de l'équipe (choisi par le joueur, ou `auto` après un K.O.). */
  switchTo(member: number, auto: boolean): void {
    this.active = member;
    this.schedule('player');
    this.events.push({ kind: 'switch', atMs: this.t, member, auto });
    this.enter('player');
  }

  /** K.O. du Pokémon actif d'un camp : le suivant entre. Renvoie vrai si le combat est fini. */
  down(side: Side): boolean {
    return side === 'player' ? this.playerDown() : this.enemyDown();
  }

  /** K.O. de l'adversaire : le suivant entre, ou victoire. */
  private enemyDown(): boolean {
    this.defeated++;
    if (this.enemyIndex === this.enemies.length - 1) {
      this.end('win');
      return true;
    }
    this.enemyIndex++;
    this.enemyHp = this.enemies[this.enemyIndex]!.maxHp;
    this.enemyMods = freshMods();
    this.schedule('enemy');
    this.events.push({ kind: 'enemy', atMs: this.t, index: this.enemyIndex });
    this.enter('enemy');
    return false;
  }

  /**
   * K.O. du Pokémon actif : le suivant encore debout (dans l'ordre de l'équipe) qui n'a pas été
   * rappelé récemment, sinon le premier debout, ou défaite.
   */
  private playerDown(): boolean {
    const { team, hp, active } = this;
    const standing = Array.from(
      { length: team.length - 1 },
      (_, i) => (active + 1 + i) % team.length,
    ).filter((i) => hp[i]! > 0);
    const next = standing.find((i) => this.recallReadyAt[i]! <= this.t) ?? standing[0];
    if (next === undefined) {
      this.end('loss');
      return true;
    }
    this.switchTo(next, true);
    return false;
  }

  /** Photographie de l'état, telle que le jeu et le serveur la lisent. */
  state(): DungeonState {
    return {
      elapsedMs: this.endedAtMs ?? this.t,
      outcome: this.outcome,
      endedAtMs: this.endedAtMs,
      active: this.active,
      hp: this.hp,
      enemyIndex: this.enemyIndex,
      enemyHp: this.enemyHp,
      defeated: this.defeated,
      nextPlayerAttackAt: this.nextPlayer,
      nextEnemyAttackAt: this.nextEnemy,
      statuses: this.mods.map((m) => m.status),
      enemyStatus: this.enemyMods.status,
      recallReadyAt: this.recallReadyAt,
      statMods: this.mods.map((m) => ({ ...m.stats })),
      enemyStatMods: { ...this.enemyMods.stats },
    };
  }
}
