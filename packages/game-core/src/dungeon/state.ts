import type { DungeonStat, Status } from '@poke/content';
import { DUNGEON_STATS } from '@poke/content';
import { stateStatMultiplier } from './rules';
import type { DungeonSetup, HolderUp } from './types';

/**
 * Ce que la simulation produit : l'issue, les événements (pour l'animation et le journal du
 * combat) et l'état à un instant donné.
 */

/** Issue d'un combat : victoire, défaite, temps écoulé ou fuite. */
export type DungeonOutcome = 'win' | 'loss' | 'timeout' | 'fled';

/** Effet de talent visible pendant le combat. */
export type DungeonAbilityEffect =
  | 'immunity'
  | 'sturdy'
  | 'regenerator'
  | 'moxie'
  | 'intimidate'
  | 'contactDamage'
  | 'aftermath'
  | 'naturalCure'
  | 'suppressAbility';

/** Un fait du combat, daté en millisecondes depuis le départ. Le jeu les anime dans l'ordre. */
export type DungeonEvent =
  | {
      kind: 'attack';
      atMs: number;
      side: 'player' | 'enemy';
      /** Index de l'attaquant (dans l'équipe ou parmi les adversaires). */
      attacker: number;
      /** Index du défenseur. */
      defender: number;
      attackType: string;
      damage: number;
      effectiveness: number;
      /** Coup critique ; absent = non. */
      critical?: boolean;
      ko: boolean;
    }
  /** Changement de Pokémon actif : demandé par le joueur, ou automatique après un K.O. */
  | { kind: 'switch'; atMs: number; member: number; auto: boolean }
  /** Objet de soin donné par le joueur au Pokémon actif (`amount` : PV rendus). */
  | { kind: 'item'; atMs: number; member: number; itemId: string; amount: number }
  /** Entrée en combat de l'adversaire suivant. */
  | { kind: 'enemy'; atMs: number; index: number }
  /** L'adversaire se déchaîne (voir `DungeonFighter.enrage`) : statistiques +`percent` %. */
  | { kind: 'enrage'; atMs: number; index: number; percent: number }
  /**
   * Talent qui se déclenche (`side`, `index` : son Pokémon). `amount` : PV soignés (immunité,
   * soin au rappel), PV perdus par l'attaquant (contact, explosion) ou % (Intimidation, Impudence).
   */
  | {
      kind: 'ability';
      atMs: number;
      side: 'player' | 'enemy';
      index: number;
      ability: string;
      effect: DungeonAbilityEffect;
      amount: number;
      /** Statistiques baissées du Pokémon en face (Intimidation). */
      stats?: DungeonStat[];
    }
  /**
   * Statut d'un Pokémon : `inflicted` (nouveau statut), `cured` (réveil, dégel), `skipped`
   * (endormi ou gelé, il n'attaque pas), `damage` (brûlure, poison ou météo : `amount` PV perdus ;
   * `status` null = tempête de sable ou grêle).
   */
  | {
      kind: 'status';
      atMs: number;
      side: 'player' | 'enemy';
      index: number;
      status: Status | null;
      change: 'inflicted' | 'cured' | 'skipped' | 'damage';
      amount: number;
    };

/** État du combat à un instant. */
export interface DungeonState {
  elapsedMs: number;
  /** null tant que le combat continue. */
  outcome: DungeonOutcome | null;
  endedAtMs: number | null;
  /** Pokémon actif du joueur (index dans l'équipe). */
  active: number;
  hp: number[];
  enemyIndex: number;
  enemyHp: number;
  /** Adversaires vaincus (les premiers de la liste). */
  defeated: number;
  nextPlayerAttackAt: number;
  nextEnemyAttackAt: number;
  /** Statuts de l'équipe (même ordre que `hp`) et de l'adversaire en face. */
  statuses: (Status | null)[];
  enemyStatus: Status | null;
  /**
   * Instant à partir duquel chaque membre rappelé peut revenir au combat (0 = jamais rappelé).
   * Un K.O. fait toujours entrer un Pokémon : le dernier encore debout revient même avant.
   */
  recallReadyAt: number[];
  /**
   * Multiplicateurs de statistiques gagnés ou perdus en combat (Intimidation, Impudence, Turbo)
   * de l'équipe (même ordre que `hp`) et de l'adversaire en face.
   */
  statMods: Record<DungeonStat, number>[];
  enemyStatMods: Record<DungeonStat, number>;
}

/** Résultat d'une simulation : l'état à l'instant demandé, et tous les événements jusque-là. */
export interface DungeonSimulation {
  state: DungeonState;
  events: DungeonEvent[];
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
