import type { CombatSettings, DungeonStat, Status, Weather } from '@poke/content';
import type { Stats } from '@poke/data';
import type { MoveCategory } from './moves';

/**
 * Ce qui décrit un combat : les combattants et leurs talents déjà traduits en effets, les
 * réglages, la mise en place figée au départ, les commandes du joueur.
 */

/** Modificateur de dégâts d'un talent, évalué à chaque attaque (conditions de l'instant). */
export interface DamageModifier {
  /** `dealt` : dégâts infligés par le Pokémon ; `taken` : dégâts qu'il reçoit. */
  dir: 'dealt' | 'taken';
  percent: number;
  /** Types de l'attaque concernée ; absent = toutes. */
  attackTypes?: string[];
  /** Catégorie de l'attaque concernée ; absent = les deux. */
  category?: MoveCategory;
  /** Types du Pokémon en face ; absent = tous. */
  opponentTypes?: string[];
  /** PV du Pokémon au plus à cette fraction de ses PV max. */
  hpBelow?: number;
  /** PV du Pokémon au maximum. */
  fullHp?: boolean;
  /** Le Pokémon a un statut (Cran). */
  statused?: boolean;
  /** L'attaque est super efficace (Filtre, Ceinture Pro). */
  superEffective?: boolean;
  /** L'attaque est peu efficace (Lentille Teintée). */
  notVeryEffective?: boolean;
  /** Bonus d'un coéquipier : index du porteur dans son camp, actif tant qu'il n'est pas K.O. */
  from?: number;
}

/**
 * Statistique (ou STAB, chance de critique) modifiée en continu : selon l'état du Pokémon
 * (Vitesse à PV max…) ou tant que le coéquipier qui donne le bonus n'est pas K.O.
 */
export interface StatModifier {
  stat: DungeonStat | 'stab' | 'critChance';
  percent: number;
  /** PV du Pokémon au plus à cette fraction de ses PV max. */
  hpBelow?: number;
  /** PV du Pokémon au maximum. */
  fullHp?: boolean;
  /** Le Pokémon a un statut. */
  statused?: boolean;
  /** Bonus d'un coéquipier : index du porteur dans son camp, actif tant qu'il n'est pas K.O. */
  from?: number;
}

/** Porteurs encore debout dans un camp (bonus d'équipe) ; absent = tous. */
export type HolderUp = (index: number) => boolean;

/** Talents d'un combattant, figés au départ (voir les briques « donjon » des talents). */
export interface DungeonTraits {
  damage: DamageModifier[];
  /** Statistiques selon l'état du Pokémon. Absent des tentatives antérieures. */
  stats?: StatModifier[];
  /** Bonus de même type (STAB), en %. */
  stabPercent: number;
  immunities: { type: string; heal: number }[];
  sturdy: boolean;
  /** Fraction des PV max soignée quand le joueur le rappelle. */
  regenerator: number;
  /** % de Vitesse gagné après chaque attaque. */
  speedBoost: number;
  /** % d'Attaque gagné après chaque K.O. infligé. */
  moxie: number;
  /** % d'Attaque et d'Attaque Spéciale retiré au Pokémon en face, à l'entrée (tentatives antérieures). */
  intimidate: number;
  /** % retiré à chaque statistique du Pokémon en face, à l'entrée ; absent = `intimidate`. */
  intimidateStats?: Partial<Record<DungeonStat, number>>;
  /** Fraction des PV max de l'attaquant perdue à chaque attaque physique reçue. */
  contactDamage: number;
  /** Fraction des PV max de l'attaquant infligée quand il le met K.O. d'une attaque physique. */
  aftermath: number;
  /** Statuts infligés (Statik, Point Poison…). Absents des tentatives antérieures. */
  inflict?: { status: Status; chance: number; trigger: 'contact' | 'attack' }[];
  statusImmunities?: Status[];
  /** Statuts dont un coéquipier protège, tant qu'il n'est pas K.O. (Voile Pastel). */
  teamStatusImmunities?: { status: Status; from: number }[];
  naturalCure?: boolean;
  weatherImmunity?: boolean;
  /** % ajouté à sa chance de coup critique (Super Chance). Absent des tentatives antérieures. */
  critPercent?: number;
  /** Ne subit jamais de coup critique (Armurbaston). */
  critImmunity?: boolean;
  /** Tant qu'il est sur le terrain, le talent du Pokémon en face ne joue plus (Gaz Inhibiteur). */
  suppressAbility?: boolean;
}

/** Un combattant, figé au départ du donjon. */
export interface DungeonFighter {
  speciesId: number;
  formId: number | null;
  level: number;
  isShiny: boolean;
  types: string[];
  stats: Stats;
  maxHp: number;
  /**
   * PV sur lesquels se calculent les pertes et soins en part de ses PV max (météo, brûlure,
   * poison, Peau Dure, Boom Final, absorption) : ceux d'avant le renfort d'un boss, pour que ses PV
   * multipliés ne multiplient pas aussi ces pertes. Absent = PV max (combats antérieurs compris).
   */
  percentHp?: number;
  /** Type de l'attaque ; null = adversaire, qui choisit son meilleur type contre le Pokémon en face. */
  attackType: string | null;
  category: MoveCategory;
  /** Talent en vigueur (nom PokéAPI) ; absent = sans talent (tentatives antérieures). */
  ability?: string | null;
  /**
   * Déchaînement (légendaire) : la première fois que ses PV passent sous `hpFraction` de ses PV
   * max, ses statistiques hors PV gagnent `percent` % jusqu'à la fin du combat. Ce n'est pas un
   * talent : rien ne le neutralise. Absent = jamais.
   */
  enrage?: { hpFraction: number; percent: number };
  /** Effets de talent en donjon ; absent = aucun. */
  traits?: DungeonTraits;
  /** Statistiques sans ses propres talents (talent neutralisé) ; absent = `stats`. */
  baseStats?: Stats;
  /**
   * Bonus exact de ses talents sur chaque statistique, en % (Coloforce : +50), pour l'affichage :
   * `stats` est arrondi (9 × 1,5 → 14), le rapport des deux afficherait +56 %. Absent des
   * combats lancés avant : rapport de `stats` et `baseStats`.
   */
  abilityStatPercents?: Partial<Record<DungeonStat, number>>;
}

/** Réglages de combat figés au départ (une modification de l'équilibrage n'affecte pas un combat en cours). */
export type DungeonCombatSettings = Pick<
  CombatSettings,
  | 'baseAttackIntervalMs'
  | 'referenceSpeed'
  | 'minAttackIntervalMs'
  | 'maxAttackIntervalMs'
  | 'damageMultiplier'
  | 'stabMultiplier'
  | 'minDamageRoll'
  | 'attacks'
> &
  /** Coups critiques : absents des tentatives antérieures (aucun critique, aucun tirage). */
  Partial<Pick<CombatSettings, 'critChance' | 'critMultiplier'>> & {
    /** Délai avant qu'un Pokémon rappelé puisse revenir ; absent (tentatives antérieures) = aucun. */
    recallCooldownMs?: number;
    /**
     * Pertes de la météo (sable, grêle), de la brûlure et du poison : toutes les `chipTickMs` ms,
     * pour les deux Pokémon en face, quelle que soit leur vitesse. Absent (tentatives
     * antérieures) = à la fin de chacune de ses attaques.
     */
    chipTickMs?: number;
  };

export interface DungeonSetup {
  /** Équipe du joueur, dans l'ordre choisi (le premier entre en combat). */
  team: DungeonFighter[];
  /** Adversaires dans l'ordre, le boss en dernier. */
  enemies: DungeonFighter[];
  settings: DungeonCombatSettings;
  timeLimitMs: number;
  seed: number;
  /** Heure locale du joueur au départ (talents de jour ou de nuit) ; absente = inconnue. */
  hour?: number | null;
  /** Météo du combat (celle du donjon, ou imposée par un talent) ; absente = temps clair. */
  weather?: Weather | null;
  /**
   * Météo du lieu, avant les talents (null = temps clair) ; absente = inconnue (combats
   * antérieurs). Seulement pour l'affichage : le combat se joue tout entier sous `weather`.
   */
  placeWeather?: Weather | null;
}

/**
 * Action du joueur, `atMs` après le départ : changement de Pokémon actif, ou objet de soin
 * (Baie Sitrus) donné au Pokémon actif.
 */
export type DungeonCommand =
  | {
      atMs: number;
      /** Index du Pokémon dans l'équipe. */
      member: number;
    }
  | {
      atMs: number;
      itemId: string;
      /** Part des PV max du Pokémon actif rendue (fixée au moment de l'utilisation). */
      heal: number;
    };

export const isHealCommand = (c: DungeonCommand): c is Extract<DungeonCommand, { heal: number }> =>
  'heal' in c;

/** Instant à partir duquel l'objet de soin peut resservir (0 = jamais utilisé). */
export function healReadyAt(
  commands: readonly DungeonCommand[],
  itemId: string,
  cooldownMs: number,
): number {
  const last = commands.findLast((c) => isHealCommand(c) && c.itemId === itemId);
  return last ? last.atMs + cooldownMs : 0;
}
