import { DEFAULT_SPECIAL_ENCOUNTER_CHANCE } from './schemas';
import type { SpecialEncounter, Zone } from './schemas';

/**
 * Rencontres spéciales des formes événementielles (Pikachu Partenaire et à casquette, Pikachu
 * Cosplay, Évoli Partenaire, Pichu Troizépi), par zone : chacune n'apparaît que si l'équipe compte
 * le Pokémon requis exact. Même liste que la migration 0096 (à garder en phase).
 */
const special = (
  speciesId: number,
  formId: number,
  [minLevel, maxLevel]: [number, number],
  requiredSpeciesId: number,
  hint: string,
): SpecialEncounter => ({
  speciesId,
  formId,
  minLevel,
  maxLevel,
  requiredSpeciesId,
  requiredFormId: null,
  chance: DEFAULT_SPECIAL_ENCOUNTER_CHANCE,
  hint,
});

export const SPECIAL_ENCOUNTERS: Record<string, SpecialEncounter[]> = {
  // --- Kanto : Let's Go et les casquettes de Sacha -------------------------------------------
  'route-1': [
    special(
      133,
      10159,
      [3, 5],
      25,
      'Quelque chose remue dans les hautes herbes, comme si l’on guettait le passage d’une souris électrique.',
    ),
  ],
  'foret-de-jade': [
    special(
      25,
      10158,
      [4, 7],
      133,
      'Des étincelles crépitent entre les arbres, comme pour saluer un Pokémon aux mille évolutions.',
    ),
    special(
      25,
      10094,
      [4, 7],
      10,
      'Une casquette rouge et blanche pend à une branche, là où un jeune dresseur captura jadis une petite chenille.',
    ),
  ],
  'route-victoire': [
    special(
      25,
      10160,
      [42, 48],
      6,
      'Une casquette aux couleurs du monde flotte au vent. Seul le souffle d’un dragon de feu semble pouvoir l’atteindre.',
    ),
  ],
  // --- Johto -----------------------------------------------------------------------------------
  'tour-carillon': [
    special(
      25,
      10148,
      [45, 50],
      250,
      'Au sommet de la tour, un arc-en-ciel rappelle le jour où un dresseur et son partenaire virent passer le gardien des cieux.',
    ),
  ],
  'autel-bois-aux-chenes': [
    special(
      172,
      110065,
      [40, 44],
      251,
      'Le temps vacille autour de l’autel. Un petit Pokémon venu du passé n’attend que le retour du voyageur du temps.',
    ),
  ],
  // --- Hoenn : la casquette de Hoenn et les Concours -------------------------------------------
  'bois-clementi': [
    special(
      25,
      10095,
      [4, 6],
      252,
      'Une casquette verte a été oubliée sur un tronc, là où un dresseur se lia d’amitié avec un petit gecko.',
    ),
  ],
  'route-109': [
    special(
      25,
      10085,
      [10, 13],
      311,
      'Une loge de costumes s’est installée près de la salle des Concours. Elle n’ouvre qu’aux supporters les plus positifs.',
    ),
  ],
  'labo-seko': [
    special(
      25,
      10083,
      [14, 18],
      376,
      'Un chercheur en blouse griffonne des équations. Il ne parle qu’à un esprit d’acier aux quatre pattes.',
    ),
  ],
  'routes-114-115': [
    special(
      25,
      10082,
      [18, 22],
      334,
      'Un chant cotonneux résonne au-dessus des falaises. Une star des Concours attend qu’un oiseau-nuage l’accompagne.',
    ),
  ],
  'new-lavandia': [
    special(
      25,
      10080,
      [22, 28],
      310,
      'Un riff de guitare électrique résonne dans la centrale. Le musicien ne monte sur scène qu’avec un chien d’orage.',
    ),
  ],
  'routes-119-120': [
    special(
      25,
      10081,
      [28, 34],
      350,
      'À la surface de l’eau, un reflet d’une rare élégance. Il ne se dévoile qu’au plus beau des Pokémon.',
    ),
  ],
  'zone-de-combat': [
    special(
      25,
      10084,
      [45, 52],
      297,
      'Un masque de catcheur traîne au bord du ring. Son propriétaire ne défie que les lutteurs de sumo.',
    ),
  ],
};

/** Zones du seed avec leurs rencontres spéciales. */
export function withSpecialEncounters(zones: Zone[]): Zone[] {
  return zones.map((z) => ({ ...z, specialEncounters: SPECIAL_ENCOUNTERS[z.id] ?? [] }));
}
