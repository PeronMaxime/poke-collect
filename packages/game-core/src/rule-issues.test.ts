import { describe, expect, it } from 'vitest';
import type { GameContentData } from '@poke/content';
import { ruleIssues } from './rule-issues';
import { testContext } from './test-helpers';

/** Ajoute une rencontre à la première zone du contenu de test. */
const withEncounter =
  (speciesId: number, formId: number | null = null) =>
  (c: GameContentData) => {
    c.zones[0]!.encounters.push({ speciesId, formId, weight: 1, minLevel: 5, maxLevel: 5 });
  };

describe('évolutions par objet en expédition', () => {
  it('le contenu de test n’en propose aucune', () => {
    expect(ruleIssues(testContext())).toEqual([]);
  });

  it('signale une espèce obtenue par une pierre que le joueur peut se procurer', () => {
    const ctx = testContext(withEncounter(26));
    const zoneId = ctx.content.zones[0]!.id;
    expect(ruleIssues(ctx)).toEqual([
      {
        severity: 'warning',
        entity: 'zone',
        entityId: zoneId,
        message: expect.stringMatching(/^Raichu s’obtient en évoluant avec un objet \(.+\)/),
      },
    ]);
  });

  it('ignore une évolution par le niveau ou le bonheur', () => {
    expect(ruleIssues(testContext(withEncounter(2)))).toEqual([]);
    expect(ruleIssues(testContext(withEncounter(25)))).toEqual([]);
  });

  it('ignore un objet introuvable et une zone désactivée', () => {
    // Leveinard (Parc Safari) : Ptiravi avec une Pierre Ovale, qui ne s'obtient nulle part…
    expect(ruleIssues(testContext())).toEqual([]);
    // … sauf si on la met en boutique, et tant que l'article est actif.
    const sold = (enabled: boolean) =>
      testContext((c) => {
        const stone = c.shopEntries.find((e) => e.itemId === 'moon-stone')!;
        c.shopEntries.push({ ...stone, id: 'oval-stone', itemId: 'oval-stone', enabled });
      });
    expect(ruleIssues(sold(true))).toEqual([
      expect.objectContaining({
        entityId: 'parc-safari',
        message: expect.stringContaining('Leveinard'),
      }),
    ]);
    expect(ruleIssues(sold(false))).toEqual([]);
    const disabled = testContext((c) => {
      withEncounter(26)(c);
      c.zones[0]!.enabled = false;
    });
    expect(ruleIssues(disabled)).toEqual([]);
  });

  it('suit les surcharges d’évolution de l’admin', () => {
    const byLevel = testContext((c) => {
      withEncounter(26)(c);
      c.evolutionOverrides.push({
        id: '25-26',
        fromSpeciesId: 25,
        toSpeciesId: 26,
        enabled: true,
        methods: [{ minLevel: 30, itemId: null, minHappiness: null, timeOfDay: null }],
      });
    });
    expect(ruleIssues(byLevel)).toEqual([]);
  });
});
