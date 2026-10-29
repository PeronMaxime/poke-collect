import { species } from '@poke/data';
import { describe, expect, it } from 'vitest';
import { contentIssues, findUsages, gameContentSchema } from './integrity';
import { defaultLegendaryExpedition } from './schemas';
import { seedContent } from './seed';
import { formIdOf } from './seed-expansion';

/** Espèces obtenables : rencontres de toutes les régions (sans formes), fossiles et quêtes, puis
 * leurs évolutions et leurs œufs (les bébés : Pichu, Azurill…), jusqu'à stabilité. */
function obtainableSpecies(): Set<number> {
  const obtainable = new Set([
    ...seedContent.zones.flatMap((z) =>
      z.encounters.filter((e) => !e.formId).map((e) => e.speciesId),
    ),
    ...seedContent.items.flatMap((i) =>
      i.effects.flatMap((e) => (e.type === 'fossil' ? [e.speciesId] : [])),
    ),
    ...seedContent.quests.flatMap((q) => q.rewards.pokemon.map((p) => p.speciesId)),
  ]);
  const bySpecies = new Map(species.map((s) => [s.id, s]));
  const base = (id: number): number => {
    const from = bySpecies.get(id)?.evolvesFromSpeciesId;
    return from ? base(from) : id;
  };
  let size = 0;
  while (size !== obtainable.size) {
    size = obtainable.size;
    for (const s of species) {
      if (s.evolvesFromSpeciesId && obtainable.has(s.evolvesFromSpeciesId)) obtainable.add(s.id);
      if (obtainable.has(s.id) && !s.eggGroups.includes('no-eggs')) obtainable.add(base(s.id));
    }
  }
  return obtainable;
}

describe('seedContent', () => {
  it('respecte le schéma du contenu, sans erreur de cohérence', () => {
    expect(gameContentSchema.parse(seedContent)).toEqual(seedContent);
    expect(contentIssues(seedContent).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('rend obtenables les 151 espèces de Kanto', () => {
    // Rencontres de Kanto (hors formes de l'Archipel Lointain), fossiles et quêtes…
    const obtainable = new Set([
      ...seedContent.zones
        .filter((z) => z.regionId === 'kanto')
        .flatMap((z) => z.encounters.filter((e) => !e.formId).map((e) => e.speciesId)),
      ...seedContent.items.flatMap((i) =>
        i.effects.flatMap((e) => (e.type === 'fossil' ? [e.speciesId] : [])),
      ),
      ...seedContent.quests.flatMap((q) => q.rewards.pokemon.map((p) => p.speciesId)),
    ]);
    // … puis leurs évolutions.
    for (const s of [...species].sort((a, b) => a.id - b.id)) {
      if (s.evolvesFromSpeciesId && obtainable.has(s.evolvesFromSpeciesId)) obtainable.add(s.id);
    }
    const kanto = seedContent.regions.find((r) => r.id === 'kanto')!.speciesIds;
    expect(kanto.filter((id) => !obtainable.has(id))).toEqual([]);
  });

  it('rend obtenables les 100 espèces de Johto', () => {
    const obtainable = obtainableSpecies();
    const johto = seedContent.regions.find((r) => r.id === 'johto')!;
    expect(johto.speciesIds).toHaveLength(100);
    expect(johto.speciesIds.filter((id) => !obtainable.has(id))).toEqual([]);
  });

  it('rend obtenables les 135 espèces de Hoenn', () => {
    const obtainable = obtainableSpecies();
    const hoenn = seedContent.regions.find((r) => r.id === 'hoenn')!;
    expect(hoenn.speciesIds).toHaveLength(135);
    expect(hoenn.enabled).toBe(true);
    expect(hoenn.speciesIds.filter((id) => !obtainable.has(id))).toEqual([]);
  });

  it('ne compte que les badges de la région demandée', () => {
    const issues = contentIssues({
      ...seedContent,
      zones: seedContent.zones.map((z) =>
        z.id === 'route-32'
          ? { ...z, unlock: { type: 'badgeCount', count: 9, regionId: 'johto' } }
          : z,
      ),
    });
    expect(issues).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        entityId: 'route-32',
        message: 'Condition de déblocage : 9 badge(s) requis, 8 existent dans cette région',
      }),
    );
  });

  it('vérifie chaque brique d’une condition combinée', () => {
    const bad = structuredClone(seedContent);
    bad.zones.find((z) => z.id === 'dojo-karate')!.unlock = {
      type: 'allOf',
      conditions: [
        { type: 'badgeCount', count: 40 },
        { type: 'trainerDefeated', trainerId: 'personne' },
      ],
    };
    const messages = contentIssues(bad)
      .filter((i) => i.severity === 'error')
      .map((i) => `${i.entityId}: ${i.message}`);
    expect(messages).toEqual([
      'dojo-karate: Condition de déblocage : 40 badge(s) requis, 31 existent',
      'dojo-karate: Condition de déblocage : dresseur « personne » inconnu',
    ]);
    const single = {
      ...bad.zones[0]!,
      unlock: { type: 'allOf', conditions: [{ type: 'always' }] },
    };
    expect(gameContentSchema.safeParse({ ...seedContent, zones: [single] }).success).toBe(false);
  });

  it('refuse un identifiant de région invalide', () => {
    const bad = { ...seedContent, regions: [{ ...seedContent.regions[0]!, id: 'Kanto Région' }] };
    expect(gameContentSchema.safeParse(bad).success).toBe(false);
  });
});

describe('cohérence du contenu', () => {
  it('détecte les références cassées', () => {
    const bad = structuredClone(seedContent);
    bad.zones[0]!.lootTableId = 'inexistante';
    bad.zones[1]!.regionId = 'orre';
    bad.lootTables[0]!.entries.push({ itemId: 'objet-inconnu', chance: 1, min: 1, max: 1 });
    const errors = contentIssues(bad)
      .filter((i) => i.severity === 'error')
      .map((i) => `${i.entity}:${i.entityId}`);
    expect(errors).toEqual(
      expect.arrayContaining(['zone:route-1', 'zone:foret-de-jade', 'lootTable:butin-route']),
    );
    expect(gameContentSchema.safeParse(bad).success).toBe(false);
  });

  it('refuse une zone dont toutes les rencontres sont désactivées', () => {
    const bad = structuredClone(seedContent);
    bad.zones.find((z) => z.id === 'cap-azuria')!.encounters = [
      { speciesId: 129, weight: 1, minLevel: 5, maxLevel: 5 },
    ];
    bad.speciesOverrides.push({
      speciesId: 129,
      enabled: false,
      nameFr: null,
      habitat: null,
      rarity: null,
      breedable: null,
    });
    expect(contentIssues(bad)).toContainEqual(
      expect.objectContaining({ severity: 'error', entityId: 'cap-azuria' }),
    );
  });

  it('avertit pour un légendaire en rencontre classique', () => {
    const warn = structuredClone(seedContent);
    warn.zones[0]!.encounters.push({ speciesId: 150, weight: 1, minLevel: 70, maxLevel: 70 });
    expect(contentIssues(warn)).toContainEqual(
      expect.objectContaining({ severity: 'warning', entityId: 'route-1' }),
    );
  });

  it('vérifie les dresseurs', () => {
    const bad = structuredClone(seedContent);
    const tom = bad.trainers[0]!;
    tom.zoneId = 'zone-inconnue';
    tom.team[0]!.nature = 'grincheuse';
    tom.rules.requiredTypes = [{ type: 'fire', count: 1 }];
    tom.rules.forbiddenTypes = ['fire'];
    bad.trainers[1]!.unlock = { type: 'trainerDefeated', trainerId: 'personne' };
    bad.trainers[2]!.unlock = { type: 'badgeCount', count: 40 };
    const messages = contentIssues(bad)
      .filter((i) => i.severity === 'error' && i.entity === 'trainer')
      .map((i) => `${i.entityId}: ${i.message}`);
    expect(messages).toEqual([
      'gamin-tom: Zone « zone-inconnue » inconnue',
      'gamin-tom: Nature « grincheuse » inconnue',
      'gamin-tom: Un type est à la fois imposé et interdit',
      'fillette-lise: Condition de déblocage : dresseur « personne » inconnu',
      'scout-rick: Condition de déblocage : 40 badge(s) requis, 31 existent',
    ]);
    expect(
      gameContentSchema.safeParse({ ...seedContent, trainers: [{ ...tom, team: [] }] }).success,
    ).toBe(false);
  });

  it('refuse un niveau max inférieur au niveau min', () => {
    const bad = structuredClone(seedContent);
    bad.zones[0]!.encounters[0] = { speciesId: 19, weight: 1, minLevel: 9, maxLevel: 3 };
    expect(gameContentSchema.safeParse(bad).success).toBe(false);
  });

  it('liste les usages avant suppression', () => {
    expect(findUsages(seedContent, 'item', 'poke-ball')).toEqual([
      'Équilibrage : inventaire de départ',
      'Table de butin « Butin de route »',
      'Table de butin « Butin de forêt »',
      'Table de butin « Butin de grotte »',
      'Table de butin « Butin de fouilles (Kanto) »',
      'Table de butin « Butin de fouilles (Hoenn) »',
      'Table de butin « Butin de fouilles (Sinnoh) »',
      'Table de butin « Butin des berges »',
      'Article de boutique « poke-ball »',
      'Article de boutique « poke-ball-x10 »',
      'Lot de coffre « bronze-poke-ball-x100 »',
    ]);
    expect(findUsages(seedContent, 'lootTable', 'butin-mer')).toEqual([
      'Zone « Cap Azuria »',
      'Zone « Routes maritimes »',
      'Zone « Îles Écume »',
      'Zone « Routes 40 et 41 »',
      'Zone « Phare d’Oliville »',
      'Zone « Lac Colère »',
      'Zone « Tourb’Îles »',
      'Zone « Route 104 »',
      'Zone « Plage de Poivressel »',
      'Zone « Routes 105 à 108 »',
      'Zone « Épave Abandonnée »',
      'Zone « Grotte Sous-Marine »',
      'Zone « Archipel Lointain »',
      'Zone « Lac Salinas »',
      'Dresseur « Ondine »',
      'Dresseur « Hugo »',
      'Dresseur « Léna »',
      'Dresseur « Raoul »',
      'Dresseur « Marina »',
      'Dresseur « Gilles »',
      'Dresseur « Sbire »',
      'Dresseur « Sbire »',
      'Dresseur « Maëva »',
      'Dresseur « Tomas »',
      'Dresseur « Maya »',
    ]);
    // Léo et Ondine dépendent du nombre de badges, pas de Pierre directement ; la Super Ball si.
    expect(findUsages(seedContent, 'trainer', 'pierre')).toEqual([
      'Condition de déblocage de « Article Super Ball (great-ball) »',
      'Condition de déblocage de « Lot de coffre Super Ball (bronze-great-ball-x50) »',
    ]);
    expect(findUsages(seedContent, 'trainer', 'gamin-tom')).toEqual([
      'Condition de déblocage de « Lise »',
    ]);
    expect(findUsages(seedContent, 'zone', 'route-1')).toEqual([
      'Dresseur « Tom »',
      'Dresseur « Lise »',
    ]);
    expect(findUsages(seedContent, 'item', 'ultra-ball')).toEqual([
      'Table de butin « Butin des berges »',
      'Table de butin « Butin d’élite »',
      'Article de boutique « ultra-ball »',
      'Lot de coffre « bronze-ultra-ball-x20 »',
      'Lot de coffre « silver-ultra-ball-x20 »',
      'Lot de coffre « gold-ultra-ball-x20 »',
    ]);
    expect(findUsages(seedContent, 'item', 'shiny-charm')).toEqual([
    ]);
    expect(findUsages(seedContent, 'shopCategory', 'elevage')).toEqual([
      'Article de boutique « everstone »',
      'Article de boutique « destiny-knot »',
    ]);
    expect(findUsages(seedContent, 'trainer', 'ondine')).toEqual([
      'Condition de déblocage de « Article Hyper Ball (ultra-ball) »',
      'Condition de déblocage de « Lot de coffre Hyper Ball (bronze-ultra-ball-x20) »',
      'Condition de déblocage de « Lot de coffre Hyper Ball (silver-ultra-ball-x20) »',
    ]);
    expect(findUsages(seedContent, 'trainer', 'koga')).toEqual([
      'Condition de déblocage de « Quête L’oiseau de foudre, étape 3 »',
    ]);
    // Conditions combinées : chaque brique compte.
    expect(findUsages(seedContent, 'trainer', 'karateka-kiyo')).toEqual([
      'Condition de déblocage de « Dojo Karaté »',
    ]);
    expect(findUsages(seedContent, 'quest', 'sulfura')).toEqual([
      'Condition de « Mont Braise »',
      'Condition de « Quête Le Pokémon génétique, étape 2 »',
    ]);
  });

  it('vérifie la boutique', () => {
    const bad = structuredClone(seedContent);
    bad.shopEntries[0]!.itemId = 'objet-inconnu';
    bad.shopEntries[1]!.categoryId = 'soins';
    bad.shopEntries[2]!.unlock = { type: 'trainerDefeated', trainerId: 'personne' };
    bad.shopEntries.push({ ...bad.shopEntries[3]! });
    const messages = contentIssues(bad)
      .filter((i) => i.severity === 'error' && i.entity === 'shopEntry')
      .map((i) => `${i.entityId}: ${i.message}`);
    expect(messages).toEqual([
      'ultra-ball: Identifiant d’article de boutique en double',
      'poke-ball: Objet « objet-inconnu » inconnu',
      'poke-ball-x10: Catégorie « soins » inconnue',
      'great-ball: Condition de déblocage : dresseur « personne » inconnu',
    ]);
  });

  it('refuse des dates de disponibilité inversées', () => {
    const bad = structuredClone(seedContent);
    bad.shopEntries[0]!.availableFrom = '2026-10-10T00:00:00Z';
    bad.shopEntries[0]!.availableUntil = '2026-10-01T00:00:00Z';
    expect(gameContentSchema.safeParse(bad).success).toBe(false);
  });

  it('vérifie les évolutions', () => {
    const bad = structuredClone(seedContent);
    bad.evolutionOverrides[0]!.methods[0]!.itemId = 'pierre-inconnue';
    bad.evolutionOverrides.push({ ...bad.evolutionOverrides[1]! });
    bad.balance.evolution.tradeItemId = 'cable-inconnu';
    const messages = contentIssues(bad)
      .filter((i) => i.severity === 'error')
      .map((i) => `${i.entity}:${i.entityId}: ${i.message}`);
    expect(messages).toEqual(
      expect.arrayContaining([
        'evolutionOverride:281-475: Surcharge d’évolution en double',
        'evolutionOverride:108-463: Objet « pierre-inconnue » inconnu',
        'balance:null: Évolutions : objet de remplacement de l’échange « cable-inconnu » inconnu',
      ]),
    );
    expect(findUsages(seedContent, 'item', 'linking-cord')).toEqual([
      'Article de boutique « linking-cord »',
      'Équilibrage : objet qui remplace l’échange',
      'Évolution « 588-589 »',
      'Évolution « 616-617 »',
    ]);
    expect(findUsages(seedContent, 'item', 'dawn-stone')).toContain('Évolution « 281-475 »');
  });

  it('refuse une surcharge d’évolution mal identifiée ou sans méthode', () => {
    const bad = structuredClone(seedContent);
    bad.evolutionOverrides[0]!.id = '1-2';
    expect(gameContentSchema.safeParse(bad).success).toBe(false);
    const empty = structuredClone(seedContent);
    empty.evolutionOverrides[0]!.methods = [];
    expect(gameContentSchema.safeParse(empty).success).toBe(false);
    empty.evolutionOverrides[0]!.enabled = false;
    expect(gameContentSchema.safeParse(empty).success).toBe(true);
  });

  it('vérifie les collections', () => {
    const bad = structuredClone(seedContent);
    bad.collections[2]!.rewards.items.push({ itemId: 'objet-inconnu', quantity: 1 });
    bad.collections[0]!.speciesIds.push(9999);
    bad.collections[0]!.formIds.push(999_999);
    bad.collections[0]!.regionId = 'orre';
    bad.collections[1]!.rewards.expeditionSlots = 6;
    const issues = contentIssues(bad).map((i) => `${i.severity}:${i.entityId}: ${i.message}`);
    expect(issues).toEqual(
      expect.arrayContaining([
        `error:${bad.collections[2]!.id}: Récompense : objet « objet-inconnu » inconnu`,
        'error:formes-pikachu: Espèces inconnues : 9999',
        'error:formes-pikachu: Formes inconnues : 999999',
        'error:formes-pikachu: Région « orre » inconnue',
        'warning:null: Progression : 2 emplacement(s) d’expédition au-delà du maximum (sans effet)',
      ]),
    );
    expect(findUsages(seedContent, 'region', 'kanto')).toContain(
      'Condition de déblocage de « Emplacements d’expédition (+1) »',
    );
  });

  it('vérifie les formes des rencontres, dresseurs et récompenses', () => {
    const bad = structuredClone(seedContent);
    const alolanVulpix = formIdOf('vulpix-alola');
    bad.zones[0]!.encounters[0]!.formId = alolanVulpix; // Rattata
    bad.trainers[0]!.team[0]!.formId = 999_999;
    const messages = contentIssues(bad)
      .filter((i) => i.severity === 'error')
      .map((i) => `${i.entityId}: ${i.message}`);
    expect(messages).toEqual([
      expect.stringMatching(/^route-1: Goupix d.Alola n'est pas une forme de l'espèce 19$/),
      'gamin-tom: Forme 999999 inconnue',
    ]);
    // Le contenu de test utilise des formes régionales valides.
    expect(seedContent.zones.some((z) => z.encounters.some((e) => e.formId))).toBe(true);
  });

  it('vérifie les quêtes et leurs références', () => {
    const bad = structuredClone(seedContent);
    const [artikodin, electhor] = bad.quests;
    artikodin!.unlock = { type: 'questCompleted', questId: 'artikodin' };
    artikodin!.steps[0]!.condition = {
      type: 'catchPokemon',
      count: 3,
      pokemonType: 'water',
      speciesId: 25,
    };
    artikodin!.steps[2]!.condition = {
      type: 'expedition',
      zoneId: 'atlantide',
      count: 1,
      memberType: 'glace',
      memberCount: 2,
      minMemberPower: 0,
    };
    artikodin!.rewards.pokemon.push({
      speciesId: 9999,
      level: 50,
      perfectIvs: 3,
      expedition: { durationMinutes: 240, minPower: 0, requiredTypes: [], affinityTypes: ['feu'] },
      roaming: null,
    });
    electhor!.unlock = { type: 'questStepsDone', questId: 'sulfura', count: 4 };
    bad.items.find((i) => i.id === 'adamant-mint')!.effects = [{ type: 'mint', nature: 'grognon' }];
    const messages = contentIssues(bad)
      .filter((i) => i.severity === 'error')
      .map((i) => `${i.entityId}: ${i.message}`);
    expect(messages).toEqual(
      expect.arrayContaining([
        'artikodin: Condition de déblocage : la quête dépend d’elle-même',
        'artikodin: Étape 1 : Pikachu n’est pas du type demandé',
        'artikodin: Étape 3 : zone « atlantide » inconnue',
        'artikodin: Étape 3 : type « glace » inconnu',
        'artikodin: Récompense : espèce 9999 inconnue',
        'artikodin: Type « feu » inconnu',
        'electhor: Condition de déblocage : 4 étape(s) requise(s), la quête « L’oiseau de feu » en a 3',
        'adamant-mint: Aromate : nature « grognon » inconnue',
      ]),
    );
    expect(findUsages(seedContent, 'quest', 'mewtwo')).toEqual([
      'Condition de « Grotte Azurée »',
      'Condition de « Le Pokémon fabuleux »',
      'Condition de « L’oiseau au regard glacial »',
      'Condition de « L’oiseau aux pas de feu »',
      'Condition de « L’oiseau aux flammes sombres »',
    ]);
    expect(findUsages(seedContent, 'zone', 'iles-ecume')).toEqual([
      'Quête L’oiseau des glaces, étape 3',
    ]);
    expect(findUsages(seedContent, 'item', 'gold-bottle-cap')).toEqual([
      'Article de boutique « gold-bottle-cap »',
      'Quête « Le Pokémon génétique »',
      'Quête « Le gardien des mers »',
      'Quête « L’oiseau arc-en-ciel »',
      'Quête « Le maître des océans »',
      'Quête « Le maître des continents »',
      'Quête « Le gardien du ciel »',
      'Lot de coffre « gold-gold-bottle-cap »',
    ]);
  });
});

describe('expéditions légendaires', () => {
  it('ont par défaut les faiblesses du Pokémon en affinité', () => {
    const artikodin = seedContent.quests.find((q) => q.id === 'artikodin')!;
    // Glace / Vol : faible au Feu, à l'Acier, à la Roche (×4) et à l'Électrik.
    expect([...artikodin.rewards.pokemon[0]!.expedition.affinityTypes].sort()).toEqual(
      ['electric', 'fire', 'rock', 'steel'].sort(),
    );
    expect(defaultLegendaryExpedition(150)).toMatchObject({
      durationMinutes: 240,
      affinityTypes: ['bug', 'ghost', 'dark'],
    });
  });
});
