/**
 * Bêta : profil secondaire propre à l'onglet, pour jouer plusieurs profils en même temps.
 * Gardé dans le `sessionStorage` (un par onglet) et envoyé par `api()` dans l'en-tête
 * `x-dex-profile` ; sans valeur, le serveur applique le cookie (dernier profil choisi).
 * À retirer avec les profils secondaires (voir `apps/api/src/beta-profiles.ts`).
 */

const KEY = 'dex-tab-profile';
/** Paramètre d'URL qui ouvre un onglet sur un profil : `/?profil=<id|main>`. */
const URL_PARAM = 'profil';
/** Valeur désignant le profil principal. */
export const MAIN_TAB_PROFILE = 'main';

export function tabProfile(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setTabProfile(profileId: string): void {
  try {
    sessionStorage.setItem(KEY, profileId);
  } catch {
    // Stockage indisponible : l'onglet suivra le cookie.
  }
}

/** Au démarrage : reprend le profil passé dans l'URL puis le retire de la barre d'adresse. */
export function adoptTabProfileFromUrl(): void {
  const url = new URL(window.location.href);
  const profileId = url.searchParams.get(URL_PARAM);
  if (!profileId) return;
  setTabProfile(profileId);
  url.searchParams.delete(URL_PARAM);
  window.history.replaceState(window.history.state, '', url);
}

/** Ouvre le profil dans un nouvel onglet, sans changer celui de l'onglet courant. */
export function openProfileInNewTab(profileId: string): void {
  window.open(`/?${URL_PARAM}=${encodeURIComponent(profileId)}`, '_blank');
}
