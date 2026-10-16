import { describe, expect, it } from 'vitest';
import type { GameAbility } from '@poke/content';
import { attackDamage, buildDungeonSetup, simulateDungeon } from './dungeon';
import type { DungeonFighter, DungeonSetup, DungeonTraits } from './dungeon';
import { member, testContext } from './test-helpers';

const ctx = testContext();
const settings = ctx.balance.dungeons;

const NO_TRAITS: DungeonTraits = {
  damage: [],
  stabPercent: 0,
  immunities: [],
  sturdy: false,
  regenerator: 0,
  speedBoost: 0,
  moxie: 0,
  intimidate: 0,
  contactDamage: 0,
  aftermath: 0,
};

function fighter(extra: Partial<DungeonFighter> = {}, traits: Partial<DungeonTraits> = {}) {
  return {
    speciesId: 19,
    formId: null,
    level: 50,
    isShiny: false,
    types: ['normal'],
    stats: {
      hp: 100,
      attack: 100,
      defense: 100,
      'special-attack': 100,
      'special-defense': 100,
      speed: 100,
    },
    maxHp: 100,
    attackType: 'normal',
    category: 'physical',
    ability: 'test',
    traits: { ...NO_TRAITS, ...traits },
    ...extra,
  } satisfies DungeonFighter;
}

function setup(team: DungeonFighter[], enemies: DungeonFighter[], timeLimitMs = 60_000) {
  const { attacks, ...rest } = settings;
  return { team, enemies, settings: { ...rest, attacks }, timeLimitMs, seed: 42 } as DungeonSetup;
}

const attacksOf = (s: DungeonSetup, until = 60_000) =>
  simulateDungeon(s, [], null, until).events.filter((e) => e.kind === 'attack');

describe('talents en donjon : dégâts', () => {
  const s = setup([fighter()], [fighter()]).settings;

  it('modifie les dégâts selon le type d’attaque et les PV', () => {
    const plain = attackDamage(s, fighter(), fighter(), 'normal', 0.5).damage;
    const blaze = fighter(
      {},
      { damage: [{ dir: 'dealt', percent: 50, attackTypes: ['normal'], hpBelow: 1 / 3 }] },
    );
    expect(attackDamage(s, blaze, fighter(), 'normal', 0.5, { attackerHpFraction: 1 }).damage).toBe(
      plain,
    );
    expect(
      attackDamage(s, blaze, fighter(), 'normal', 0.5, { attackerHpFraction: 0.3 }).damage,
    ).toBeGreaterThan(plain);
    const thickFat = fighter(
      {},
      { damage: [{ dir: 'taken', percent: -50, attackTypes: ['fire'] }] },
    );
    expect(attackDamage(s, fighter(), thickFat, 'normal', 0.5).damage).toBe(plain);
    expect(attackDamage(s, fighter(), thickFat, 'fire', 0.5).damage).toBeLessThan(
      attackDamage(s, fighter(), fighter(), 'fire', 0.5).damage,
    );
  });

  it('renforce le bonus de même type (Adaptabilité)', () => {
    const plain = attackDamage(s, fighter(), fighter(), 'normal', 0.5).damage;
    const adapt = attackDamage(
      s,
      fighter({}, { stabPercent: 33 }),
      fighter(),
      'normal',
      0.5,
    ).damage;
    expect(adapt).toBeGreaterThan(plain);
  });
});

describe('talents en donjon : mécaniques', () => {
  it('absorbe les attaques d’un type et se soigne', () => {
    const levitate = fighter({}, { immunities: [{ type: 'normal', heal: 0.25 }] });
    const events = simulateDungeon(setup([levitate], [fighter()], 10_000), [], null, 10_000).events;
    const hits = events.filter((e) => e.kind === 'attack' && e.side === 'enemy');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((e) => e.kind === 'attack' && e.damage === 0)).toBe(true);
    expect(events.some((e) => e.kind === 'ability' && e.effect === 'immunity')).toBe(true);
  });

  it('Fermeté : survit une fois à 1 PV à un coup fatal', () => {
    const strong = fighter({ stats: { ...fighter().stats, attack: 2000 } });
    const sturdy = fighter({}, { sturdy: true });
    const sim = simulateDungeon(setup([sturdy], [strong]), [], null, 60_000);
    const enemyHits = sim.events.filter((e) => e.kind === 'attack' && e.side === 'enemy');
    expect(enemyHits[0]).toMatchObject({ damage: 99, ko: false });
    expect(enemyHits[1]).toMatchObject({ ko: true });
    expect(sim.events.some((e) => e.kind === 'ability' && e.effect === 'sturdy')).toBe(true);
  });

  it('Intimidation baisse les dégâts du Pokémon en face dès son entrée', () => {
    const plain = attacksOf(setup([fighter()], [fighter()])).find((e) => e.side === 'enemy')!;
    const scary = attacksOf(setup([fighter({}, { intimidate: 50 })], [fighter()])).find(
      (e) => e.side === 'enemy',
    )!;
    expect(scary.damage).toBeLessThan(plain.damage);
  });

  it('Peau Dure blesse l’attaquant physique, jusqu’au K.O.', () => {
    const spiky = fighter({ maxHp: 10_000 }, { contactDamage: 0.5 });
    const sim = simulateDungeon(setup([fighter()], [spiky]), [], null, 60_000);
    expect(sim.state.outcome).toBe('loss');
    expect(
      sim.events.filter((e) => e.kind === 'ability' && e.effect === 'contactDamage'),
    ).toHaveLength(2);
  });

  it('Impudence augmente l’Attaque après chaque K.O.', () => {
    const weak = () => fighter({ maxHp: 1 });
    const sim = simulateDungeon(
      setup([fighter({}, { moxie: 50 })], [weak(), weak(), fighter()]),
      [],
      null,
      60_000,
    );
    expect(sim.events.filter((e) => e.kind === 'ability' && e.effect === 'moxie')).toHaveLength(
      sim.state.defeated,
    );
    expect(sim.state.defeated).toBeGreaterThanOrEqual(2);
  });

  it('Régé-Force soigne le Pokémon rappelé', () => {
    const regen = fighter({}, { regenerator: 0.5 });
    const s = setup([regen, fighter()], [fighter()]);
    const firstHit = attacksOf(s).find((e) => e.side === 'enemy')!;
    const sim = simulateDungeon(
      s,
      [{ atMs: firstHit.atMs + 1, member: 1 }],
      null,
      firstHit.atMs + 2,
    );
    expect(sim.state.hp[0]).toBe(100);
    expect(sim.events.some((e) => e.kind === 'ability' && e.effect === 'regenerator')).toBe(true);
  });

  it('sans talent, le combat est inchangé', () => {
    const plain = (f: Partial<DungeonFighter> = {}) => {
      const { traits: _t, ability: _a, ...rest } = fighter(f);
      return rest;
    };
    expect(simulateDungeon(setup([plain()], [plain()]), [], null, 60_000)).toEqual(
      simulateDungeon(setup([fighter()], [fighter()]), [], null, 60_000),
    );
  });
});

describe('talents en donjon : mise en place', () => {
  const ABILITIES: GameAbility[] = [
    {
      id: 'huge-power',
      description: '',
      effects: [{ type: 'modifier', param: 'attack', value: 100, scope: 'self', conditions: [] }],
    },
    {
      id: 'levitate',
      description: '',
      effects: [{ type: 'immunity', attackType: 'ground', heal: 0, conditions: [] }],
    },
    {
      id: 'blaze',
      description: '',
      effects: [
        {
          type: 'modifier',
          param: 'damageDealt',
          value: 50,
          scope: 'self',
          conditions: [
            { type: 'attackType', types: ['fire'] },
            { type: 'hpBelow', fraction: 1 / 3 },
          ],
        },
      ],
    },
  ];
  const dungeon = ctx.dungeon('mega-dracaufeu-x')!;

  it('applique statistiques et traits aux Pokémon de l’équipe', () => {
    const withAbilities = testContext((c) => {
      c.abilities = ABILITIES;
    });
    const team = [
      { ...member('a', 183, 50, { ability: 'huge-power' }), move: null },
      { ...member('b', 6, 50, { ability: 'blaze' }), move: null },
    ];
    const plain = buildDungeonSetup(ctx, dungeon, team, 1);
    const boosted = buildDungeonSetup(withAbilities, dungeon, team, 1);
    expect(boosted.team[0]!.stats.attack).toBe(plain.team[0]!.stats.attack * 2);
    expect(boosted.team[1]!.traits?.damage).toEqual([
      { dir: 'dealt', percent: 50, attackTypes: ['fire'], hpBelow: 1 / 3 },
    ]);
    expect(boosted.team[1]!.ability).toBe('blaze');
    // Sans talent réglé : pas de traits.
    expect(plain.team[0]!.traits).toBeUndefined();
  });

  it('donne leur talent aux adversaires si l’équilibrage l’active', () => {
    const on = testContext((c) => {
      c.abilities = ABILITIES;
      c.balance.dungeons.enemyAbilities = true;
    });
    const team = [{ ...member('a', 6, 50), move: null }];
    expect(buildDungeonSetup(on, dungeon, team, 1).enemies.at(-1)!.ability).toBe('tough-claws');
    expect(buildDungeonSetup(ctx, dungeon, team, 1).enemies.at(-1)!.ability).toBeUndefined();
  });
});
