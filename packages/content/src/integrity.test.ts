import { describe, expect, it } from 'vitest';
import { contentIssues } from './integrity';
import type { GameContentData } from './schemas';
import { seedContent } from './seed';

/**
 * Contrôles de cohérence, un par un : le contenu de test est retouché à un endroit, et l'on vérifie
 * l'erreur ou l'alerte apparue (le filet d'ensemble est `integrity.golden.test.ts`).
 */

const key = (i: { severity: string; entity: string; entityId: string | null; message: string }) =>
  `${i.severity} ${i.entity}:${i.entityId ?? '-'} ${i.message}`;
const baseline = new Set(contentIssues(seedContent).map(key));

/** Erreurs et alertes nouvelles après la retouche, sous la forme « gravité entité:id message ». */
function newIssues(edit: (content: GameContentData) => void): string[] {
  const content = structuredClone(seedContent);
  edit(content);
  return contentIssues(content)
    .map(key)
    .filter((k) => !baseline.has(k));
}

const zone = (c: GameContentData, id: string) => c.zones.find((z) => z.id === id)!;
const trainer = (c: GameContentData, id: string) => c.trainers.find((t) => t.id === id)!;
const quest = (c: GameContentData, id: string) => c.quests.find((q) => q.id === id)!;
const item = (c: GameContentData, id: string) => c.items.find((i) => i.id === id)!;

describe('objets de quête', () => {
  it('signale un objet de quête vendu, revendable ou demandé par aucune étape', () => {
    const issues = newIssues((c) => {
      c.shopEntries[0]!.itemId = 'fragment-magnetique';
      item(c, 'fragment-magnetique').sellPrice = 10;
      quest(c, 'electhor').steps[1]!.condition = { type: 'questCompleted', questId: 'artikodin' };
    });
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^warning item:fragment-magnetique Objet de quête aussi obtenu ailleurs \(boutique/,
        ),
        'warning item:fragment-magnetique Objet de quête revendable : le joueur peut le vendre avant de rendre la quête',
        'warning item:fragment-magnetique Objet de quête demandé par aucune étape de quête',
      ]),
    );
  });

  it('signale un objet de quête donné en récompense ou au départ', () => {
    const issues = newIssues((c) => {
      c.balance.newPlayer.startingInventory.push({ itemId: 'fragment-magnetique', quantity: 1 });
      c.collections[0]!.rewards.items.push({ itemId: 'fragment-magnetique', quantity: 1 });
    });
    expect(issues).toEqual([
      expect.stringContaining('(inventaire de départ, collection « formes-pikachu »)'),
    ]);
  });
});

describe('objets à usage réservé', () => {
  it('signale une parcelle donnée hors de la boutique', () => {
    const issues = newIssues((c) => {
      c.lootTables[0]!.entries.push({ itemId: 'parcelle-ferme', chance: 0.1, min: 1, max: 1 });
    });
    expect(issues).toEqual([
      expect.stringMatching(
        /^warning item:parcelle-ferme Parcelle donnée hors de la boutique \(butin/,
      ),
    ]);
  });

  it('refuse une plante qui récolte moins au maximum qu’au minimum', () => {
    const issues = newIssues((c) => {
      const effect = item(c, 'razz-berry').effects.find((e) => e.type === 'berryPlant')!;
      if (effect.type === 'berryPlant') Object.assign(effect, { minYield: 5, maxYield: 2 });
    });
    expect(issues).toEqual([
      'error item:razz-berry Plante : récolte minimale (5) supérieure à la maximale (2)',
    ]);
  });
});

describe('talents et donjons', () => {
  it('refuse un type d’immunité inconnu', () => {
    const issues = newIssues((c) => {
      c.abilities.push({
        id: 'levitate',
        description: '',
        effects: [{ type: 'immunity', attackType: 'terre', heal: 0, conditions: [] }],
      });
    });
    expect(issues).toEqual(['error ability:levitate Type « terre » inconnu']);
  });

  it('signale une Méga-Gemme sans effet ou d’une autre espèce', () => {
    const issues = newIssues((c) => {
      c.dungeons[0]!.gemItemId = 'charizardite-x';
      c.dungeons[1]!.gemItemId = 'razz-berry';
    });
    expect(issues).toEqual([
      expect.stringMatching(
        /^warning dungeon:mega-florizarre .* ne fait pas méga-évoluer l’espèce du boss$/,
      ),
      expect.stringMatching(/^warning dungeon:mega-dracaufeu-x .* n’a pas l’effet Méga-Évolution/),
      // Sans sa gemme, Méga-Florizarre ne s'obtient plus : la collection le signale aussi.
      expect.stringMatching(
        /^warning collection:mega-kanto Introuvable en jeu .*: Méga-Florizarre$/,
      ),
    ]);
  });

  it('signale un objet de forme vers une forme Méga ou sans effet', () => {
    const item = (c: GameContentData, id: string) => c.items.find((i) => i.id === id)!;
    const issues = newIssues((c) => {
      item(c, 'blue-orb').effects = [{ type: 'formChange', formId: 10034 }];
      item(c, 'red-orb').effects = [];
    });
    expect(issues).toEqual([
      'error item:blue-orb Objet de forme : 10034 est une forme Méga (effet Méga-Évolution)',
      'warning item:red-orb Objet de forme sans effet « Changement de forme »',
      // Les deux Primo-Résurgences ne s'obtiennent plus : leurs collections le signalent.
      expect.stringMatching(
        /^warning collection:primo-kyogre Introuvable en jeu .*: Primo-Kyogre$/,
      ),
      expect.stringMatching(
        /^warning collection:primo-groudon Introuvable en jeu .*: Primo-Groudon$/,
      ),
    ]);
  });
});

describe('météo des zones', () => {
  it('signale une météo figée', () => {
    expect(newIssues((c) => (zone(c, 'route-1').weatherChangeChance = 0))).toEqual([
      'warning zone:route-1 Météo : météos réglées, mais aucune chance de changement : toujours temps clair',
    ]);
    expect(newIssues((c) => (zone(c, 'route-1').weathers = []))).toEqual([
      'warning zone:route-1 Météo : chance de changement, mais aucune météo autre que le temps clair : toujours temps clair',
    ]);
    expect(
      newIssues((c) => (zone(c, 'route-1').weathers = [{ weather: 'rain', weight: 1 }])),
    ).toEqual([
      'warning zone:route-1 Météo : le temps clair n’est pas dans la liste : après son premier changement, la zone n’y revient jamais',
    ]);
  });
});

describe('contenu désactivé', () => {
  it('signale une condition qui attend un dresseur désactivé', () => {
    const issues = newIssues((c) => (trainer(c, 'gamin-tom').enabled = false));
    expect(issues).toContain(
      'warning trainer:fillette-lise Condition de déblocage : dresseur « Tom » désactivé, elle ne se remplit plus pour qui ne l’a pas déjà remplie',
    );
  });

  it('signale une étape de quête dans une zone désactivée', () => {
    const issues = newIssues((c) => (zone(c, 'centrale').enabled = false));
    expect(issues).toContain(
      'warning quest:electhor Étape 2 : zone « centrale » désactivée : étape impossible',
    );
  });

  it('ne signale rien de ce qu’attend une région à venir', () => {
    const issues = newIssues((c) => {
      c.balance.tabUnlocks = { dungeons: { type: 'badgeCount', count: 1, regionId: 'kalos' } };
    });
    expect(issues).toEqual([]);
  });
});

describe('dépendances en boucle', () => {
  it('refuse deux dresseurs qui s’attendent l’un l’autre', () => {
    const issues = newIssues((c) => {
      trainer(c, 'gamin-tom').unlock = { type: 'trainerDefeated', trainerId: 'fillette-lise' };
    });
    expect(issues).toEqual([
      expect.stringMatching(
        /^error trainer:(gamin-tom|fillette-lise) Dépendances en boucle entre dresseur « .* », dresseur « .* » : /,
      ),
    ]);
  });

  it('refuse une zone ouverte par une quête qui s’y joue avant', () => {
    const issues = newIssues((c) => {
      zone(c, 'centrale').unlock = { type: 'questCompleted', questId: 'electhor' };
    });
    expect(issues).toEqual([expect.stringContaining('Dépendances en boucle entre')]);
  });
});

describe('réglages de l’équilibrage', () => {
  it('signale les onglets et rubriques inconnus ou en double', () => {
    const issues = newIssues((c) => {
      c.balance.menu = { groups: [['pc', 'pc', 'casino']], titles: ['A', 'B'] };
      c.balance.bag = {
        tabs: [{ title: 'Tout', sections: ['ball', 'gemmes'] }],
        sectionTitles: { x: 'X' },
      };
      c.balance.tabUnlocks = { ...c.balance.tabUnlocks, casino: { type: 'always' } };
    });
    expect(issues).toEqual([
      'warning balance:- Menu : onglet(s) inconnu(s) ignoré(s) : « casino »',
      'warning balance:- Menu : onglet(s) placé(s) deux fois (seule la première place compte) : « pc »',
      'warning balance:- Menu : 1 titre(s) sans section',
      'warning balance:- Sac : rubrique(s) inconnue(s) ignorée(s) : « gemmes »',
      'warning balance:- Sac : titre(s) de rubrique(s) inconnue(s) ignoré(s) : « x »',
      'warning balance:- Onglets à débloquer : onglet(s) inconnu(s), condition sans effet : « casino »',
    ]);
  });

  it('signale des Bonbons moins chers à haut niveau et une zone ignorée', () => {
    const issues = newIssues((c) => {
      c.balance.transfer.candiesPerLevelStart = c.balance.transfer.candiesPerLevelEnd + 1;
      c.balance.expeditionCompletions![0]!.zoneId = 'route-1';
    });
    expect(issues).toEqual([
      'warning balance:- Bonbons : un niveau élevé coûte moins de Bonbons qu’un niveau bas (départ > arrivée)',
      'warning balance:region-complete Complétion de région : l’expédition choisie est ignorée',
    ]);
  });
});

describe('collections', () => {
  it('signale un Pokémon qu’aucune source ne donne', () => {
    const issues = newIssues((c) => c.collections[0]!.speciesIds.push(386));
    expect(issues).toEqual([]);
    const missing = newIssues((c) => c.collections[0]!.speciesIds.push(493));
    expect(missing).toEqual([
      expect.stringMatching(/^warning collection:formes-pikachu Introuvable en jeu .*Arceus/),
    ]);
  });
});
