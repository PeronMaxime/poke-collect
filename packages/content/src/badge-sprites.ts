/**
 * Sprites des badges d'arène, servis par le front (`apps/web/public/badges/<n>.png`) : repris du
 * dépôt PokeAPI/sprites (`sprites/badges/<n>.png`), recadrés et réduits à 96 px. Le numéro est
 * celui de PokéAPI : Kanto 1-8, Johto 9-16, Hoenn 17-24, Sinnoh 25-32, Unys 33-42, Kalos 43-50,
 * Galar 51-60, Paldea 70-77. Les Tampons d'Épreuve d'Alola n'en ont pas (médaille dessinée).
 *
 * La migration 0134 renseigne les mêmes images en base, sans toucher à celles choisies par l'admin.
 */
const BADGE_SPRITES: Record<string, number> = {
  // Kanto
  pierre: 1,
  ondine: 2,
  'major-bob': 3,
  erika: 4,
  koga: 5,
  morgane: 6,
  auguste: 7,
  giovanni: 8,
  // Johto
  albert: 9,
  hector: 10,
  blanche: 11,
  mortimer: 12,
  chuck: 13,
  jasmine: 14,
  fredo: 15,
  sandra: 16,
  // Hoenn
  roxanne: 17,
  bastien: 18,
  voltere: 19,
  adriane: 20,
  norman: 21,
  alizee: 22,
  'levy-tatia': 23,
  juan: 24,
  // Premier Champion des autres régions
  pierrick: 25,
  aloe: 34,
  violette: 43,
  cornelia: 45,
  percy: 51,
  katy: 70,
};

/** Image du badge d'un Champion d'arène (null : médaille dessinée). */
export const badgeSprite = (trainerId: string): string | null => {
  const n = BADGE_SPRITES[trainerId];
  return n ? `/badges/${n}.png` : null;
};
