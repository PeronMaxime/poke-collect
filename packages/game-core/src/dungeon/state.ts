import type { DungeonStat, Status } from '@poke/content';

/**
 * Ce que la simulation produit : l'issue, les événements (pour l'animation et le journal du
 * combat) et l'état à un instant donné.
 */

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

export interface DungeonSimulation {
  state: DungeonState;
  events: DungeonEvent[];
}
