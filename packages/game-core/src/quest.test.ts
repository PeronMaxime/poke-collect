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
  questStatus,
  questStepsDone,
} from './quest';
import type { QuestEvent } from './quest';
import { createRng } from './rng';
import { member, testContext } from './test-helpers';

const ctx = testContext();
const quest = (id: string) => ctx.quest(id)!;

const progress = (patch: Partial<PlayerProgress> = {}): PlayerProgress => ({
  caughtSpeciesIds: new Set(),
  defeatedTrainerIds: new Set(),
  eggsHatched: 0,
  ...patch,
});
const twoBadges = progress({ defeatedTrainerIds: new Set(['pierre', 'ondine']) });

const expedition = (patch: Partial<QuestEvent>): QuestEvent => ({
  type: 'expedition',
  zoneId: 'route-1',
  team: [],
  captured: [],
  ...patch,
});

describe('avancement des quêtes', () => {
  it('compte les captures du bon type pendant l’étape en cours', () => {
    const artikodin = quest('artikodin');
    // 2 Pokémon Eau (Magicarpe, Psykokwak) et un Rattata : seuls les premiers comptent.
    const event = expedition({ captured: [129, 54, 19].map((speciesId) => ({ speciesId })) });
    expect(advanceQuest(ctx, artikodin, NEW_QUEST, twoBadges, event)).toEqual({
      step: 0,
      count: 2,
    });
    expect(advanceQuest(ctx, artikodin, { step: 0, count: 13 }, twoBadges, event)).toEqual({
      step: 1,
      count: 0,
    });
  });

  it('un même événement ne compte que pour l’étape en cours', () => {
    const artikodin = quest('artikodin');
    // L'étape 1 se termine : les captures Glace de la même expédition ne comptent pas pour l'étape 2.
    const event = expedition({ captured: [129, 87, 87].map((speciesId) => ({ speciesId })) });
    expect(advanceQuest(ctx, artikodin, { step: 0, count: 13 }, twoBadges, event)).toEqual({
      step: 1,
      count: 0,
    });
  });

  it('valide une expédition avec assez de Pokémon du type et de la PE demandés', () => {
    const condition = quest('artikodin').steps[2]!.condition;
    if (condition.type !== 'expedition') throw new Error('étape inattendue');
    const strong = member('a', 87, 50);
    const weak = member('b', 87, 5);
    expect(pokemonPower(ctx.species(87)!, strong)).toBeGreaterThanOrEqual(400);
    const at = (team: QuestEvent['team'], zoneId = 'iles-ecume') =>
      eventProgress(ctx, condition, expedition({ zoneId, team }));
    expect(at([strong, member('c', 91, 50)])).toBe(1);
    expect(at([strong, weak])).toBe(0);
    expect(at([strong, member('d', 129, 50)])).toBe(0);
    expect(at([strong, member('c', 91, 50)], 'route-1')).toBe(0);
  });

  it('valide paresseusement les étapes « état » et s’arrête à la première non remplie', () => {
    const mewtwo = quest('mewtwo');
    const champion = progress({ defeatedTrainerIds: new Set(['maitre-blue']) });
    expect(advanceQuest(ctx, mewtwo, NEW_QUEST, progress())).toEqual({ step: 0, count: 0 });
    // Étape 2 : les trois quêtes des oiseaux (condition combinée), pas encore terminées.
    expect(advanceQuest(ctx, mewtwo, NEW_QUEST, champion)).toEqual({ step: 1, count: 0 });
    const birds = new Map([
      ['artikodin', 3],
      ['electhor', 4],
      ['sulfura', 3],
    ]);
    expect(advanceQuest(ctx, mewtwo, NEW_QUEST, { ...champion, questSteps: birds })).toEqual({
      step: 2,
      count: 0,
    });
    birds.set('sulfura', 2);
    expect(advanceQuest(ctx, mewtwo, NEW_QUEST, { ...champion, questSteps: birds }).step).toBe(1);
  });

  it('calcule les étapes validées, quêtes dépendantes comprises', () => {
    const records = new Map([['mewtwo', { step: 4, count: 0 }]]);
    const fourBadges = progress({
      defeatedTrainerIds: new Set(['pierre', 'ondine', 'major-bob', 'erika']),
    });
    const steps = questStepsDone(ctx, fourBadges, records);
    expect(steps.get('mewtwo')).toBe(4);
    // Mew se débloque quand Mewtwo est terminé ; son étape 1 (20 œufs) n'est pas remplie.
    expect(steps.get('mew')).toBe(0);
    // Électhor s'ouvre au 4e badge (étape 1 : des captures), Artikodin au 5e.
    expect(steps.get('electhor')).toBe(0);
    expect(steps.has('artikodin')).toBe(false);
    expect(questStepsDone(ctx, progress(), new Map()).size).toBe(0);
  });

  it('ouvre les zones de quête selon les étapes validées', () => {
    const grotte = ctx.zone('grotte-azuree')!;
    const at = (step: number) =>
      isZoneUnlocked(ctx, grotte, { ...twoBadges, questSteps: new Map([['mewtwo', step]]) });
    expect(at(2)).toBe(false);
    expect(at(3)).toBe(true);
  });

  it('donne un statut à chaque quête', () => {
    const q = quest('artikodin');
    expect(questStatus(q, undefined, false)).toBe('locked');
    expect(questStatus(q, 1, false)).toBe('active');
    expect(questStatus(q, 3, false)).toBe('completed');
    expect(questStatus(q, 3, true)).toBe('claimed');
  });
});

describe('récompenses de quête', () => {
  it('garantit les IV parfaits du légendaire offert', () => {
    for (let seed = 0; seed < 50; seed++) {
      const p = generateQuestPokemon(
        ctx,
        createRng(seed),
        { speciesId: 150, level: 70, perfectIvs: 3 },
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
      c.quests[0]!.rewards.expeditionSlots = 1;
    });
    const base = { milestoneIds: new Set<string>(), collectionIds: new Set<string>() };
    const before = playerSlots(custom, base).expeditions;
    expect(playerSlots(custom, { ...base, questIds: new Set(['artikodin']) }).expeditions).toBe(
      before + 1,
    );
  });
});
