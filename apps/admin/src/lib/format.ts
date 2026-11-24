/** Mise en forme des dates de l'admin. */
const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

/** Date et heure courtes en français ; « — » sans date. */
export function formatDate(iso: string | null): string {
  return iso ? dateFormat.format(new Date(iso)) : '—';
}

const dayFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'UTC' });

/** Un jour (AAAA-MM-JJ) en toutes lettres : « 1 décembre 2026 ». */
export function formatDay(day: string): string {
  return dayFormat.format(new Date(`${day}T00:00:00Z`));
}

/** Le jour local de l'exploitant, au format AAAA-MM-JJ (celui des champs de date). */
export function localDay(at: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}
