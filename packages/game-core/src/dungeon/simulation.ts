import { Combat, other } from './combat';
import type { Side } from './combat';
import { attackDamage, attackTypeAgainst, stateStatMultiplier } from './rules';
import type { DungeonSimulation } from './state';
import { MAX_SPEED_BOOST, hpShare } from './status';
import { statModifierPercent } from './traits';
import { isHealCommand } from './types';
import type { DungeonCommand, DungeonSetup } from './types';

/**
 * Déroulement d'un combat : une ligne de temps où quatre choses arrivent, chacune à son instant.
 *
 *  1. une **commande** du joueur (changer de Pokémon, donner une baie) ;
 *  2. un **tic** de pertes à intervalle fixe (brûlure, poison, météo), si `chipTickMs` est réglé ;
 *  3. l'**attaque du joueur** ;
 *  4. l'**attaque de l'adversaire**.
 *
 * À instant égal, elles passent dans cet ordre. Chaque camp attaque à sa cadence
 * (`attackIntervalMs`, selon sa Vitesse) ; le combat s'arrête à la victoire, à la défaite, à la
 * fuite ou au bout du temps imparti.
 *
 * Les tirages au sort ne se font que pendant une attaque, toujours dans le même ordre (jet de
 * dégâts, critique, statuts de l'attaquant, statuts de contact) : c'est ce qui permet au serveur
 * et au navigateur de rejouer le même combat. Changer cet ordre change tous les combats
 * enregistrés (`golden.test.ts` le signale).
 */

/** Ce qu'une attaque a fait, pour l'événement et pour les talents qui se déclenchent ensuite. */
interface Hit {
  attackType: string;
  damage: number;
  /** Multiplicateur des types ; 0 quand l'attaque est absorbée par une immunité. */
  effectiveness: number;
  critical: boolean;
}

/** Commande du joueur : une baie de soin, ou un changement de Pokémon (ignoré s'il est invalide). */
function applyCommand(c: Combat, command: DungeonCommand): void {
  if (isHealCommand(command)) {
    const max = c.team[c.active]!.maxHp;
    const before = c.hp[c.active]!;
    if (before > 0 && before < max) {
      c.hp[c.active] = Math.min(max, before + Math.max(1, Math.round(command.heal * max)));
      c.events.push({
        kind: 'item',
        atMs: c.t,
        member: c.active,
        itemId: command.itemId,
        amount: c.hp[c.active]! - before,
      });
    }
    return;
  }
  const { member } = command;
  const valid =
    member !== c.active &&
    member >= 0 &&
    member < c.team.length &&
    c.hp[member]! > 0 &&
    c.recallReadyAt[member]! <= c.t;
  if (!valid) return;

  // Talents du Pokémon qui sort : Régé-Force (soin), Médic Nature (statut guéri).
  const leaving = c.fighterOf('player');
  const leavingMods = c.mods[c.active]!;
  const regen = hpShare(leaving, leaving.traits?.regenerator ?? 0);
  if (regen > 0 && c.hp[c.active]! < leaving.maxHp) {
    const healed = Math.min(leaving.maxHp, c.hp[c.active]! + regen) - c.hp[c.active]!;
    c.hp[c.active] = c.hp[c.active]! + healed;
    c.trigger('player', 'regenerator', healed);
  }
  if (leaving.traits?.naturalCure && leavingMods.status) {
    leavingMods.status = null;
    leavingMods.statusTurns = 0;
    c.trigger('player', 'naturalCure', 0);
  }
  c.recallReadyAt[c.active] = c.t + (c.settings.recallCooldownMs ?? 0);
  c.switchTo(member, false);
}

/** Tic de pertes à intervalle fixe (météo, brûlure, poison) : l'adversaire tombe d'abord. */
function chipTick(c: Combat): void {
  for (const side of ['enemy', 'player'] as const) {
    const lost = c.chipLoss(side);
    if (lost > 0) c.lose(side, lost);
  }
  c.checkEnrage();
  if (c.enemyHp === 0 && c.down('enemy')) return;
  if (c.hp[c.active] === 0) c.down('player');
}

/**
 * Endormi ou gelé : le Pokémon saute son attaque (sans tirage), puis se réveille ou dégèle.
 * Renvoie vrai si l'attaque est sautée.
 */
function skipTurn(c: Combat, side: Side): boolean {
  const mods = c.modsOf(side);
  if (mods.statusTurns <= 0) return false;
  mods.statusTurns--;
  c.statusEvent(side, mods.status, 'skipped');
  if (mods.statusTurns === 0) {
    c.statusEvent(side, mods.status, 'cured');
    mods.status = null;
  }
  c.schedule(side);
  return true;
}

/**
 * Le coup lui-même : type choisi, immunité (qui soigne au lieu de blesser), critique, dégâts,
 * Fermeté. Retire les PV du défenseur.
 */
function strike(c: Combat, side: Side): Hit {
  const target = other(side);
  const attacker = c.fighterOf(side);
  const defender = c.fighterOf(target);
  const attackerMods = c.modsOf(side);
  const targetMods = c.modsOf(target);

  const roll = c.rng.next();
  const attackType = attackTypeAgainst(attacker, defender);
  const before = c.hpOf(target);
  const immunity = defender.traits?.immunities.find((i) => i.type === attackType);
  if (immunity) {
    const healed = Math.min(defender.maxHp, before + hpShare(defender, immunity.heal));
    c.setHp(target, healed);
    c.trigger(target, 'immunity', healed - before);
    return { attackType, damage: 0, effectiveness: 0, critical: false };
  }

  // Sans chance de critique (tentatives antérieures), aucun tirage : la suite est inchangée.
  // Le tirage a lieu même contre un Pokémon insensible aux critiques (Armurbaston).
  const attackerUp = c.upOf(side);
  const defenderUp = c.upOf(target);
  const attackerHpFraction = c.hpOf(side) / attacker.maxHp;
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
    Math.max(0, (c.settings.critChance ?? 0) * (1 + critPercent / 100)),
  );
  const critical = critChance > 0 && c.rng.chance(critChance) && !defender.traits?.critImmunity;
  const special = attacker.category === 'special';
  const attackStat = special ? 'special-attack' : 'attack';
  const defenseStat = special ? 'special-defense' : 'defense';
  const result = attackDamage(c.settings, attacker, defender, attackType, roll, {
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
    weather: c.weather,
    critical,
  });
  let { damage } = result;
  // Fermeté : à pleins PV, un coup fatal laisse 1 PV, une fois par combat.
  if (
    defender.traits?.sturdy &&
    !targetMods.sturdyUsed &&
    before === defender.maxHp &&
    before > 1 &&
    damage >= before
  ) {
    damage = before - 1;
    targetMods.sturdyUsed = true;
    c.trigger(target, 'sturdy', 0);
  }
  c.setHp(target, Math.max(0, before - damage));
  return { attackType, damage, effectiveness: result.effectiveness, critical };
}

/**
 * Talents après l'attaque : Turbo, Impudence, statuts infligés, dégâts de contact et explosion
 * finale, puis brûlure, poison et météo de l'attaquant. Renvoie les PV que l'attaquant y perd.
 */
function afterAttack(c: Combat, side: Side, damage: number, ko: boolean): number {
  const target = other(side);
  const attacker = c.fighterOf(side);
  const defender = c.fighterOf(target);
  const attackerMods = c.modsOf(side);

  if (attacker.traits?.speedBoost) {
    attackerMods.stats.speed = Math.min(
      MAX_SPEED_BOOST,
      attackerMods.stats.speed * (1 + attacker.traits.speedBoost / 100),
    );
  }
  if (ko && attacker.traits?.moxie) {
    attackerMods.stats.attack *= 1 + attacker.traits.moxie / 100;
    attackerMods.stats['special-attack'] *= 1 + attacker.traits.moxie / 100;
    c.trigger(side, 'moxie', attacker.traits.moxie);
  }
  const physical = attacker.category === 'physical';
  if (damage > 0 && !ko) {
    for (const s of attacker.traits?.inflict ?? []) {
      if (s.trigger === 'attack' && c.rng.chance(s.chance)) c.inflict(target, s.status);
    }
  }
  let recoil = 0;
  if (physical && damage > 0) {
    for (const s of defender.traits?.inflict ?? []) {
      if (s.trigger === 'contact' && c.rng.chance(s.chance)) c.inflict(side, s.status);
    }
    if (defender.traits?.contactDamage) {
      const lost = Math.max(1, hpShare(attacker, defender.traits.contactDamage));
      recoil += lost;
      c.trigger(target, 'contactDamage', lost);
    }
  }
  if (physical && ko && defender.traits?.aftermath) {
    const lost = Math.max(1, hpShare(attacker, defender.traits.aftermath));
    recoil += lost;
    c.trigger(target, 'aftermath', lost);
  }
  // Fin de son attaque : brûlure, poison et météo (sauf pertes à intervalle fixe).
  if (!c.settings.chipTickMs) recoil += c.chipLoss(side);
  return recoil;
}

/** Attaque du Pokémon actif d'un camp, avec tout ce qu'elle déclenche. */
function attackTurn(c: Combat, side: Side): void {
  if (skipTurn(c, side)) return;
  const target = other(side);

  const hit = strike(c, side);
  const ko = c.hpOf(target) === 0;
  c.events.push({
    kind: 'attack',
    atMs: c.t,
    side,
    attacker: c.indexOf(side),
    defender: c.indexOf(target),
    attackType: hit.attackType,
    damage: hit.damage,
    effectiveness: hit.effectiveness,
    ...(hit.critical && { critical: hit.critical }),
    ko,
  });
  c.schedule(side);

  const recoil = afterAttack(c, side, hit.damage, ko);
  if (recoil > 0) c.lose(side, recoil);
  const attackerKo = recoil > 0 && c.hpOf(side) === 0;

  c.checkEnrage();
  // Le défenseur tombe d'abord (un boss vaincu est une victoire), puis l'attaquant.
  if (ko && c.down(target)) return;
  if (attackerKo) c.down(side);
}

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
  const combat = new Combat(setup);
  const queue = [...commands].sort((a, b) => a.atMs - b.atMs);
  const stopAt = Math.min(fledAtMs ?? Infinity, setup.timeLimitMs);
  const chipTickMs = setup.settings.chipTickMs ?? 0;
  let nextTick = chipTickMs > 0 ? chipTickMs : Infinity;
  let handled = 0;

  while (combat.outcome === null) {
    const nextCommand = handled < queue.length ? queue[handled]!.atMs : Infinity;
    const next = Math.min(nextCommand, combat.nextPlayer, combat.nextEnemy, nextTick);
    if (next > stopAt || next > untilMs) {
      // Rien d'autre n'arrive avant la fin demandée : fuite, temps écoulé, ou combat en cours.
      if (stopAt <= untilMs) {
        const fled = fledAtMs !== null && fledAtMs <= setup.timeLimitMs;
        combat.end(fled ? 'fled' : 'timeout', stopAt);
      } else {
        combat.t = untilMs;
      }
      break;
    }
    combat.t = next;

    if (nextCommand === next) {
      applyCommand(combat, queue[handled++]!);
    } else if (nextTick === next && nextTick < Math.min(combat.nextPlayer, combat.nextEnemy)) {
      nextTick += chipTickMs;
      chipTick(combat);
    } else {
      attackTurn(combat, combat.nextPlayer <= combat.nextEnemy ? 'player' : 'enemy');
    }
  }

  return { state: combat.state(), events: combat.events };
}
