import { describe, expect, it } from 'vitest';
import { canAssist } from './abilities';
import { healCommand, healReadyAt, simulateDungeon } from './dungeon';
import type { DungeonFighter, DungeonSetup } from './dungeon';
import { applyItemToPokemon, MAX_HAPPINESS } from './endgame';
import type { ItemTarget } from './endgame';
import { expeditionPlan, resolveExpedition } from './expedition';
import type { ExpeditionInput } from './expedition';
import { berryGrowthSpeed, harvestBonus } from './farm';
import { member, testContext } from './test-helpers';
import { createRng } from './rng';

const ctx = testContext();

describe('Baie Sitrus (soin en combat)', () => {
  const fighter = (extra: Partial<DungeonFighter> = {}): DungeonFighter => ({
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
    ...extra,
  });
  const setup = {
    team: [fighter()],
    enemies: [fighter({ maxHp: 10_000 })],
    settings: ctx.balance.combat,
    timeLimitMs: 120_000,
    seed: 7,
  } as DungeonSetup;
  // Un peu après la première attaque adverse : le Pokémon actif a perdu des PV.
  const firstHit = simulateDungeon(setup, [], null, 120_000).events.find(
    (e) => e.kind === 'attack' && e.side === 'enemy',
  )!.atMs;
  const atMs = firstHit + 1;

  it('refuse un Pokémon qui a tous ses PV', () => {
    expect(healCommand(setup, [], null, 0, 'sitrus-berry', 0.25)).toEqual({ error: 'FULL_HP' });
  });

  it('rend un quart des PV max, sans dépasser le maximum', () => {
    const before = simulateDungeon(setup, [], null, atMs).state.hp[0]!;
    const result = healCommand(setup, [], null, atMs, 'sitrus-berry', 0.25);
    if (!('command' in result)) throw new Error(result.error);
    const { command } = result;
    const { state, events } = simulateDungeon(setup, [command], null, atMs);
    expect(state.hp[0]).toBe(Math.min(100, before + 25));
    expect(events.find((e) => e.kind === 'item')).toMatchObject({
      member: 0,
      itemId: 'sitrus-berry',
      amount: Math.min(100, before + 25) - before,
    });
  });

  it('ne resert qu’après sa recharge', () => {
    const result = healCommand(setup, [], null, atMs, 'sitrus-berry', 0.25, 10_000);
    if (!('command' in result)) throw new Error(result.error);
    const commands = [result.command];
    expect(healReadyAt(commands, 'sitrus-berry', 10_000)).toBe(atMs + 10_000);
    expect(healCommand(setup, commands, null, atMs + 9_999, 'sitrus-berry', 0.25, 10_000)).toEqual({
      error: 'COOLDOWN',
    });
    expect(
      healCommand(setup, commands, null, atMs + 10_000, 'sitrus-berry', 0.25, 10_000),
    ).not.toEqual({ error: 'COOLDOWN' });
  });

  it('refuse une fois le combat terminé', () => {
    const end = simulateDungeon(setup, [], null, 120_000).state.endedAtMs!;
    expect(healCommand(setup, [], null, end + 1, 'sitrus-berry', 0.25)).toMatchObject({
      error: expect.stringMatching(/FINISHED|MEMBER_KO/),
    });
  });
});

describe('Baie Grena (bonheur)', () => {
  const target = (happiness: number): ItemTarget => ({
    speciesId: 25,
    ivs: {
      hp: 31,
      attack: 31,
      defense: 31,
      'special-attack': 31,
      'special-defense': 31,
      speed: 31,
    },
    nature: 'hardy',
    originalNature: 'hardy',
    ability: 'static',
    happiness,
    level: 10,
    xp: 1000,
  });

  it('augmente le bonheur de 1, jusqu’au maximum', () => {
    expect(applyItemToPokemon(ctx, target(70), 'pomeg-berry', {}, createRng(1))).toEqual({
      patch: { happiness: 71 },
    });
    expect(applyItemToPokemon(ctx, target(MAX_HAPPINESS), 'pomeg-berry', {}, createRng(1))).toEqual(
      {
        error: 'NO_EFFECT',
      },
    );
  });
});

describe('Baie Nanana (rencontres)', () => {
  const nanana = (quantity: number) => ({ itemId: 'nanab-berry', quantity });

  it('accélère les rencontres pendant les 10 min de chaque baie', () => {
    expect(expeditionPlan(ctx, 60).encounters).toBe(20);
    // 10 min à × 2 = 6,67 rencontres, puis 50 min au rythme normal = 16,67.
    expect(expeditionPlan(ctx, 60, undefined, nanana(1)).encounters).toBe(23);
    expect(expeditionPlan(ctx, 60, undefined, nanana(6)).encounters).toBe(40);
    expect(expeditionPlan(ctx, 60, undefined, nanana(600)).encounters).toBe(40);
    // Les rencontres s'accélèrent seulement avec une baie de rencontres.
    expect(
      expeditionPlan(ctx, 60, undefined, { itemId: 'razz-berry', quantity: 6 }).encounters,
    ).toBe(20);
  });

  it('ne consomme que les baies entamées', () => {
    const input: ExpeditionInput = {
      zone: ctx.zone('route-1')!,
      elapsedMinutes: 60,
      seed: 1234,
      team: [member('starter', 4, 5, { xp: 135 })],
      balls: { itemId: 'poke-ball', quantity: 100 },
      berries: null,
      encounterBerries: nanana(50),
      pity: {},
    };
    const boosted = resolveExpedition(ctx, input);
    expect(boosted.encounters).toHaveLength(40);
    expect(boosted.encounterBerriesUsed).toBe(6);
    expect(boosted.berriesUsed).toBe(0);
    expect(resolveExpedition(ctx, { ...input, encounterBerries: null }).encounters).toHaveLength(
      20,
    );
  });
});

describe('Baie Framby (capture)', () => {
  it('facilite la capture pendant 10 min par baie, depuis le départ', () => {
    const input: ExpeditionInput = {
      zone: ctx.zone('route-1')!,
      elapsedMinutes: 60,
      seed: 1234,
      team: [member('starter', 4, 5, { xp: 135 })],
      balls: { itemId: 'poke-ball', quantity: 100 },
      berries: { itemId: 'razz-berry', quantity: 1 },
      pity: {},
    };
    const withBerry = resolveExpedition(ctx, input);
    const without = resolveExpedition(ctx, { ...input, berries: null });
    const boosted = (i: number) =>
      withBerry.encounters[i]!.captureChance > without.encounters[i]!.captureChance;
    // Rencontres à 3, 6 et 9 min sous l'effet ; celle de 12 min non.
    expect([0, 1, 2].every(boosted)).toBe(true);
    expect(boosted(3)).toBe(false);
    expect(withBerry.berriesUsed).toBe(1);
    expect(
      resolveExpedition(ctx, {
        ...input,
        elapsedMinutes: 5,
        berries: { itemId: 'razz-berry', quantity: 3 },
      }).berriesUsed,
    ).toBe(1);
  });
});

describe('assistant de récolte', () => {
  const harvestCtx = testContext((c) => {
    c.abilities = [
      {
        id: 'harvest',
        description: '',
        effects: [
          { type: 'modifier', param: 'berryYield', value: 2, scope: 'team', conditions: [] },
        ],
      },
    ];
  });
  const holder = (ability: string) => ({ speciesId: 103, formId: null, ability });

  it('n’accepte que les talents qui augmentent la récolte', () => {
    expect(canAssist(harvestCtx, 'harvest', holder('harvest'))).toBe(true);
    expect(canAssist(harvestCtx, 'harvest', holder('chlorophyll'))).toBe(false);
    // L'arrosage ne regarde que le type (Noadkoko n'est pas Eau).
    expect(canAssist(harvestCtx, 'farm', holder('harvest'))).toBe(false);
  });

  it('ajoute des baies à chaque parcelle récoltée', () => {
    expect(harvestBonus(harvestCtx, holder('harvest'))).toBe(2);
    expect(harvestBonus(harvestCtx, holder('chlorophyll'))).toBe(0);
    expect(harvestBonus(harvestCtx, null)).toBe(0);
  });
});

describe('vitesse de pousse (talent de l’arroseur)', () => {
  const growthCtx = testContext((c) => {
    c.abilities = [
      {
        id: 'rain-dish',
        description: '',
        effects: [
          { type: 'modifier', param: 'berryGrowth', value: 100, scope: 'team', conditions: [] },
        ],
      },
    ];
  });
  const holder = (ability: string) => ({ speciesId: 7, formId: null, ability });

  it('accélère la pousse selon le talent de l’assistant de la ferme', () => {
    expect(berryGrowthSpeed(growthCtx, holder('rain-dish'))).toBe(2);
    expect(berryGrowthSpeed(growthCtx, holder('torrent'))).toBe(1);
    expect(berryGrowthSpeed(growthCtx, null)).toBe(1);
  });
});
