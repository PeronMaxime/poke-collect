/**
 * Ce que le navigateur retient d'une visite à l'autre (`localStorage`) : préférences d'affichage
 * et réglages de confort, jamais l'état du jeu.
 *
 * Le stockage peut manquer ou refuser d'écrire (navigation privée, quota, cookies bloqués) : ces
 * fonctions ne lèvent jamais d'erreur. Une lecture impossible rend `null`, une écriture impossible
 * est ignorée, et le réglage ne vaut alors que pour la visite en cours.
 */

/** Texte enregistré sous `key` ; `null` s'il n'y en a pas. */
export function readStoredText(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Enregistre un texte sous `key`. */
export function writeStoredText(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Stockage indisponible : la valeur ne sera pas retenue.
  }
}

/** Oublie ce qui est enregistré sous `key`. */
export function removeStored(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Stockage indisponible : rien à oublier.
  }
}

/**
 * Valeur JSON enregistrée sous `key` ; `null` si elle est absente ou illisible. Le résultat est
 * `unknown` : à l'appelant de vérifier sa forme, une ancienne version du jeu a pu l'écrire.
 */
export function readStoredJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

/** Enregistre une valeur en JSON sous `key`. */
export function writeStoredJson(key: string, value: unknown): void {
  writeStoredText(key, JSON.stringify(value));
}
