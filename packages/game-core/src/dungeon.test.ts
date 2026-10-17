import { describe, expect, it } from 'vitest';
import {
  attackDamage,
  attackIntervalMs,
  attackTypeAgainst,
  buildDungeonSetup,
  checkDungeonTeam,
  defaultDungeonMove,
  dungeonAttack,
  dungeonEnemies,
  dungeonStatus,
  effectiveDungeonMove,
  resolveDungeonRun,
  simulateDungeon,
} from './dungeon';
import type { DungeonFighter, DungeonSetup } from './dungeon';
import { member, testContext } from './test-helpers';

const ctx = testContext();
const dracaufeuX = ctx.dungeon('mega-dracaufeu-x')!;
const settings = ctx.balance.dungeons;

const progress = (caught: number[]) => ({
  caughtSpeciesIds: new Set(caught),
  defeatedTrainerIds: new Set<string>(),
  eggsHatched: 0,
});

/** Combattant fictif aux statistiques uniformes. */
function fighter(extra: Partial<DungeonFighter> = {}): DungeonFighter {
  const stat = extra.stats?.attack ?? 100;
  return {
    speciesId: 19,
    formId: null,
    level: 50,
    isShiny: false,
    types: ['normal'],
    stats: {
      hp: 100,
      attack: stat,
      defense: 100,
      'special-attack': 100,
      'special-defense': 100,
      speed: 100,
    },
    maxHp: 100,
    attackType: 'normal',
    category: 'physical',
    ...extra,
  };
}

function setup(team: DungeonFighter[], enemies: DungeonFighter[], timeLimitMs = 60_000) {
  const { attacks, ...rest } = settings;
  return { team, enemies, settings: { ...rest, attacks }, timeLimitMs, seed: 42 } as DungeonSetup;
}

describe('difficulté', () => {
  it('classe les donjons : légendaire, starter, espèce évoluée, espèce seule', () => {
    expect(ctx.dungeon('mega-mewtwo-x')!.difficulty).toBe('extreme');
    expect(dracaufeuX.difficulty).toBe('veryHard');
    expect(ctx.dungeon('mega-leviator')!.difficulty).toBe('hard');
    expect(ctx.dungeon('mega-kangourex')!.difficulty).toBe('easy');
  });

  it('fixe le niveau du boss selon la difficulté', () => {
    expect(ctx.dungeon('mega-kangourex')!.boss.level).toBe(50);
    expect(ctx.dungeon('mega-leviator')!.boss.level).toBe(65);
    expect(dracaufeuX.boss.level).toBe(80);
    expect(ctx.dungeon('mega-mewtwo-x')!.boss.level).toBe(95);
  });

  it('n’a aucun effet sur le combat', () => {
    const extreme = { ...dracaufeuX, difficulty: 'extreme' as const };
    expect(dungeonEnemies(ctx, extreme)).toEqual(dungeonEnemies(ctx, dracaufeuX));
    expect(dungeonEnemies(ctx, dracaufeuX).at(-1)!.level).toBe(dracaufeuX.boss.level);
  });
});

describe('contenu de test', () => {
  it('crée un donjon par Méga-Évolution, avec la lignée du boss', () => {
    expect(dracaufeuX.familySpeciesIds).toEqual([4, 5, 6]);
    expect(dracaufeuX.boss).toMatchObject({ speciesId: 6, formId: 10034 });
    expect(dracaufeuX.opponents.map((o) => o.speciesId)).toEqual([4, 4, 5, 5, 6]);
    expect(ctx.dungeon('mega-dracaufeu-y')).toBeDefined();
    expect(ctx.item(dracaufeuX.gemItemId!)?.category).toBe('megaStone');
    // Seul dans sa lignée : plusieurs fois le même adversaire.
    const kangourex = ctx.dungeon('mega-kangourex')!;
    expect(new Set(kangourex.opponents.map((o) => o.speciesId))).toEqual(new Set([115]));
    // Gardevoir et Gallame : chacun sa lignée directe.
    expect(ctx.dungeon('mega-gallame')!.familySpeciesIds).toEqual([280, 281, 475]);
  });
});

describe('attaques', () => {
  it('choisit par défaut le premier type et la meilleure statistique offensive', () => {
    const dracaufeu = ctx.species(6)!;
    expect(defaultDungeonMove(dracaufeu, member('a', 6, 50))).toEqual({
      type: 'fire',
      category: 'special',
    });
    expect(defaultDungeonMove(ctx.species(68)!, member('b', 68, 50)).category).toBe('physical');
  });

  it('garde le choix enregistré s’il reste valable', () => {
    const dracaufeu = ctx.species(6)!;
    const p = member('a', 6, 50);
    expect(effectiveDungeonMove(dracaufeu, p, { type: 'flying', category: 'physical' })).toEqual({
      type: 'flying',
      category: 'physical',
    });
    // Type perdu (ex. après une évolution) : premier type de l'espèce.
    expect(effectiveDungeonMove(dracaufeu, p, { type: 'water', category: 'physical' }).type).toBe(
      'fire',
    );
  });

  it('attaque plus vite avec plus de Vitesse, linéairement, jusqu’au plancher', () => {
    expect(attackIntervalMs(settings, settings.referenceSpeed)).toBe(settings.baseAttackIntervalMs);
    expect(attackIntervalMs(settings, 200)).toBeLessThan(attackIntervalMs(settings, 100));
    expect(attackIntervalMs(settings, 0)).toBe(settings.maxAttackIntervalMs);
    expect(attackIntervalMs(settings, 10_000)).toBe(settings.minAttackIntervalMs);
    const linear = {
      baseAttackIntervalMs: 2000,
      referenceSpeed: 150,
      minAttackIntervalMs: 100,
      maxAttackIntervalMs: 3000,
    };
    expect(attackIntervalMs(linear, 0)).toBe(3000);
    expect(attackIntervalMs(linear, 75)).toBe(2500);
    expect(attackIntervalMs(linear, 150)).toBe(2000);
    expect(attackIntervalMs(linear, 300)).toBe(1000);
  });

  it('applique efficacité, STAB et immunités', () => {
    const s = setup([], []).settings;
    const water = fighter({ types: ['water'], attackType: 'water' });
    const fire = fighter({ types: ['fire'] });
    const grass = fighter({ types: ['grass'] });
    const ghost = fighter({ types: ['ghost'] });
    const strong = attackDamage(s, water, fire, 'water', 1);
    const weak = attackDamage(s, water, grass, 'water', 1);
    expect(strong.effectiveness).toBe(2);
    expect(weak.effectiveness).toBe(0.5);
    expect(strong.damage).toBeGreaterThan(weak.damage * 3);
    // Une immunité divise les dégâts par 4 au lieu de les annuler.
    const immune = attackDamage(s, fighter(), ghost, 'normal', 1);
    const neutral = attackDamage(s, fighter(), fighter(), 'normal', 1);
    expect(immune.effectiveness).toBe(0.25);
    expect(immune.damage).toBe(Math.max(1, Math.floor(neutral.damage / 4)));
    expect(
      attackDamage(s, fighter(), fighter({ types: ['ghost', 'rock'] }), 'normal', 1).effectiveness,
    ).toBe(0.125);
    // Sans STAB, moins de dégâts.
    const noStab = attackDamage(s, fighter({ types: ['fire'] }), fighter(), 'water', 1);
    const stab = attackDamage(s, water, fighter(), 'water', 1);
    expect(stab.damage).toBeGreaterThan(noStab.damage);
  });

  it('utilise la statistique de la catégorie choisie', () => {
    const s = setup([], []).settings;
    const physical = fighter({ category: 'physical' });
    physical.stats = { ...physical.stats, attack: 200 };
    const special = { ...physical, category: 'special' as const };
    expect(attackDamage(s, physical, fighter(), 'normal', 1).damage).toBeGreaterThan(
      attackDamage(s, special, fighter(), 'normal', 1).damage,
    );
  });

  it('l’adversaire choisit son type le plus efficace', () => {
    const enemy = fighter({ types: ['fire', 'flying'], attackType: null });
    expect(attackTypeAgainst(enemy, fighter({ types: ['grass'] }))).toBe('fire');
    expect(attackTypeAgainst(enemy, fighter({ types: ['fighting'] }))).toBe('flying');
    expect(dungeonAttack(settings, 'fire').name).toBe('Lance-Flammes');
    expect(dungeonAttack({ attacks: {} }, 'fire')).toEqual({ name: 'Attaque Feu', power: 60 });
  });
});

describe('simulation', () => {
  it('est déterministe et se rejoue à l’identique à n’importe quel instant', () => {
    const s = buildDungeonSetup(ctx, dracaufeuX, [{ ...member('a', 9, 60), move: null }], 123);
    const full = simulateDungeon(s, [], null, s.timeLimitMs);
    const again = simulateDungeon(s, [], null, s.timeLimitMs);
    expect(again).toEqual(full);
    expect(full.state.outcome).not.toBeNull();
    const mid = simulateDungeon(s, [], null, 5_000);
    expect(mid.events).toEqual(full.events.filter((e) => e.atMs <= 5_000));
  });

  it('gagne quand le boss tombe', () => {
    const strong = fighter({ maxHp: 10_000, stats: { ...fighter().stats, attack: 1000 } });
    const { state, events } = simulateDungeon(
      setup([strong], [fighter(), fighter({ maxHp: 300 })]),
      [],
      null,
      60_000,
    );
    expect(state.outcome).toBe('win');
    expect(state.defeated).toBe(2);
    expect(events.some((e) => e.kind === 'enemy' && e.index === 1)).toBe(true);
  });

  it('fait entrer le suivant après un K.O., et perd quand toute l’équipe est K.O.', () => {
    const weak = () => fighter({ maxHp: 1 });
    const boss = fighter({ maxHp: 100_000, stats: { ...fighter().stats, speed: 1000 } });
    const { state, events } = simulateDungeon(setup([weak(), weak()], [boss]), [], null, 60_000);
    expect(events.some((e) => e.kind === 'switch' && e.auto && e.member === 1)).toBe(true);
    expect(state.outcome).toBe('loss');
    expect(state.hp).toEqual([0, 0]);
  });

  it('perd à la fin du temps imparti, ou en fuyant', () => {
    const tank = fighter({ maxHp: 1_000_000 });
    const s = setup([tank], [fighter({ maxHp: 1_000_000 })], 10_000);
    expect(simulateDungeon(s, [], null, 60_000).state).toMatchObject({
      outcome: 'timeout',
      endedAtMs: 10_000,
    });
    expect(simulateDungeon(s, [], 3_000, 60_000).state).toMatchObject({
      outcome: 'fled',
      endedAtMs: 3_000,
    });
    // Avant la fin : combat en cours.
    expect(simulateDungeon(s, [], null, 5_000).state.outcome).toBeNull();
  });

  it('change de Pokémon à la demande et remet son délai d’attaque à zéro', () => {
    const s = setup([fighter(), fighter()], [fighter({ maxHp: 1_000_000 })]);
    const interval = attackIntervalMs(s.settings, 100);
    const { state, events } = simulateDungeon(s, [{ atMs: 1500, member: 1 }], null, 1600);
    expect(state.active).toBe(1);
    expect(state.nextPlayerAttackAt).toBe(1500 + interval);
    expect(events).toContainEqual({ kind: 'switch', atMs: 1500, member: 1, auto: false });
    // Pokémon K.O. ou déjà actif : commande ignorée.
    const ignored = simulateDungeon(s, [{ atMs: 100, member: 0 }], null, 200);
    expect(ignored.events.filter((e) => e.kind === 'switch')).toEqual([]);
  });
});

describe('accès et équipe', () => {
  it('cache le donjon tant qu’aucune espèce de la lignée n’est capturée', () => {
    expect(dungeonStatus(ctx, dracaufeuX, progress([1]), undefined, 0).state).toBe('hidden');
    expect(dungeonStatus(ctx, dracaufeuX, progress([4]), undefined, 0)).toEqual({
      state: 'locked',
      missingSpeciesIds: [5, 6],
      conditionMet: true,
    });
    expect(dungeonStatus(ctx, dracaufeuX, progress([4, 5, 6]), undefined, 0).state).toBe(
      'available',
    );
  });

  it('applique le temps de recharge après une tentative', () => {
    const now = Date.parse('2026-10-14T12:00:00Z');
    const status = dungeonStatus(
      ctx,
      dracaufeuX,
      progress([4, 5, 6]),
      { lastEndedAt: new Date(now) },
      now,
    );
    expect(status.state).toBe('cooldown');
  });

  it('vérifie la taille, la région et les attaques de l’équipe', () => {
    const team = [member('a', 7, 50)];
    expect(checkDungeonTeam(ctx, dracaufeuX, team)).toEqual([]);
    expect(checkDungeonTeam(ctx, dracaufeuX, [])).toEqual([{ code: 'TEAM_EMPTY' }]);
    expect(checkDungeonTeam(ctx, dracaufeuX, [member('b', 158, 50)])[0]?.code).toBe('WRONG_REGION');
    expect(
      checkDungeonTeam(ctx, dracaufeuX, [
        { ...member('a', 7, 50), move: { type: 'fire', category: 'special' } },
      ]),
    ).toEqual([{ code: 'INVALID_MOVE' }]);
  });
});

describe('résultat', () => {
  const team = [member('a', 9, 100), member('b', 3, 100)];
  const run = (fledAtMs: number | null, seed: number) => {
    const s = buildDungeonSetup(
      ctx,
      dracaufeuX,
      team.map((m) => ({ ...m, move: null })),
      seed,
    );
    return resolveDungeonRun(ctx, { dungeon: dracaufeuX, setup: s, commands: [], fledAtMs, team });
  };

  it('donne argent, XP et parfois la Méga-Gemme en cas de victoire', () => {
    const results = Array.from({ length: 60 }, (_, i) => run(null, i));
    const wins = results.filter((r) => r.outcome === 'win');
    expect(wins.length).toBeGreaterThan(0);
    for (const r of wins) {
      expect(r.money).toBe(dracaufeuX.money);
      expect(r.xpPerMember).toBeGreaterThan(0);
      expect(r.gemItemId === null).toBe(r.gemRoll! >= dracaufeuX.gemChance);
    }
  });

  it('ne donne rien en cas de fuite', () => {
    const r = run(0, 1);
    expect(r).toMatchObject({ outcome: 'fled', money: 0, xpPerMember: 0, gemItemId: null });
    expect(r.team.every((m) => m.xpGained === 0)).toBe(true);
  });
});
