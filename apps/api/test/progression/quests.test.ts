import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { seedContent } from '@poke/content/seed';
import { inventory, pokemon, questProgress } from '@poke/db';
import type {
  ClaimExpeditionResponse,
  ClaimQuestResponse,
  ExpeditionDto,
  InventoryEntryDto,
  LegendaryBattleDto,
  LegendaryBattlesResponse,
  LegendaryCaptureResponse,
  PokemonDto,
  QuestsResponse,
  UseItemResponse,
} from '@poke/shared';
import { legendaryBattle } from '@poke/content';
import { testApi } from '../support/api';

// Quête de test : 1 capture, 1 expédition sur la Route 1, puis 2 objets de quête sur la Route 1 ;
// la Forêt de Jade ouvre à l'étape 2. Deux légendaires faibles à combattre : Mew (capture presque
// impossible, sauf Master Ball) puis Mewtwo (capture assurée).
const content = structuredClone(seedContent);
content.balance.capture.globalMultiplier = 1000;
content.quests.push({
  id: 'quete-test',
  order: 10,
  name: 'Quête de test',
  description: '',
  image: null,
  regionId: 'kanto',
  enabled: true,
  unlock: { type: 'always' },
  steps: [
    {
      name: 'Capturer',
      description: '',
      condition: {
        type: 'catchPokemon',
        count: 1,
        pokemonType: null,
        speciesId: null,
        zoneId: null,
      },
      outcome: '',
    },
    {
      name: 'Explorer',
      description: '',
      condition: {
        type: 'expedition',
        zoneId: 'route-1',
        count: 1,
        memberType: null,
        memberCount: 1,
        minMemberPower: 0,
        speciesIds: [],
        weathers: [],
        timeOfDay: null,
      },
      outcome: '',
    },
    {
      name: 'Chercher',
      description: '',
      condition: {
        type: 'questItem',
        itemId: 'fragment-magnetique',
        count: 2,
        zoneId: 'route-1',
        chance: 100,
        memberType: null,
        memberCount: 0,
        minMemberPower: 0,
        speciesIds: [],
        weathers: [],
        timeOfDay: null,
      },
      outcome: '',
    },
  ],
  rewards: {
    currency: 500,
    items: [{ itemId: 'bottle-cap', quantity: 1 }],
    expeditionSlots: 1,
    daycareSlots: 0,
    incubators: 0,
    bonuses: [],
    pokemon: [
      {
        speciesId: 151,
        level: 50,
        perfectIvs: 3,
        battle: legendaryBattle({
          level: 2,
          iv: 0,
          hpMultiplier: 1,
          statMultiplier: 0.1,
          timeLimitSeconds: 60,
          captureChance: 0.0001,
        }),
        roaming: null,
      },
      {
        speciesId: 150,
        level: 70,
        perfectIvs: 3,
        battle: legendaryBattle({
          level: 2,
          iv: 0,
          hpMultiplier: 1,
          statMultiplier: 0.1,
          timeLimitSeconds: 60,
          captureChance: 100,
        }),
        roaming: null,
      },
    ],
  },
});
// Quête qui suit la quête de test : ouverte (et validée) quand celle-ci est terminée.
content.quests.push({
  ...structuredClone(content.quests.at(-1)!),
  id: 'quete-suite',
  unlock: { type: 'questCompleted', questId: 'quete-test' },
  steps: [
    {
      name: 'Suite',
      description: '',
      condition: { type: 'questCompleted', questId: 'quete-test' },
      outcome: '',
    },
  ],
});
// Quête désactivée : jamais visible, même si sa condition est remplie.
content.quests.push({
  ...structuredClone(content.quests.at(-1)!),
  id: 'quete-desactivee',
  enabled: false,
  unlock: { type: 'always' },
});
const foret = content.zones.find((z) => z.id === 'foret-de-jade')!;
foret.minPower = 0;
foret.unlock = { type: 'questStepsDone', questId: 'quete-test', count: 1 };

const api = testApi({ start: '2026-10-07T10:00:00Z', content: content });
const { handle, advance, newPlayer } = api;

describe('quêtes', () => {
  let call: Awaited<ReturnType<typeof newPlayer>>['call'];
  let userId: string;
  let starter: PokemonDto;

  beforeAll(async () => {
    ({ call, userId, starter } = await newPlayer('quete@example.com', 'Quêteur', 7));
  });

  const quest = async () =>
    (await call<QuestsResponse>('GET', '/api/quests')).body.quests.find(
      (q) => q.questId === 'quete-test',
    );
  const ballCount = async () =>
    (await call<InventoryEntryDto[]>('GET', '/api/inventory')).body.find(
      (i) => i.itemId === 'poke-ball',
    )?.quantity ?? 0;

  async function run(zoneId: string) {
    const started = await call<ExpeditionDto>('POST', '/api/expeditions', {
      zoneId,
      team: [starter.id],
      balls: { new: 'poke-ball', shiny: 'poke-ball', caught: 'poke-ball' },
      berryItemId: null,
    });
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    advance(15);
    const claimed = await call<ClaimExpeditionResponse>(
      'POST',
      `/api/expeditions/${started.body.id}/claim`,
    );
    expect(claimed.status).toBe(200);
    return claimed.body;
  }

  it('affiche les quêtes débloquées seulement', async () => {
    const { body } = await call<QuestsResponse>('GET', '/api/quests');
    // Les quêtes légendaires du seed demandent 2 badges.
    expect(body.quests.map((q) => q.questId)).toEqual(['quete-test']);
    expect(body.quests[0]).toMatchObject({ status: 'active', step: 0, count: 0 });
  });

  it('fait avancer les étapes avec les expéditions, sans double comptage', async () => {
    const locked = await call('POST', '/api/expeditions', {
      zoneId: 'foret-de-jade',
      team: [starter.id],
      balls: { new: null, shiny: null, caught: null },
      berryItemId: null,
    });
    expect(locked.status).toBe(403);

    const first = await run('route-1');
    expect(first.captured.length).toBeGreaterThan(0);
    // L'expédition valide l'étape 1 (capture) mais ne compte pas pour l'étape 2.
    expect(await quest()).toMatchObject({ status: 'active', step: 1, count: 0 });

    // L'étape 1 validée ouvre la Forêt de Jade.
    await run('foret-de-jade');
    expect(await quest()).toMatchObject({ step: 1, count: 0 });
    await run('route-1');
    expect(await quest()).toMatchObject({ status: 'active', step: 2, count: 0 });

    // Étape 3 : une chance sur une par rencontre, sans dépasser les 2 objets demandés.
    const found = await run('route-1');
    expect(found.expedition.result!.questItems).toEqual([
      { itemId: 'fragment-magnetique', quantity: 2 },
    ]);
    const bag = await call<InventoryEntryDto[]>('GET', '/api/inventory');
    expect(bag.body.find((i) => i.itemId === 'fragment-magnetique')?.quantity).toBe(2);
    expect(await quest()).toMatchObject({ status: 'completed', step: 3 });
  });

  const legendaryRun = { team: [] as string[], moves: [{ type: 'water', category: 'special' }] };
  const legendary = async () =>
    (await call<LegendaryBattlesResponse>('GET', '/api/legendary-battles')).body;

  it('donne la récompense une seule fois, sans le Pokémon (à combattre ensuite)', async () => {
    legendaryRun.team = [starter.id];
    const early = await call<{ error: string }>(
      'POST',
      '/api/quests/quete-test/battle',
      legendaryRun,
    );
    expect(early.body.error).toBe('QUEST_NOT_CLAIMED');

    const before = await call<{ profile: { currency: number } }>('GET', '/api/me');
    const claimed = await call<ClaimQuestResponse>('POST', '/api/quests/quete-test/claim');
    expect(claimed.status, JSON.stringify(claimed.body)).toBe(200);
    expect(claimed.body).not.toHaveProperty('pokemon');
    expect(claimed.body.currency).toBe(before.body.profile.currency + 500);
    expect(claimed.body.slots.expeditions).toBe(seedContent.balance.expeditions.initialSlots + 1);
    expect(await quest()).toMatchObject({ status: 'claimed', pokemonCaught: 0 });

    const again = await call<{ error: string }>('POST', '/api/quests/quete-test/claim');
    expect(again.body.error).toBe('ALREADY_CLAIMED');
  });

  async function fight(): Promise<LegendaryBattleDto> {
    const started = await call<LegendaryBattleDto>(
      'POST',
      '/api/quests/quete-test/battle',
      legendaryRun,
    );
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    return started.body;
  }

  it('combat légendaire : fuite, délai, victoire, Ball ratée puis capture', async () => {
    expect((await legendary()).quests).toEqual([
      {
        questId: 'quete-test',
        pokemonIndex: 0,
        attempts: 0,
        retryAt: null,
        pendingCapture: null,
      },
    ]);
    const first = await fight();
    expect(first).toMatchObject({ questId: 'quete-test', pokemonIndex: 0, outcome: null });
    expect(first.setup.enemies).toMatchObject([{ speciesId: 151, level: 2 }]);
    // L'équipe est occupée pendant le combat.
    const busy = await call<{ error: string }>('POST', '/api/expeditions', {
      zoneId: 'route-1',
      team: [starter.id],
      balls: { new: null, shiny: null, caught: null },
      berryItemId: null,
    });
    expect(busy.body.error).toBe('POKEMON_BUSY');
    const twice = await call<{ error: string }>(
      'POST',
      '/api/quests/quete-test/battle',
      legendaryRun,
    );
    expect(twice.body.error).toBe('BATTLE_BUSY');

    // Fuite : aucune XP, et le délai avant de retenter commence.
    const fled = await call<{ battle: LegendaryBattleDto }>(
      'POST',
      `/api/legendary-battles/${first.id}/flee`,
    );
    expect(fled.body.battle).toMatchObject({ outcome: 'fled', captured: null });
    expect(fled.body.battle.endedAt).not.toBeNull();
    const cooldown = await call<{ error: string }>(
      'POST',
      '/api/quests/quete-test/battle',
      legendaryRun,
    );
    expect(cooldown.body.error).toBe('LEGENDARY_COOLDOWN');
    expect((await legendary()).quests[0]).toMatchObject({ attempts: 1 });
    expect((await legendary()).quests[0]!.retryAt).not.toBeNull();

    // Victoire : le légendaire attend la Ball.
    advance(60);
    const second = await fight();
    advance(2);
    const won = await call<{ battle: LegendaryBattleDto }>(
      'POST',
      `/api/legendary-battles/${second.id}/claim`,
    );
    expect(won.body.battle).toMatchObject({ outcome: 'win', captured: null, endedAt: null });
    expect(won.body.battle.result!.xpPerMember).toBeGreaterThan(0);
    expect((await legendary()).quests[0]).toMatchObject({ pendingCapture: { id: second.id } });
    const waiting = await call<{ error: string }>(
      'POST',
      '/api/quests/quete-test/battle',
      legendaryRun,
    );
    expect(waiting.body.error).toBe('LEGENDARY_AWAITS_BALL');

    // Ball ratée (chance quasi nulle) : il s'enfuit, nouveau délai.
    const balls = await ballCount();
    const missed = await call<LegendaryCaptureResponse>(
      'POST',
      `/api/legendary-battles/${second.id}/capture`,
      { ballItemId: 'poke-ball' },
    );
    expect(missed.status, JSON.stringify(missed.body)).toBe(200);
    expect(missed.body).toMatchObject({ pokemon: null, battle: { captured: false } });
    expect(await ballCount()).toBe(balls - 1);
    const twiceBall = await call<{ error: string }>(
      'POST',
      `/api/legendary-battles/${second.id}/capture`,
      { ballItemId: 'poke-ball' },
    );
    expect(twiceBall.body.error).toBe('NOTHING_TO_CAPTURE');
    expect(await quest()).toMatchObject({ pokemonCaught: 0 });

    // Master Ball : capture assurée ; la quête passe à Mewtwo.
    await handle.db
      .insert(inventory)
      .values({ ownerId: userId, itemId: 'master-ball', quantity: 1 });
    advance(60);
    const third = await fight();
    advance(2);
    await call('POST', `/api/legendary-battles/${third.id}/claim`);
    const mew = await call<LegendaryCaptureResponse>(
      'POST',
      `/api/legendary-battles/${third.id}/capture`,
      { ballItemId: 'master-ball' },
    );
    expect(mew.body.pokemon).toMatchObject({
      speciesId: 151,
      level: 50,
      origin: 'quest',
      isShiny: third.isShiny,
    });
    expect(await quest()).toMatchObject({ pokemonCaught: 1 });

    // Mewtwo : pas de délai (nouveau légendaire), capture assurée par sa chance de combat.
    const fourth = await fight();
    expect(fourth).toMatchObject({ pokemonIndex: 1 });
    advance(2);
    await call('POST', `/api/legendary-battles/${fourth.id}/claim`);
    const mewtwo = await call<LegendaryCaptureResponse>(
      'POST',
      `/api/legendary-battles/${fourth.id}/capture`,
      { ballItemId: 'poke-ball' },
    );
    expect(mewtwo.body.pokemon).toMatchObject({ speciesId: 150, level: 70, origin: 'quest' });
    expect(
      Object.values(mewtwo.body.pokemon!.ivs).filter((iv) => iv === 31).length,
    ).toBeGreaterThanOrEqual(3);
    expect(await quest()).toMatchObject({ pokemonCaught: 2 });
    expect((await legendary()).quests).toEqual([]);

    const done = await call<{ error: string }>(
      'POST',
      '/api/quests/quete-test/battle',
      legendaryRun,
    );
    expect(done.body.error).toBe('QUEST_POKEMON_CAUGHT');

    // Relâcher : seulement le dernier légendaire capturé de la quête, sans Bonbon ; la quête le
    // propose de nouveau (combat et capture à refaire).
    const notLast = await call<{ error: string }>(
      'POST',
      `/api/pokemon/${mew.body.pokemon!.id}/release`,
    );
    expect(notLast.body.error).toBe('NOT_RELEASABLE');
    const released = await call<{ questId: string }>(
      'POST',
      `/api/pokemon/${mewtwo.body.pokemon!.id}/release`,
    );
    expect(released.status, JSON.stringify(released.body)).toBe(200);
    expect(released.body).toEqual({ questId: 'quete-test', restarted: false });
    expect(await quest()).toMatchObject({ pokemonCaught: 1 });
    const pc = await call<PokemonDto[]>('GET', '/api/pokemon');
    expect(pc.body.some((p) => p.id === mewtwo.body.pokemon!.id)).toBe(false);
    const again = await call<{ error: string }>(
      'POST',
      `/api/pokemon/${mewtwo.body.pokemon!.id}/release`,
    );
    expect(again.body.error).toBe('POKEMON_NOT_FOUND');
    const rematch = await fight();
    expect(rematch).toMatchObject({ pokemonIndex: 1 });
    // Combat de la quête en cours : Mew (redevenu le dernier capturé) attend qu'il se termine.
    const busyQuest = await call<{ error: string }>(
      'POST',
      `/api/pokemon/${mew.body.pokemon!.id}/release`,
    );
    expect(busyQuest.body.error).toBe('LEGENDARY_BATTLE_RUNNING');
    advance(2);
    await call('POST', `/api/legendary-battles/${rematch.id}/claim`);
    const recaught = await call<LegendaryCaptureResponse>(
      'POST',
      `/api/legendary-battles/${rematch.id}/capture`,
      { ballItemId: 'poke-ball' },
    );
    expect(recaught.body.pokemon).toMatchObject({ speciesId: 150 });
    expect(await quest()).toMatchObject({ pokemonCaught: 2, restartOnRelease: false });
  });

  it('refuse une quête verrouillée ou inconnue', async () => {
    expect((await call('POST', '/api/quests/mewtwo/claim')).status).toBe(409);
    expect((await call('POST', '/api/quests/inconnue/claim')).status).toBe(404);
  });

  it('relâcher un légendaire capturé avant la réécriture des quêtes la fait recommencer', async () => {
    // Électhor capturé avec l'ancienne quête (marqué par la migration 0132).
    const [current] = await handle.db
      .select({ contentVersionId: questProgress.contentVersionId })
      .from(questProgress)
      .where(eq(questProgress.ownerId, userId));
    const at = new Date(api.clock);
    await handle.db.insert(questProgress).values({
      ownerId: userId,
      questId: 'electhor',
      contentVersionId: current!.contentVersionId,
      step: 5,
      completedAt: at,
      claimedAt: at,
      pokemonCaught: 1,
      restartOnRelease: true,
    });
    const [zapdos] = await handle.db
      .insert(pokemon)
      .values({
        ownerId: userId,
        speciesId: 145,
        level: 50,
        ivHp: 31,
        ivAtk: 31,
        ivDef: 31,
        ivSpa: 31,
        ivSpd: 31,
        ivSpe: 31,
        nature: 'hardy',
        ability: 'pressure',
        gender: 'genderless',
        origin: 'quest',
      })
      .returning();
    const released = await call<{ questId: string; restarted: boolean }>(
      'POST',
      `/api/pokemon/${zapdos!.id}/release`,
    );
    expect(released.body).toEqual({ questId: 'electhor', restarted: true });
    // Toute la quête est à refaire : plus d'avancement (elle repartira de l'étape 0).
    const rows = await handle.db
      .select()
      .from(questProgress)
      .where(and(eq(questProgress.ownerId, userId), eq(questProgress.questId, 'electhor')));
    expect(rows).toEqual([]);
    expect((await call('POST', '/api/quests/electhor/battle', legendaryRun)).status).toBe(409);
  });

  it('une quête terminée avant d’avoir gagné des étapes compte toujours comme terminée', async () => {
    // Comme les quêtes légendaires gardées par 0132 : terminées à l'étape 3 de l'ancienne version.
    const other = await newPlayer('quete-ancienne@example.com', 'Ancien', 1);
    const [current] = await handle.db
      .select({ contentVersionId: questProgress.contentVersionId })
      .from(questProgress)
      .where(eq(questProgress.ownerId, userId));
    const at = new Date(api.clock);
    await handle.db.insert(questProgress).values({
      ownerId: other.userId,
      questId: 'quete-test',
      contentVersionId: current!.contentVersionId,
      step: 1,
      completedAt: at,
      claimedAt: at,
      pokemonCaught: 2,
    });
    const { body } = await other.call<QuestsResponse>('GET', '/api/quests');
    expect(body.quests.find((q) => q.questId === 'quete-test')).toMatchObject({
      status: 'claimed',
      step: 3,
    });
    expect(body.quests.find((q) => q.questId === 'quete-suite')).toMatchObject({
      status: 'completed',
      step: 1,
    });
  });

  it('cache les régions, zones et quêtes désactivées', async () => {
    const res = await api.app.inject({ method: 'GET', url: '/api/content' });
    const playable = res.json<typeof content>();
    expect(playable.regions.map((r) => r.id)).toEqual(['kanto', 'johto', 'hoenn']);
    expect(playable.zones.map((z) => z.id)).not.toContain('route-201');
    expect(playable.quests.map((q) => q.id)).not.toContain('quete-desactivee');

    const sinnoh = await call('POST', '/api/expeditions', {
      zoneId: 'route-201',
      team: [starter.id],
      balls: { new: null, shiny: null, caught: null },
      berryItemId: null,
    });
    expect(sinnoh.status).toBe(404);
    const { body } = await call<QuestsResponse>('GET', '/api/quests');
    expect(body.quests.map((q) => q.questId)).not.toContain('quete-desactivee');
    expect((await call('POST', '/api/quests/quete-desactivee/claim')).status).toBe(404);
  });

  describe('objets endgame', () => {
    let target: PokemonDto;

    beforeAll(async () => {
      const list = await call<PokemonDto[]>('GET', '/api/pokemon');
      target = list.body.find((p) => p.speciesId === 150)!;
      await handle.db.insert(inventory).values([
        { ownerId: userId, itemId: 'adamant-mint', quantity: 1 },
        { ownerId: userId, itemId: 'ability-patch', quantity: 1 },
        { ownerId: userId, itemId: 'ability-capsule', quantity: 2 },
      ]);
    });

    it('Capsule d’Argent : un IV choisi passe à 31, l’objet est consommé', async () => {
      const stat = (Object.keys(target.ivs) as (keyof PokemonDto['ivs'])[]).find(
        (s) => target.ivs[s] < 31,
      );
      if (!stat) return; // IV déjà parfaits : rien à tester avec ce seed
      const used = await call<UseItemResponse>('POST', `/api/pokemon/${target.id}/use-item`, {
        itemId: 'bottle-cap',
        stat,
      });
      expect(used.status, JSON.stringify(used.body)).toBe(200);
      expect(used.body.pokemon.ivs[stat]).toBe(31);
      expect(used.body.remaining).toBe(0);
      const none = await call<{ error: string }>('POST', `/api/pokemon/${target.id}/use-item`, {
        itemId: 'bottle-cap',
        stat,
      });
      expect(none.body.error).toBe('NO_EFFECT');
    });

    it('Aromate et Patch Talent', async () => {
      const mint = await call<UseItemResponse>('POST', `/api/pokemon/${target.id}/use-item`, {
        itemId: 'adamant-mint',
      });
      if (target.nature === 'adamant') {
        expect(mint.status).toBe(400);
      } else {
        expect(mint.body.pokemon).toMatchObject({
          nature: 'adamant',
          originalNature: target.nature,
        });
      }
      // Le Pokémon reçu en récompense arrive sans talent.
      expect(target.ability).toBe('');
      const patch = await call<UseItemResponse>('POST', `/api/pokemon/${target.id}/use-item`, {
        itemId: 'ability-patch',
      });
      expect(patch.status).toBe(200);
      expect(patch.body.pokemon.ability).toBe('unnerve');
      const [left] = await handle.db
        .select()
        .from(inventory)
        .where(and(eq(inventory.ownerId, userId), eq(inventory.itemId, 'ability-patch')));
      expect(left?.quantity).toBe(0);
      // Pilule Talent : Mewtwo n'a qu'un talent normal, Pression ; une seconde Pilule est sans effet.
      const pill = await call<UseItemResponse>('POST', `/api/pokemon/${target.id}/use-item`, {
        itemId: 'ability-capsule',
      });
      expect(pill.body.pokemon.ability).toBe('pressure');
      const again = await call<{ error: string }>('POST', `/api/pokemon/${target.id}/use-item`, {
        itemId: 'ability-capsule',
      });
      expect(again.body.error).toBe('NO_EFFECT');
    });

    it('refuse un Pokémon occupé ou un objet sans effet sur les Pokémon', async () => {
      const ball = await call<{ error: string }>('POST', `/api/pokemon/${starter.id}/use-item`, {
        itemId: 'poke-ball',
      });
      expect(ball.body.error).toBe('NOT_USABLE_ON_POKEMON');
      await call('POST', '/api/expeditions', {
        zoneId: 'route-1',
        team: [target.id],
        balls: { new: null, shiny: null, caught: null },
        berryItemId: null,
      });
      const busy = await call<{ error: string }>('POST', `/api/pokemon/${target.id}/use-item`, {
        itemId: 'gold-bottle-cap',
      });
      expect(busy.body.error).toBe('POKEMON_BUSY');
    });
  });
});
