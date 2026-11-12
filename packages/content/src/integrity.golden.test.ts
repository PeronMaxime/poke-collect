import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { contentIssues, findUsages } from './integrity';
import type { GameContentData } from './schemas';
import { seedContent } from './seed';

/**
 * Filet de non-régression des contrôles de cohérence (docs/plans/PLAN-QUALITE.md, étape 2.4).
 *
 * Le contenu de test est abîmé de 300 façons tirées au hasard (entités supprimées ou dupliquées,
 * références remplacées par un identifiant inconnu, espèces et formes inexistantes, nombres hors
 * bornes), et la liste des erreurs et alertes obtenue, dans l'ordre, est comparée à celle
 * enregistrée. Un rangement du code ne doit rien y changer ; une règle ajoutée ou modifiée le fait
 * échouer à dessein : relire l'écart, puis réenregistrer (`vitest run -u`).
 */

/** Petit générateur à graine (mulberry32), le paquet ne dépendant pas de `game-core`. */
function rng(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { int: (max: number) => Math.floor(next() * max) };
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
interface Slot {
  parent: Json[] | { [key: string]: Json };
  key: string | number;
  /** Nom du champ qui porte la valeur (celui du tableau, pour un élément de tableau). */
  field: string;
}

/** Tous les emplacements du contenu qui portent une référence ou un nombre. */
function slots(root: Json): Slot[] {
  const found: Slot[] = [];
  const visit = (value: Json, field: string) => {
    if (value === null || typeof value !== 'object') return;
    const entries: [string | number, Json][] = Array.isArray(value)
      ? value.map((v, i) => [i, v])
      : Object.entries(value);
    for (const [key, child] of entries) {
      const name = typeof key === 'string' ? key : field;
      if (typeof child === 'string' || typeof child === 'number') {
        found.push({ parent: value, key, field: name });
      } else visit(child, name);
    }
  };
  visit(root, '');
  return found;
}

const COLLECTIONS = [
  'regions',
  'speciesOverrides',
  'abilities',
  'items',
  'lootTables',
  'zones',
  'trainers',
  'dungeons',
  'shopCategories',
  'shopEntries',
  'evolutionOverrides',
  'collections',
  'quests',
  'guildQuests',
  'chestEntries',
] as const satisfies readonly (keyof GameContentData)[];

const REFERENCE = /Ids?$|[tT]ypes?$|[wW]eathers?$|^nature$|^ability$|^category$|^count$|^percent$/;

/** Abîme le contenu sur place : `count` dégâts tirés au hasard. */
function damage(content: GameContentData, random: ReturnType<typeof rng>, count: number) {
  // Relevés une fois : un emplacement d'une entité supprimée entre-temps est abîmé sans effet.
  const every = slots(content as unknown as Json);
  const references = every.filter((s) => s.field !== 'id' && REFERENCE.test(s.field));
  for (let n = 0; n < count; n++) {
    const kind = random.int(10);
    if (kind === 0) {
      // Une entité disparaît : tout ce qui la citait pointe dans le vide.
      const list = content[COLLECTIONS[random.int(COLLECTIONS.length)]!] as unknown[];
      if (list.length) list.splice(random.int(list.length), 1);
    } else if (kind === 1) {
      // Une entité en double.
      const list = content[COLLECTIONS[random.int(COLLECTIONS.length)]!] as unknown[];
      if (list.length) list.push(structuredClone(list[random.int(list.length)]));
    } else {
      // Deux fois sur trois, le dégât vise un champ qui cite autre chose (identifiant, espèce,
      // type, météo…) : c'est là que portent la plupart des contrôles.
      const all = random.int(3) > 0 && references.length ? references : every;
      const slot = all[random.int(all.length)]!;
      const parent = slot.parent as Record<string | number, Json>;
      const current = parent[slot.key];
      if (typeof current === 'string') {
        // Les identifiants propres des entités restent intacts : seules les références changent.
        if (slot.field !== 'id') parent[slot.key] = 'inconnu';
      } else if (typeof current === 'number') {
        parent[slot.key] = [0, -1, 99_999, current * 1000, current + 1][random.int(5)]!;
      }
    }
  }
}

const fingerprint = (value: unknown) =>
  createHash('sha1').update(JSON.stringify(value)).digest('hex').slice(0, 12);

describe('cohérence du contenu, à dégâts égaux', () => {
  it('le contenu de test intact n’a aucune erreur', () => {
    expect(contentIssues(seedContent).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('donne les mêmes erreurs et alertes, dans le même ordre', { timeout: 60_000 }, () => {
    const lines = Array.from({ length: 300 }, (_, seed) => {
      const random = rng(seed * 104_729 + 7);
      const content = structuredClone(seedContent);
      damage(content, random, 1 + random.int(12));
      const issues = contentIssues(content);
      const errors = issues.filter((i) => i.severity === 'error').length;
      return `${String(seed).padStart(3, '0')} ${errors}e ${issues.length - errors}a ${fingerprint(issues)}`;
    });
    expect(lines).toMatchSnapshot();
  });

  it('retrouve les mêmes usages de chaque entité', () => {
    const usages = (
      [
        ['region', seedContent.regions],
        ['item', seedContent.items],
        ['lootTable', seedContent.lootTables],
        ['zone', seedContent.zones],
        ['trainer', seedContent.trainers],
        ['shopCategory', seedContent.shopCategories],
        ['quest', seedContent.quests],
      ] as const
    ).map(([kind, list]) => {
      const all = list.map((e) => findUsages(seedContent, kind, e.id));
      return `${kind} ${list.length} ${fingerprint(all)}`;
    });
    expect(usages).toMatchSnapshot();
  });
});
