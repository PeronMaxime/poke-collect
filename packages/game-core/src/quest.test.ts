import { describe, expect, it } from 'vitest';
import { MAX_IV, pokemonPower } from './pokemon';
import type { PlayerProgress } from './progress';
import { isZoneUnlocked } from './progress';
import { playerSlots } from './progression';
import {
  advanceQuest,
  eventProgress,
  generateQuestPokemon,
  NEW_QUEST,
  questExpeditionMisses,
  questItemsFound,
  questItemsGained,
  questStatus,
  questStepsDone,
} from './quest';
import type { QuestEvent } from './quest';
import { resolveExpedition } from './expedition';
import { createRng } from './rng';
import { member, testContext, withWeatherAbilities } from './test-helpers';

const ctx = testContext();
const quest = (id: string) => ctx.quest(id)!;
const condition = (questId: string, step: number) => quest(questId).steps[step]!.condition;

const progress = (patch: Partial<PlayerProgress> = {}): PlayerProgress => ({
  caughtSpeciesIds: new Set(),
  defeatedTrainerIds: new Set(),
  eggsHatched: 0,
  ...patch,
});

const expedition = (patch: Partial<QuestEvent>): QuestEvent => ({
  type: 'expedition',
  zoneId: 'route-1',
  team: [],
  captured: [],
  ...patch,
});

describe('avancement des quêtes', () => {
  it('compte les captures du bon type, dans la zone de l’étape', () => {
    const sulfura = quest('sulfura');
    const atStep = { step: 1, count: 0 };
    // 2 Pokémon Feu (Caninos, Goupix) et un Rattata : seuls les premiers comptent.
    const captured = [58, 37, 19].map((speciesId) => ({ speciesId }));
    const atBraise = expedition({ captured, zoneId: 'mont-braise' });
    expect(advanceQuest(ctx, sulfura, atStep, progress(), atBraise)).toEqual({ step: 1, count: 2 });
    expect(advanceQuest(ctx, sulfura, atStep, progress(), expedition({ captured }))).toEqual(
      atStep,
    );
    expect(advanceQuest(ctx, sulfura, { step: 1, count: 4 }, progress(), atBraise)).toEqual({
      step: 2,
      count: 0,
    });
  });

  it('un même événement ne compte que pour l’étape en cours', () => {
    // Étape 4 d’Artikodin (capturer Lokhlass) terminée : l’expédition, pourtant valable pour
    // l’étape 5, ne compte pas.
    const artikodin = quest('artikodin');
    const team = [member('a', 131, 50), member('b', 87, 50)];
    const event = expedition({
      zoneId: 'iles-ecume',
      team,
      weather: 'hail',
      captured: [{ speciesId: 131 }],
    });
    expect(advanceQuest(ctx, artikodin, { step: 3, count: 0 }, progress(), event)).toEqual({
      step: 4,
      count: 0,
    });
    expect(advanceQuest(ctx, artikodin, { step: 4, count: 0 }, progress(), event)).toEqual({
      step: 5,
      count: 0,
    });
  });

  it('expédition : Pokémon précis exigés dans l’équipe', () => {
    const c = condition('electhor', 0);
    if (c.type !== 'expedition') throw new Error('étape inattendue');
    const at = (team: QuestEvent['team'], zoneId = 'routes-9-10') =>
      eventProgress(ctx, c, expedition({ zoneId, team }), 'kanto');
    expect(at([member('a', 25, 20)])).toBe(1);
    expect(at([member('a', 26, 20)])).toBe(0);
    expect(at([member('a', 25, 20)], 'centrale')).toBe(0);
    expect(questExpeditionMisses(ctx, c, { zoneId: 'centrale', team: [] })).toEqual([
      { code: 'zone' },
      { code: 'species', speciesIds: [25] },
    ]);
  });

  it('expédition : assez de Pokémon du type et de la PE demandés', () => {
    const c = condition('artikodin', 0);
    if (c.type !== 'expedition') throw new Error('étape inattendue');
    const strong = member('a', 9, 100);
    expect(pokemonPower(ctx.species(9)!, strong)).toBeGreaterThanOrEqual(600);
    const at = (team: QuestEvent['team']) =>
      eventProgress(ctx, c, expedition({ zoneId: 'routes-maritimes', team }), 'kanto');
    expect(at([strong, member('b', 131, 100)])).toBe(1);
    expect(at([strong, member('b', 131, 5)])).toBe(0);
    expect(at([strong, member('b', 59, 100)])).toBe(0);
  });

  it('expédition : météo au départ (inconnue = non vérifiée)', () => {
    const c = condition('artikodin', 4);
    if (c.type !== 'expedition') throw new Error('étape inattendue');
    const team = [member('a', 131, 50), member('b', 87, 50)];
    const at = (weather: QuestEvent['weather']) =>
      eventProgress(ctx, c, expedition({ zoneId: 'iles-ecume', team, weather }), 'kanto');
    expect(at('hail')).toBe(1);
    expect(at('rain')).toBe(0);
    expect(at(null)).toBe(0);
    expect(at(undefined)).toBe(1);
  });

  it('expédition : la météo d’un talent de l’équipe compte comme celle du départ', () => {
    const wctx = testContext(withWeatherAbilities);
    const c = condition('artikodin', 4);
    if (c.type !== 'expedition') throw new Error('étape inattendue');
    // Lokhlass à Alerte Neige en tête : grêle, même si la zone est sous un temps clair.
    const team = [member('a', 131, 50, { ability: 'snow-warning' }), member('b', 87, 50)];
    const zone = ctx.zone('iles-ecume')!;
    const run = (weather: QuestEvent['weather']) =>
      resolveExpedition(wctx, {
        zone,
        elapsedMinutes: 30,
        seed: 1,
        team,
        balls: null,
        berries: null,
        pity: {},
        weather,
      });
    const at = (weather: QuestEvent['weather']) =>
      eventProgress(wctx, c, expedition({ zoneId: 'iles-ecume', team, weather }), 'kanto');
    expect(at(run(null).weather)).toBe(1);
    expect(at(run('rain').weather)).toBe(1);
    // Sans le talent, il faut la grêle de la zone.
    const plain = [member('a', 131, 50), member('b', 87, 50)];
    const plainRun = resolveExpedition(wctx, {
      zone,
      elapsedMinutes: 30,
      seed: 1,
      team: plain,
      balls: null,
      berries: null,
      pity: {},
      weather: null,
    });
    expect(plainRun.weather).toBeNull();
  });

  it('expédition : lancée de jour ou de nuit', () => {
    const c = condition('sulfura', 0);
    if (c.type !== 'expedition') throw new Error('étape inattendue');
    const team = [member('a', 59, 50), member('b', 38, 50)];
    const at = (hour: QuestEvent['hour']) =>
      eventProgress(ctx, c, expedition({ zoneId: 'manoir-pokemon', team, hour }), 'kanto');
    expect(at(23)).toBe(1);
    expect(at(3)).toBe(1);
    expect(at(12)).toBe(0);
    expect(at(null)).toBe(0);
    expect(at(undefined)).toBe(1);
  });

  it('objets de quête : chance par tirage de butin, tirages fixés par le seed', () => {
    const c = condition('electhor', 1);
    if (c.type !== 'questItem') throw new Error('étape inattendue');
    const team = [member('a', 25, 50), member('b', 81, 50)];
    const event = (seed: number, patch: Partial<QuestEvent> = {}) =>
      expedition({ zoneId: 'centrale', team, lootRolls: 20, seed, ...patch });
    const found = Array.from({ length: 400 }, (_, seed) => questItemsFound(ctx, c, event(seed)));
    const mean = found.reduce((a, b) => a + b, 0) / found.length;
    // 20 tirages de butin (deux heures) à 4 % : 0,8 objet en moyenne.
    expect(mean).toBeGreaterThan(0.6);
    expect(mean).toBeLessThan(1);
    expect(found.some((n) => n === 0)).toBe(true);
    expect(questItemsFound(ctx, c, event(7))).toBe(questItemsFound(ctx, c, event(7)));
    // Sans les conditions (un seul Électrik), rien ; sans tirage de butin, rien.
    expect(questItemsFound(ctx, c, event(7, { team: [team[0]!] }))).toBe(0);
    expect(questItemsFound(ctx, c, event(7, { lootRolls: 0 }))).toBe(0);
  });

  it('objets de quête : gagnés sans dépasser le nombre demandé', () => {
    const electhor = quest('electhor');
    const sure = testContext((content) => {
      const s = content.quests.find((q) => q.id === 'electhor')!.steps[1]!;
      if (s.condition.type === 'questItem') s.condition.chance = 100;
    });
    const team = [member('a', 25, 50), member('b', 81, 50)];
    const event = expedition({ zoneId: 'centrale', team, lootRolls: 20, seed: 1 });
    const before = { step: 1, count: 2 };
    const after = advanceQuest(sure, sure.quest('electhor')!, before, progress(), event);
    // Étape 3 (battre Volt) non remplie : on s'y arrête.
    expect(after).toEqual({ step: 2, count: 0 });
    expect(questItemsGained(electhor, before, after)).toEqual({
      itemId: 'fragment-magnetique',
      quantity: 1,
    });
    expect(questItemsGained(electhor, { step: 1, count: 0 }, { step: 1, count: 2 })).toEqual({
      itemId: 'fragment-magnetique',
      quantity: 2,
    });
    expect(questItemsGained(electhor, before, before)).toBeNull();
    expect(questItemsGained(electhor, NEW_QUEST, { step: 1, count: 0 })).toBeNull();
  });

  it('valide paresseusement les étapes « état » et s’arrête à la première non remplie', () => {
    const mewtwo = quest('mewtwo');
    const atStep = { step: 1, count: 0 };
    const kanto = new Set(Array.from({ length: 151 }, (_, i) => i + 1));
    const birds = new Map([
      ['artikodin', 5],
      ['electhor', 4],
      ['sulfura', 5],
    ]);
    const ready = progress({ caughtSpeciesIds: kanto, questSteps: birds });
    expect(advanceQuest(ctx, mewtwo, atStep, ready)).toEqual({ step: 2, count: 0 });
    expect(advanceQuest(ctx, mewtwo, atStep, progress({ questSteps: birds }))).toEqual(atStep);
    birds.set('sulfura', 4);
    expect(advanceQuest(ctx, mewtwo, atStep, ready).step).toBe(1);
  });

  it('calcule les étapes validées, quêtes dépendantes comprises', () => {
    const records = new Map([['mewtwo', { step: 5, count: 0 }]]);
    const steps = questStepsDone(ctx, progress(), records);
    expect(steps.get('mewtwo')).toBe(5);
    // Mew se débloque quand Mewtwo est terminé ; son étape 1 (500 œufs) n'est pas remplie.
    expect(steps.get('mew')).toBe(0);
    // Les oiseaux s'ouvrent après la victoire contre le Maître de la Ligue.
    expect(steps.has('electhor')).toBe(false);
    const afterLeague = progress({ defeatedTrainerIds: new Set(['maitre-blue']) });
    expect(questStepsDone(ctx, afterLeague, records).get('electhor')).toBe(0);
    expect(questStepsDone(ctx, progress(), new Map()).size).toBe(0);
  });

  it('ouvre les zones de quête selon les étapes validées', () => {
    const grotte = ctx.zone('grotte-azuree')!;
    const at = (step: number) =>
      isZoneUnlocked(ctx, grotte, { ...progress(), questSteps: new Map([['mewtwo', step]]) });
    expect(at(1)).toBe(false);
    expect(at(2)).toBe(true);
  });

  it('donne un statut à chaque quête', () => {
    const q = quest('artikodin');
    expect(questStatus(q, undefined, false)).toBe('locked');
    expect(questStatus(q, 1, false)).toBe('active');
    expect(questStatus(q, 5, false)).toBe('completed');
    expect(questStatus(q, 5, true)).toBe('claimed');
  });
});

describe('récompenses de quête', () => {
  it('garantit les IV parfaits du légendaire offert', () => {
    for (let seed = 0; seed < 50; seed++) {
      const p = generateQuestPokemon(
        ctx,
        createRng(seed),
        { ...quest('mewtwo').rewards.pokemon[0]!, level: 70, perfectIvs: 3 },
        0,
      );
      expect(p.speciesId).toBe(150);
      expect(p.level).toBe(70);
      expect(p.isShiny).toBe(false);
      expect(Object.values(p.ivs).filter((iv) => iv === MAX_IV).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('compte les emplacements des quêtes réclamées', () => {
    const custom = testContext((c) => {
      c.quests.find((q) => q.id === 'artikodin')!.rewards.expeditionSlots = 1;
    });
    const base = { collectionIds: new Set<string>() };
    const before = playerSlots(custom, base).expeditions;
    expect(playerSlots(custom, { ...base, questIds: new Set(['artikodin']) }).expeditions).toBe(
      before + 1,
    );
  });
});
