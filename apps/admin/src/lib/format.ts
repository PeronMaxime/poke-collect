/** Mise en forme des dates de l'admin. */
const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

/** Date et heure courtes en français ; « — » sans date. */
export function formatDate(iso: string | null): string {
  return iso ? dateFormat.format(new Date(iso)) : '—';
}
