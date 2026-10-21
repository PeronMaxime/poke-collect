import { describe, expect, it } from 'vitest';
import { captureProbability, checkTeam, countAffinity } from './expedition';
import { MAX_IV, pokemonPower } from './pokemon';
import type { PlayerProgress } from './progress';
import { isZoneUnlocked } from './progress';
import { playerSlots } from './progression';
import {
  advanceQuest,
  eventProgress,
  generateQuestPokemon,
  NEW_QUEST,
  legendarySite,
  questStatus,
  questStepsDone,
  questEncounter,
  resolveQuestExpedition,
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
      c.quests[0]!.rewards.expeditionSlots = 1;
    });
    const base = { milestoneIds: new Set<string>(), collectionIds: new Set<string>() };
    const before = playerSlots(custom, base).expeditions;
    expect(playerSlots(custom, { ...base, questIds: new Set(['artikodin']) }).expeditions).toBe(
      before + 1,
    );
  });
});

describe('expédition légendaire', () => {
  const artikodin = quest('artikodin');
  const target = artikodin.rewards.pokemon[0]!;
  const site = legendarySite(artikodin, target);
  const team = [member('a', 59, 50), member('b', 19, 50)]; // Arcanin (Feu), Rattata
  const input = { target, seed: 7, team, ballItemId: 'ultra-ball', berryItemId: null };

  it('règles du repaire : région de la quête, PE minimale, durée et affinités configurées', () => {
    expect(site).toMatchObject({
      regionId: 'kanto',
      minPower: target.expedition.minPower,
      durationsMinutes: [240],
    });
    expect(countAffinity(ctx, site, team)).toBe(1); // le Feu, faiblesse d'Artikodin
    expect(checkTeam(ctx, site, 240, [member('c', 152, 50)]).errors).toContainEqual(
      expect.objectContaining({ code: 'WRONG_REGION' }), // Germignon : Pokédex de Johto
    );
    expect(
      checkTeam(ctx, { ...site, regionId: null }, 240, [member('c', 152, 100)]).errors,
    ).not.toContainEqual(expect.objectContaining({ code: 'WRONG_REGION' }));
  });

  it('Calque : le porteur compte comme ayant le type d’affinité de la zone', () => {
    const withTrace = testContext((c) => {
      c.abilities = [
        { id: 'trace', description: '', effects: [{ type: 'copyZoneAffinity', conditions: [] }] },
      ];
    });
    const traced = [member('a', 59, 50), member('b', 19, 50, { ability: 'trace' })];
    expect(countAffinity(withTrace, site, traced)).toBe(2);
    expect(countAffinity(withTrace, { ...site, affinityTypes: [] }, traced)).toBe(0);
  });

  it('une seule rencontre, une seule Ball, avec la formule de capture des expéditions', () => {
    const result = resolveQuestExpedition(ctx, input);
    expect(result.encounters).toHaveLength(1);
    expect(result).toMatchObject({ ballsUsed: 1, berriesUsed: 0, loot: [] });
    const [encounter] = result.encounters;
    expect(encounter).toMatchObject({ speciesId: 144, level: target.level });
    expect(encounter!.captureChance).toBeCloseTo(
      captureProbability(ctx, {
        captureRate: ctx.species(144)!.captureRate,
        ballMultiplier: ctx.itemEffect('ultra-ball', 'ball')!.catchMultiplier,
        affinityCount: 1,
      }),
    );
    expect(result.team.every((m) => m.xpGained > 0)).toBe(true);
    // Déterministe : même seed, même issue.
    expect(resolveQuestExpedition(ctx, input)).toEqual(result);
  });

  it('capturé : IV parfaits garantis ; échappé : aucun Pokémon', () => {
    const outcomes = Array.from(
      { length: 300 },
      (_, seed) => resolveQuestExpedition(ctx, { ...input, seed }).encounters[0]!,
    );
    const caught = outcomes.filter((e) => e.outcome === 'captured');
    expect(caught.length).toBeGreaterThan(0);
    expect(caught.length).toBeLessThan(outcomes.length);
    for (const e of caught) {
      expect(
        Object.values(e.pokemon!.ivs).filter((iv) => iv === MAX_IV).length,
      ).toBeGreaterThanOrEqual(target.perfectIvs);
    }
    expect(outcomes.filter((e) => e.outcome === 'escaped').every((e) => !e.pokemon)).toBe(true);
  });

  it('la baie augmente la chance de capture et est consommée', () => {
    const berry = ctx.content.items.find((i) => ctx.itemEffect(i.id, 'captureBoost'))!;
    const without = resolveQuestExpedition(ctx, input);
    const withBerry = resolveQuestExpedition(ctx, { ...input, berryItemId: berry.id });
    expect(withBerry.berriesUsed).toBe(1);
    expect(withBerry.encounters[0]!.captureChance).toBeGreaterThan(
      without.encounters[0]!.captureChance,
    );
  });

  it('fuir : le même légendaire vu, ni Ball ni XP pour l’équipe', () => {
    const fled = resolveQuestExpedition(ctx, { ...input, ballItemId: null });
    expect(fled).toMatchObject({ ballsUsed: 0, berriesUsed: 0, xpPerMember: 0, team: [] });
    expect(fled.encounters[0]).toMatchObject({ outcome: 'fled', speciesId: 144 });
    expect(fled.encounters[0]!.pokemon).toBeUndefined();
    expect(fled.encounters[0]!.isShiny).toBe(questEncounter(ctx, input).pokemon.isShiny);
  });

  it('la chaîne ne touche qu’au taux shiny : les IV parfaits restent ceux de la récompense', () => {
    for (let seed = 0; seed < 50; seed++) {
      const base = questEncounter(ctx, { target, seed });
      const chained = questEncounter(ctx, { target, seed, shiny: { chain: 999 } });
      expect(chained.shinyChance).toBeGreaterThan(base.shinyChance);
      expect(chained.pokemon.ivs).toEqual(base.pokemon.ivs);
    }
  });
});
