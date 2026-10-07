import { describe, expect, it } from 'vitest';
import { contentIssues, findUsages, gameContentSchema } from './integrity';
import { seedContent } from './seed';

describe('seedContent', () => {
  it('respecte le schéma du contenu, sans erreur de cohérence', () => {
    expect(gameContentSchema.parse(seedContent)).toEqual(seedContent);
    expect(contentIssues(seedContent).filter((i) => i.severity === 'error')).toEqual([]);
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
    bad.zones[1]!.regionId = 'johto';
    bad.lootTables[0]!.entries.push({ itemId: 'master-ball', chance: 1, min: 1, max: 1 });
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
    bad.zones[3]!.encounters = [{ speciesId: 129, weight: 1, minLevel: 5, maxLevel: 5 }];
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
    bad.trainers[2]!.unlock = { type: 'badgeCount', count: 5 };
    const messages = contentIssues(bad)
      .filter((i) => i.severity === 'error' && i.entity === 'trainer')
      .map((i) => `${i.entityId}: ${i.message}`);
    expect(messages).toEqual([
      'gamin-tom: Zone « zone-inconnue » inconnue',
      'gamin-tom: Nature « grincheuse » inconnue',
      'gamin-tom: Un type est à la fois imposé et interdit',
      'fillette-lise: Condition de déblocage : dresseur « personne » inconnu',
      'scout-rick: Condition de déblocage : 5 badge(s) requis, 2 existent',
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
      'Table de butin « Butin des berges »',
      'Article de boutique « poke-ball »',
      'Article de boutique « poke-ball-x10 »',
      'Collection « Insectes de la Forêt de Jade »',
    ]);
    expect(findUsages(seedContent, 'lootTable', 'butin-mer')).toEqual([
      'Zone « Cap Azuria »',
      'Dresseur « Ondine »',
    ]);
    // Léo et Ondine dépendent du nombre de badges, pas de Pierre directement ; la Super Ball si.
    expect(findUsages(seedContent, 'trainer', 'pierre')).toEqual([
      'Condition de déblocage de « Article Super Ball (great-ball) »',
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
      'Article de boutique « ultra-ball »',
      'Palier « Chercheur de Kanto »',
    ]);
    expect(findUsages(seedContent, 'shopCategory', 'elevage')).toEqual([
      'Article de boutique « everstone »',
      'Article de boutique « destiny-knot »',
    ]);
    expect(findUsages(seedContent, 'trainer', 'ondine')).toEqual([
      'Condition de déblocage de « Article Hyper Ball (ultra-ball) »',
    ]);
  });

  it('vérifie la boutique', () => {
    const bad = structuredClone(seedContent);
    bad.shopEntries[0]!.itemId = 'master-ball';
    bad.shopEntries[1]!.categoryId = 'soins';
    bad.shopEntries[2]!.unlock = { type: 'trainerDefeated', trainerId: 'personne' };
    bad.shopEntries.push({ ...bad.shopEntries[3]! });
    const messages = contentIssues(bad)
      .filter((i) => i.severity === 'error' && i.entity === 'shopEntry')
      .map((i) => `${i.entityId}: ${i.message}`);
    expect(messages).toEqual([
      'ultra-ball: Identifiant d’article de boutique en double',
      'poke-ball: Objet « master-ball » inconnu',
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
        'evolutionOverride:27-28: Surcharge d’évolution en double',
        'evolutionOverride:52-53: Objet « pierre-inconnue » inconnu',
        'balance:null: Évolutions : objet de remplacement de l’échange « cable-inconnu » inconnu',
      ]),
    );
    expect(findUsages(seedContent, 'item', 'linking-cord')).toEqual([
      'Article de boutique « linking-cord »',
      'Équilibrage : objet qui remplace l’échange',
      'Palier « Chercheur de Kanto »',
    ]);
    expect(findUsages(seedContent, 'item', 'fire-stone')).toContain('Évolution « 37-38 »');
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

  it('vérifie les paliers et les collections', () => {
    const bad = structuredClone(seedContent);
    bad.dexMilestones[0]!.regionId = 'johto';
    bad.dexMilestones[1]!.rewards.items.push({ itemId: 'master-ball', quantity: 1 });
    bad.collections[0]!.speciesIds.push(9999);
    bad.collections[1]!.rewards.expeditionSlots = 3;
    const issues = contentIssues(bad).map((i) => `${i.severity}:${i.entityId}: ${i.message}`);
    expect(issues).toEqual(
      expect.arrayContaining([
        'error:kanto-10: Région « johto » inconnue',
        'error:kanto-25: Récompense : objet « master-ball » inconnu',
        'error:insectes-de-jade: Espèces inconnues : 9999',
        'warning:null: Progression : 3 emplacement(s) d’expédition au-delà du maximum (sans effet)',
      ]),
    );
    expect(findUsages(seedContent, 'region', 'kanto')).toContain('Palier « Apprenti de Kanto »');
  });
});
