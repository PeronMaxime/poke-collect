/**
 * Recherche de texte.
 */

/** Texte sans accents ni majuscules, pour les recherches (« evoli » trouve « Évoli »). */
export const searchKey = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
