/**
 * Répartition des espèces dans les zones d'une région (page « Espèces par zone ») : pour chaque
 * espèce du Pokédex régional (et chaque forme rencontrée), les zones où elle apparaît, sa première
 * apparition, son stade d'évolution, et si elle reste obtenable quand elle n'est dans aucune zone.
 */
import type { Encounter, Zone } from '@poke/content';
import { getForm, getSpecies } from '@poke/data';
import { evolutionOptions } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';

/** Une zone de la région, dans l'ordre de la région. */
export interface ZoneColumn {
  zone: Zone;
  /** Position dans la région, à partir de 1 (zones affichées seulement). */
  index: number;
  /** Rencontres ordinaires de la zone. */
  encounterCount: number;
  /** Espèces dont c'est la première apparition dans la région. */
  newCount: number;
}

/** Présence d'une espèce (ou forme) dans une zone. */
export interface SpeciesCell {
  /** Position de la rencontre dans `zone.encounters` ; null pour une rencontre spéciale. */
  encounterIndex: number | null;
  /** Poids de la rencontre ; null pour une rencontre spéciale. */
  weight: number | null;
  /** Chance d'apparition parmi les rencontres actives de la zone, de 0 à 1 (0 si inactive). */
  chance: number;
  minLevel: number;
  maxLevel: number;
  /** Rencontre spéciale (Pokémon exact requis dans l'équipe) : se règle dans la page Zones. */
  special: boolean;
}

/**
 * Comment on obtient une espèce absente des zones : en faisant évoluer une pré-évolution présente,
 * à l'œuf (une évolution présente, en pension), ou pas du tout (aucune espèce de sa lignée).
 */
export type Availability = 'present' | 'evolution' | 'egg' | 'missing';

/**
 * Stade d'une espèce dans sa lignée : 0 pour un bébé, puis 1, 2, 3 (un bébé ne compte pas comme
 * un stade : Pikachu est au stade 1, Raichu au stade 2).
 */
export interface Stage {
  stage: number;
  /** Elle descend d'une autre espèce (bébé compris). */
  evolved: boolean;
  /** Sa pré-évolution directe est un bébé (Pikachu, Ronflex…). */
  fromBaby: boolean;
  /** Elle peut encore évoluer en jeu (réglages de l'admin compris). */
  canEvolve: boolean;
}

/** Une ligne : une espèce (ou une de ses formes) et sa présence dans les zones. */
export interface SpeciesRow {
  key: string;
  speciesId: number;
  formId: number | null;
  name: string;
  /** Comptée dans le Pokédex de la région. */
  inDex: boolean;
  stage: Stage;
  /** Présence par identifiant de zone. */
  cells: Map<string, SpeciesCell>;
  /** Zones où elle apparaît en rencontre ordinaire. */
  zoneCount: number;
  /** Première zone (dans l'ordre) où elle apparaît, rencontre spéciale comprise. */
  first: ZoneColumn | null;
  availability: Availability;
}

/** Répartition des espèces d'une région. */
export interface ZoneSpeciesReport {
  zones: ZoneColumn[];
  rows: SpeciesRow[];
}

const rowKey = (speciesId: number, formId: number | null | undefined) =>
  `${speciesId}:${formId ?? 0}`;

/** Stade d'une espèce dans une forme (voir `Stage`). */
export function speciesStage(ctx: GameContext, speciesId: number, formId: number | null): Stage {
  const species = getSpecies(speciesId);
  if (!species) return { stage: 1, evolved: false, fromBaby: false, canEvolve: false };
  let stage = species.isBaby ? 0 : 1;
  let current = species;
  while (current.evolvesFromSpeciesId != null) {
    const parent = getSpecies(current.evolvesFromSpeciesId);
    if (!parent) break;
    if (!parent.isBaby) stage++;
    current = parent;
  }
  const parent =
    species.evolvesFromSpeciesId != null ? getSpecies(species.evolvesFromSpeciesId) : undefined;
  return {
    stage,
    evolved: !!parent,
    fromBaby: !!parent?.isBaby,
    canEvolve: evolutionOptions(ctx, speciesId, formId).length > 0,
  };
}

/** Pré-évolutions d'une espèce, de la plus proche à la plus lointaine. */
function ancestors(speciesId: number): number[] {
  const found: number[] = [];
  let parentId = getSpecies(speciesId)?.evolvesFromSpeciesId ?? null;
  while (parentId != null) {
    found.push(parentId);
    parentId = getSpecies(parentId)?.evolvesFromSpeciesId ?? null;
  }
  return found;
}

/** Comment obtenir une espèce, d'après les espèces présentes dans les zones (`Availability`). */
function availability(speciesId: number, present: ReadonlySet<number>): Availability {
  if (present.has(speciesId)) return 'present';
  if (ancestors(speciesId).some((id) => present.has(id))) return 'evolution';
  const chainId = getSpecies(speciesId)?.evolutionChainId;
  const lineagePresent = [...present].some((id) => getSpecies(id)?.evolutionChainId === chainId);
  return lineagePresent ? 'egg' : 'missing';
}

/** Chance d'apparition d'une rencontre parmi les rencontres actives (espèce activée, poids > 0). */
function encounterChance(ctx: GameContext, zone: Zone, encounter: Encounter): number {
  const active = (e: Encounter) => !!ctx.species(e.speciesId)?.enabled && e.weight > 0;
  const total = zone.encounters.filter(active).reduce((sum, e) => sum + e.weight, 0);
  return active(encounter) && total > 0 ? encounter.weight / total : 0;
}

/** Nom affiché d'une ligne : nom de l'espèce, ou de la forme (« Rattata d'Alola »). */
function rowName(ctx: GameContext, speciesId: number, formId: number | null): string {
  const form = formId != null ? getForm(formId) : undefined;
  return form?.nameFr ?? ctx.species(speciesId)?.nameFr ?? `#${speciesId}`;
}

/**
 * Répartition des espèces d'une région dans ses zones, triées par ordre. Les zones désactivées ne
 * comptent que si `includeDisabled`. Lignes : le Pokédex régional dans son ordre (forme par défaut,
 * présente ou non), puis chaque forme ou espèce hors Pokédex trouvée dans une zone.
 */
export function zoneSpeciesReport(
  ctx: GameContext,
  regionId: string,
  { includeDisabled = false }: { includeDisabled?: boolean } = {},
): ZoneSpeciesReport {
  const region = ctx.region(regionId);
  const zones: ZoneColumn[] = ctx.zones
    .filter((z) => z.regionId === regionId && (includeDisabled || z.enabled))
    .sort((a, b) => a.order - b.order)
    .map((zone, i) => ({
      zone,
      index: i + 1,
      encounterCount: zone.encounters.length,
      newCount: 0,
    }));
  const dex = region?.speciesIds ?? [];
  const rows = new Map<string, SpeciesRow>();
  const rowFor = (speciesId: number, formId: number | null) => {
    const key = rowKey(speciesId, formId);
    let row = rows.get(key);
    if (!row) {
      row = {
        key,
        speciesId,
        formId,
        name: rowName(ctx, speciesId, formId),
        inDex: dex.includes(speciesId),
        stage: speciesStage(ctx, speciesId, formId),
        cells: new Map(),
        zoneCount: 0,
        first: null,
        availability: 'present',
      };
      rows.set(key, row);
    }
    return row;
  };
  for (const id of dex) rowFor(id, null);

  for (const column of zones) {
    const { zone } = column;
    zone.encounters.forEach((e, i) => {
      const row = rowFor(e.speciesId, e.formId ?? null);
      if (row.cells.has(zone.id)) return;
      row.cells.set(zone.id, {
        encounterIndex: i,
        weight: e.weight,
        chance: encounterChance(ctx, zone, e),
        minLevel: e.minLevel,
        maxLevel: e.maxLevel,
        special: false,
      });
      row.zoneCount++;
    });
    for (const s of zone.specialEncounters) {
      const row = rowFor(s.speciesId, s.formId ?? null);
      if (row.cells.has(zone.id)) continue;
      row.cells.set(zone.id, {
        encounterIndex: null,
        weight: null,
        chance: 0,
        minLevel: s.minLevel,
        maxLevel: s.maxLevel,
        special: true,
      });
    }
  }

  const present = new Set<number>();
  for (const row of rows.values()) {
    const firstZone = zones.find((c) => row.cells.has(c.zone.id)) ?? null;
    row.first = firstZone;
    if (firstZone) {
      firstZone.newCount++;
      present.add(row.speciesId);
    }
  }
  for (const row of rows.values()) {
    row.availability = row.first ? 'present' : availability(row.speciesId, present);
  }

  const dexOrder = new Map(dex.map((id, i) => [id, i]));
  const sorted = [...rows.values()].sort(
    (a, b) =>
      (dexOrder.get(a.speciesId) ?? dex.length + a.speciesId) -
        (dexOrder.get(b.speciesId) ?? dex.length + b.speciesId) ||
      (a.formId ?? 0) - (b.formId ?? 0),
  );
  return { zones, rows: sorted };
}

/** Filtres de la page : sur la présence, le stade ou le Pokédex. */
export const ROW_FILTERS = {
  all: 'Toutes les espèces',
  absent: 'Absentes des zones',
  missing: 'Introuvables (lignée absente)',
  single: 'Dans une seule zone',
  multiple: 'Dans plusieurs zones',
  evolved: 'Évoluées présentes',
  final: 'Évolutions finales présentes',
  outsideDex: 'Hors Pokédex régional',
} as const;

export type RowFilter = keyof typeof ROW_FILTERS;

/** La ligne passe-t-elle le filtre ? */
export function matchesFilter(row: SpeciesRow, filter: RowFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'absent':
      return row.availability !== 'present';
    case 'missing':
      return row.availability === 'missing';
    case 'single':
      return row.zoneCount === 1;
    case 'multiple':
      return row.zoneCount > 1;
    case 'evolved':
      return row.zoneCount > 0 && row.stage.evolved;
    case 'final':
      return row.zoneCount > 0 && row.stage.evolved && !row.stage.canEvolve;
    case 'outsideDex':
      return !row.inDex;
  }
}

/** Nombre de lignes par filtre, pour les compteurs de la page. */
export function filterCounts(rows: readonly SpeciesRow[]): Record<RowFilter, number> {
  return Object.fromEntries(
    (Object.keys(ROW_FILTERS) as RowFilter[]).map((f) => [
      f,
      rows.filter((r) => matchesFilter(r, f)).length,
    ]),
  ) as Record<RowFilter, number>;
}

/**
 * Niveaux proposés pour ajouter une rencontre à une zone : la médiane des niveaux min et celle des
 * niveaux max de ses rencontres, ou 5-10 si la zone est vide.
 */
export function suggestedLevels(zone: Zone): { minLevel: number; maxLevel: number } {
  if (zone.encounters.length === 0) return { minLevel: 5, maxLevel: 10 };
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)]!;
  };
  const minLevel = median(zone.encounters.map((e) => e.minLevel));
  const maxLevel = Math.max(minLevel, median(zone.encounters.map((e) => e.maxLevel)));
  return { minLevel, maxLevel };
}

/** Zone modifiée : rencontre ajoutée, changée (`index`) ou retirée (`encounter` null). */
export function withEncounter(zone: Zone, index: number | null, encounter: Encounter | null): Zone {
  if (index === null) {
    return encounter ? { ...zone, encounters: [...zone.encounters, encounter] } : zone;
  }
  const encounters = encounter
    ? zone.encounters.map((e, i) => (i === index ? encounter : e))
    : zone.encounters.filter((_, i) => i !== index);
  return { ...zone, encounters };
}
