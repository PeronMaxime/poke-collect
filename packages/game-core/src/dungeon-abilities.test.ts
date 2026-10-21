import { describe, expect, it } from 'vitest';
import type { GameAbility } from '@poke/content';
import { attackDamage, buildDungeonSetup, dungeonStatChanges, simulateDungeon } from './dungeon';
import type { DungeonFighter, DungeonSetup, DungeonTraits } from './dungeon';
import { member, testContext } from './test-helpers';

const ctx = testContext();
const settings = ctx.balance.combat;

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

  it('ne joue que sur les attaques super efficaces (Filtre)', () => {
    const filter = fighter({}, { damage: [{ dir: 'taken', percent: -50, superEffective: true }] });
    expect(attackDamage(s, fighter(), filter, 'normal', 0.5).damage).toBe(
      attackDamage(s, fighter(), fighter(), 'normal', 0.5).damage,
    );
    const rock = { types: ['rock'] };
    expect(
      attackDamage(s, fighter(), fighter(rock, filter.traits), 'water', 0.5).damage,
    ).toBeLessThan(attackDamage(s, fighter(), fighter(rock), 'water', 0.5).damage);
  });

  it('ne joue que sur les attaques de la catégorie choisie (Écaille Spéciale)', () => {
    const scale = fighter({}, { damage: [{ dir: 'taken', percent: -50, category: 'special' }] });
    expect(attackDamage(s, fighter(), scale, 'normal', 0.5).damage).toBe(
      attackDamage(s, fighter(), fighter(), 'normal', 0.5).damage,
    );
    const special = { category: 'special' as const };
    expect(attackDamage(s, fighter(special), scale, 'normal', 0.5).damage).toBeLessThan(
      attackDamage(s, fighter(special), fighter(), 'normal', 0.5).damage,
    );
  });

  it('ne joue que sur les attaques peu efficaces (Lentille Teintée)', () => {
    const tinted = fighter(
      {},
      { damage: [{ dir: 'dealt', percent: 100, notVeryEffective: true }] },
    );
    expect(attackDamage(s, tinted, fighter(), 'normal', 0.5).damage).toBe(
      attackDamage(s, fighter(), fighter(), 'normal', 0.5).damage,
    );
    const rock = { types: ['rock'] };
    expect(attackDamage(s, tinted, fighter(rock), 'fire', 0.5).damage).toBeGreaterThan(
      attackDamage(s, fighter(), fighter(rock), 'fire', 0.5).damage,
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

  it('Intimidation ne baisse que les statistiques choisies', () => {
    const firstEnemyHit = (traits: Partial<DungeonTraits>) =>
      attacksOf(setup([fighter({}, traits)], [fighter()])).find((e) => e.side === 'enemy')!;
    const firstPlayerHit = (traits: Partial<DungeonTraits>) =>
      attacksOf(setup([fighter({}, traits)], [fighter()])).find((e) => e.side === 'player')!;
    const plain = firstEnemyHit({});
    // Attaque Spéciale baissée : sans effet sur un attaquant physique.
    expect(firstEnemyHit({ intimidateStats: { 'special-attack': 50 } }).damage).toBe(plain.damage);
    // Défense baissée : le Pokémon qui intimide frappe plus fort.
    expect(firstPlayerHit({ intimidateStats: { defense: 50 } }).damage).toBeGreaterThan(
      firstPlayerHit({}).damage,
    );
    // Vitesse baissée : le Pokémon en face attaque moins souvent (dès sa deuxième attaque).
    const secondEnemyHit = (traits: Partial<DungeonTraits>) =>
      attacksOf(setup([fighter({ maxHp: 10_000 }, traits)], [fighter()])).filter(
        (e) => e.side === 'enemy',
      )[1]!;
    expect(secondEnemyHit({ intimidateStats: { speed: 50 } }).atMs).toBeGreaterThan(
      secondEnemyHit({}).atMs,
    );
    const events = simulateDungeon(
      setup(
        [fighter({}, { intimidateStats: { defense: 20, speed: 20, attack: 10 } })],
        [fighter()],
      ),
      [],
      null,
      0,
    ).events.filter((e) => e.kind === 'ability');
    expect(events).toMatchObject([
      { effect: 'intimidate', amount: 20, stats: ['defense', 'speed'] },
      { effect: 'intimidate', amount: 10, stats: ['attack'] },
    ]);
  });

  it('Super Chance augmente le taux de critique, Armurbaston les empêche', () => {
    const crits = (
      critChance: number,
      attacker: Partial<DungeonTraits>,
      defender: Partial<DungeonTraits> = {},
    ) => {
      const s = setup(
        [fighter({ maxHp: 1_000_000 }, attacker)],
        [fighter({ maxHp: 1_000_000 }, defender)],
      );
      s.settings = { ...s.settings, critChance };
      return simulateDungeon(s, [], null, 60_000).events.filter(
        (e) => e.kind === 'attack' && e.side === 'player' && e.critical,
      ).length;
    };
    expect(crits(0.1, { critPercent: 300 })).toBeGreaterThan(crits(0.1, {}));
    expect(crits(1, {}, { critImmunity: true })).toBe(0);
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

  it('statistiques selon l’état du Pokémon : seulement tant que la condition est remplie', () => {
    const firstPlayerAttack = (traits: Partial<DungeonTraits>) =>
      attacksOf(setup([fighter({}, traits)], [fighter()])).find((e) => e.side === 'player')!;
    const plain = firstPlayerAttack({});
    // À PV max : plus rapide et plus fort.
    const fast = firstPlayerAttack({ stats: [{ stat: 'speed', percent: 50, fullHp: true }] });
    expect(fast.atMs).toBeLessThan(plain.atMs);
    const strong = firstPlayerAttack({ stats: [{ stat: 'attack', percent: 100, fullHp: true }] });
    expect(strong.damage).toBeGreaterThan(plain.damage);
    // Condition non remplie (PV pleins, pas sous le tiers) : aucun effet.
    const torrent = firstPlayerAttack({ stats: [{ stat: 'speed', percent: 50, hpBelow: 1 / 3 }] });
    expect(torrent.atMs).toBe(plain.atMs);
  });

  it('bonus d’un coéquipier : actif tant que le porteur n’est pas K.O.', () => {
    const firstHit = (team: DungeonFighter[]) =>
      attacksOf(setup(team, [fighter()])).find((e) => e.side === 'player')!;
    const plain = firstHit([fighter(), fighter()]);
    const damage = { damage: [{ dir: 'dealt' as const, percent: 100, from: 1 }] };
    const speed = { stats: [{ stat: 'speed' as const, percent: 50, from: 1 }] };
    // Porteur (index 1) sur le banc, debout : bonus actifs.
    expect(firstHit([fighter({}, damage), fighter()]).damage).toBeGreaterThan(plain.damage);
    expect(firstHit([fighter({}, speed), fighter()]).atMs).toBeLessThan(plain.atMs);
    // Porteur K.O. : plus aucun bonus.
    const down = fighter({ maxHp: 0 });
    expect(firstHit([fighter({}, damage), down]).damage).toBe(plain.damage);
    expect(firstHit([fighter({}, speed), down]).atMs).toBe(plain.atMs);
  });

  it('le bonus d’un coéquipier disparaît dès que le porteur tombe', () => {
    // Le porteur (fragile) ouvre le combat ; son coéquipier prend le relais après son K.O.
    const holder = fighter({ maxHp: 1 });
    const ally = (traits: Partial<DungeonTraits>) => fighter({}, traits);
    const allyHits = (traits: Partial<DungeonTraits>) =>
      attacksOf(setup([holder, ally(traits)], [fighter()])).filter(
        (e) => e.side === 'player' && e.attacker === 1,
      );
    const boosted = allyHits({ damage: [{ dir: 'dealt', percent: 100, from: 0 }] });
    expect(boosted.length).toBeGreaterThan(0);
    expect(boosted).toEqual(allyHits({}));
  });

  it('Gaz Inhibiteur : le talent du Pokémon en face ne joue plus', () => {
    const firstHit = (player: DungeonFighter, enemy: DungeonFighter) =>
      attacksOf(setup([player], [enemy])).find((e) => e.side === 'player')!;
    const gas = fighter({}, { suppressAbility: true });
    // Défense doublée par son talent, dégâts reçus −50 % : tout est ignoré face au Gaz.
    const tough = fighter(
      {
        stats: { ...fighter().stats, defense: 200 },
        baseStats: fighter().stats,
      },
      { damage: [{ dir: 'taken', percent: -50 }] },
    );
    const plain = firstHit(fighter(), fighter());
    expect(firstHit(fighter(), tough).damage).toBeLessThan(plain.damage);
    expect(firstHit(gas, tough).damage).toBe(plain.damage);
    const events = simulateDungeon(setup([gas], [tough]), [], null, 0).events;
    expect(events).toEqual([
      expect.objectContaining({ kind: 'ability', side: 'player', effect: 'suppressAbility' }),
    ]);
    // Pas d'annonce face à un Pokémon sans talent.
    expect(
      simulateDungeon(setup([gas], [{ ...fighter(), traits: undefined }]), [], null, 0).events,
    ).toEqual([]);
  });

  it('Gaz Inhibiteur : plus d’Intimidation à l’entrée en face du porteur', () => {
    const intimidating = fighter({}, { intimidate: 50 });
    const firstEnemyHit = (player: DungeonFighter) =>
      attacksOf(setup([player], [fighter()])).find((e) => e.side === 'enemy')!;
    const gas = fighter({}, { suppressAbility: true });
    const gasHit = (enemy: DungeonFighter) =>
      attacksOf(setup([gas], [enemy])).find((e) => e.side === 'player')!;
    expect(firstEnemyHit(intimidating).damage).toBeLessThan(firstEnemyHit(fighter()).damage);
    expect(gasHit(fighter({}, { intimidate: 50 })).damage).toBe(gasHit(fighter()).damage);
  });

  it('variations de statistiques affichées : talents, Intimidation, paralysie, Gaz Inhibiteur', () => {
    const tough = fighter(
      { stats: { ...fighter().stats, defense: 120 }, baseStats: fighter().stats },
      { stats: [{ stat: 'speed', percent: 50, hpBelow: 0.5 }] },
    );
    const s = setup([tough, fighter()], [fighter({}, { intimidateStats: { attack: 25 } })]);
    const { state } = simulateDungeon(s, [], null, 0);
    expect(dungeonStatChanges(s, state, 'player', 0)).toEqual({ attack: -25, defense: 20 });
    // Sur le banc : ses talents seulement ; vitesse conditionnée par ses PV.
    expect(dungeonStatChanges(s, state, 'player', 1)).toEqual({});
    expect(
      dungeonStatChanges(
        s,
        { ...state, hp: [40, 100], statuses: ['paralysis', null] },
        'player',
        0,
      ),
    ).toEqual({ attack: -25, defense: 20, speed: -25 });
    const gas = setup([tough], [fighter({}, { suppressAbility: true })]);
    expect(dungeonStatChanges(gas, simulateDungeon(gas, [], null, 0).state, 'player', 0)).toEqual(
      {},
    );
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

  it('garde pour le combat les statistiques conditionnées par les PV ou le statut', () => {
    const quickFeet = testContext((c) => {
      c.abilities = [
        {
          id: 'quick-feet',
          description: '',
          effects: [
            {
              type: 'modifier',
              param: 'speed',
              value: 50,
              scope: 'self',
              conditions: [{ type: 'statused' }],
            },
          ],
        },
      ];
    });
    const team = [{ ...member('a', 6, 50, { ability: 'quick-feet' }), move: null }];
    const plain = buildDungeonSetup(ctx, dungeon, team, 1);
    const boosted = buildDungeonSetup(quickFeet, dungeon, team, 1);
    expect(boosted.team[0]!.stats.speed).toBe(plain.team[0]!.stats.speed);
    expect(boosted.team[0]!.traits?.stats).toEqual([
      { stat: 'speed', percent: 50, statused: true },
    ]);
  });

  it('immunité aux statuts : pour le Pokémon seul ou toute l’équipe', () => {
    const veils = testContext((c) => {
      c.abilities = [
        {
          id: 'insomnia',
          description: '',
          effects: [{ type: 'statusImmunity', statuses: ['sleep'], scope: 'self', conditions: [] }],
        },
        {
          id: 'pastel-veil',
          description: '',
          effects: [
            { type: 'statusImmunity', statuses: ['poison'], scope: 'team', conditions: [] },
          ],
        },
      ];
    });
    const team = [
      { ...member('a', 6, 50, { ability: 'insomnia' }), move: null },
      { ...member('b', 6, 50, { ability: 'pastel-veil' }), move: null },
      { ...member('c', 6, 50), move: null },
    ];
    const setup = buildDungeonSetup(veils, dungeon, team, 1);
    expect(setup.team.map((f) => f.traits?.statusImmunities)).toEqual([['sleep'], ['poison'], []]);
    // Pour les coéquipiers : liée au porteur (index 1), tant qu'il n'est pas K.O.
    expect(setup.team.map((f) => f.traits?.teamStatusImmunities)).toEqual([
      [{ status: 'poison', from: 1 }],
      undefined,
      [{ status: 'poison', from: 1 }],
    ]);
  });

  it('donne leur talent aux adversaires si l’équilibrage l’active', () => {
    const on = testContext((c) => {
      c.abilities = ABILITIES;
      c.balance.combat.enemyAbilities = true;
    });
    const team = [{ ...member('a', 6, 50), move: null }];
    expect(buildDungeonSetup(on, dungeon, team, 1).enemies.at(-1)!.ability).toBe('tough-claws');
    expect(buildDungeonSetup(ctx, dungeon, team, 1).enemies.at(-1)!.ability).toBeUndefined();
  });
});
