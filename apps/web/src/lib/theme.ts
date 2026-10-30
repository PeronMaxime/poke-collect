/**
 * Thème de l'interface, choisi par appareil. Le script en ligne de `index.html` applique déjà le
 * thème enregistré avant le premier affichage (même clé, même logique) pour éviter un flash.
 */
export type ThemePreference = 'system' | 'light' | 'dark';

const THEME_KEY = 'theme';
const SYSTEM_DARK = '(prefers-color-scheme: dark)';

export function loadThemePreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
}

function applyTheme(preference: ThemePreference) {
  const dark =
    preference === 'dark' || (preference === 'system' && window.matchMedia(SYSTEM_DARK).matches);
  document.documentElement.classList.toggle('dark', dark);
}

export function setThemePreference(preference: ThemePreference) {
  try {
    if (preference === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, preference);
  } catch {
    // Stockage indisponible : le thème vaut pour cette visite seulement.
  }
  applyTheme(preference);
}

/** Suit les changements du thème de l'appareil et ceux faits dans un autre onglet. */
export function watchTheme() {
  const refresh = () => applyTheme(loadThemePreference());
  window.matchMedia(SYSTEM_DARK).addEventListener('change', refresh);
  window.addEventListener('storage', (e) => {
    if (e.key === THEME_KEY || e.key === null) refresh();
  });
}
