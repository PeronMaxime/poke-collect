import { describe, expect, it } from 'vitest';
import type { GameAbility } from '@poke/content';
import { abilityModifier, resolveWeather } from './abilities';
import { attackDamage, buildDungeonSetup, simulateDungeon } from './dungeon';
import type { DungeonFighter, DungeonSetup, DungeonTraits } from './dungeon';
import { expeditionEnv } from './expedition';
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
    maxHp: 1000,
    attackType: 'normal',
    category: 'physical',
    ability: 'test',
    traits: { ...NO_TRAITS, ...traits },
    ...extra,
  } satisfies DungeonFighter;
}

function setup(
  team: DungeonFighter[],
  enemies: DungeonFighter[],
  extra: Partial<DungeonSetup> = {},
): DungeonSetup {
  const { attacks, ...rest } = settings;
  return { team, enemies, settings: { ...rest, attacks }, timeLimitMs: 30_000, seed: 42, ...extra };
}

const statusEvents = (s: DungeonSetup) =>
  simulateDungeon(s, [], null, 30_000).events.filter((e) => e.kind === 'status');

describe('météo en donjon', () => {
  const s = setup([fighter()], [fighter()]).settings;
  const fire = fighter({ attackType: 'fire', types: ['fire'] });

  it('renforce le Feu au soleil et l’affaiblit sous la pluie', () => {
    const clear = attackDamage(s, fire, fighter(), 'fire', 0.5).damage;
    expect(
      attackDamage(s, fire, fighter(), 'fire', 0.5, { weather: 'sun' }).damage,
    ).toBeGreaterThan(clear);
    expect(attackDamage(s, fire, fighter(), 'fire', 0.5, { weather: 'rain' }).damage).toBeLessThan(
      clear,
    );
  });

  it('la tempête de sable blesse sauf les types Roche, Sol, Acier et les talents insensibles', () => {
    const damage = (f: DungeonFighter) =>
      statusEvents(setup([f], [fighter()], { weather: 'sand' })).filter(
        (e) => e.kind === 'status' && e.side === 'player' && e.change === 'damage',
      ).length;
    expect(damage(fighter())).toBeGreaterThan(0);
    expect(damage(fighter({ types: ['rock'] }))).toBe(0);
    expect(damage(fighter({}, { weatherImmunity: true }))).toBe(0);
  });
});

describe('statuts en donjon', () => {
  it('Statik paralyse l’attaquant physique, qui attaque moins souvent', () => {
    const plain = simulateDungeon(setup([fighter()], [fighter()]), [], null, 30_000).events;
    const shocked = simulateDungeon(
      setup(
        [fighter()],
        [fighter({}, { inflict: [{ status: 'paralysis', chance: 1, trigger: 'contact' }] })],
      ),
      [],
      null,
      30_000,
    );
    expect(shocked.state.statuses[0]).toBe('paralysis');
    const playerAttacks = (events: typeof plain) =>
      events.filter((e) => e.kind === 'attack' && e.side === 'player').length;
    expect(playerAttacks(shocked.events)).toBeLessThan(playerAttacks(plain));
  });

  it('les types et les talents protègent des statuts', () => {
    const poisoner = fighter(
      {},
      { inflict: [{ status: 'poison', chance: 1, trigger: 'contact' }] },
    );
    const inflicted = (f: DungeonFighter) =>
      statusEvents(setup([f], [poisoner])).some(
        (e) => e.kind === 'status' && e.change === 'inflicted',
      );
    expect(inflicted(fighter())).toBe(true);
    expect(inflicted(fighter({ types: ['steel'] }))).toBe(false);
    expect(inflicted(fighter({}, { statusImmunities: ['poison'] }))).toBe(false);
  });

  it('le sommeil fait sauter des attaques, puis le Pokémon se réveille', () => {
    const sleeper = fighter({}, { inflict: [{ status: 'sleep', chance: 1, trigger: 'attack' }] });
    const events = statusEvents(setup([sleeper], [fighter({}, { statusImmunities: [] })]));
    const enemy = events.filter((e) => e.kind === 'status' && e.side === 'enemy');
    expect(enemy.map((e) => e.kind === 'status' && e.change).slice(0, 5)).toEqual([
      'inflicted',
      'skipped',
      'skipped',
      'skipped',
      'cured',
    ]);
  });

  it('le poison retire des PV après chaque attaque du Pokémon empoisonné', () => {
    const poisoner = fighter(
      {},
      { inflict: [{ status: 'poison', chance: 1, trigger: 'contact' }] },
    );
    const damage = statusEvents(setup([fighter()], [poisoner])).filter(
      (e) => e.kind === 'status' && e.change === 'damage',
    );
    expect(damage.length).toBeGreaterThan(0);
    expect(damage[0]).toMatchObject({ side: 'player', status: 'poison', amount: 125 });
  });
});

describe('météo des talents', () => {
  const ABILITIES: GameAbility[] = [
    {
      id: 'drought',
      description: '',
      effects: [{ type: 'setWeather', weather: 'sun', conditions: [] }],
    },
    {
      id: 'chlorophyll',
      description: '',
      effects: [
        {
          type: 'modifier',
          param: 'expeditionDuration',
          value: -50,
          scope: 'team',
          conditions: [{ type: 'weather', weathers: ['sun'] }],
        },
      ],
    },
  ];
  const withAbilities = testContext((c) => {
    c.abilities = ABILITIES;
  });
  const zone = { affinityTypes: [], weather: null };

  it('un talent impose sa météo, dont dépendent les autres talents', () => {
    const solo = [member('a', 3, 50, { ability: 'chlorophyll' })];
    const duo = [member('b', 3, 50, { ability: 'drought' }), ...solo];
    expect(abilityModifier(withAbilities, expeditionEnv(zone, solo), 'expeditionDuration')).toBe(0);
    expect(resolveWeather(withAbilities, expeditionEnv(zone, duo))).toBe('sun');
    expect(abilityModifier(withAbilities, expeditionEnv(zone, duo), 'expeditionDuration')).toBe(
      -50,
    );
    expect(
      abilityModifier(
        withAbilities,
        expeditionEnv({ ...zone, weather: 'sun' }, solo),
        'expeditionDuration',
      ),
    ).toBe(-50);
  });

  it('fige la météo du donjon dans la mise en place', () => {
    const dungeon = { ...ctx.dungeon('mega-dracaufeu-x')!, weather: 'rain' as const };
    const team = [{ ...member('a', 6, 50), move: null }];
    expect(buildDungeonSetup(ctx, dungeon, team, 1).weather).toBe('rain');
    const sunny = [{ ...member('a', 6, 50, { ability: 'drought' }), move: null }];
    expect(buildDungeonSetup(withAbilities, dungeon, sunny, 1).weather).toBe('sun');
  });
});
