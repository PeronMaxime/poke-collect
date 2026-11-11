/**
 * Mise en forme des durées, des comptes à rebours et de l'argent.
 */

/** « 45 min », « 1 h 30 » ; les durées raccourcies par un talent ont des secondes (« 1 min 48 s »). */
export function formatDuration(minutes: number): string {
  const total = Math.round(minutes * 60);
  const s = total % 60;
  const whole = (total - s) / 60;
  if (s) {
    const h = Math.floor(whole / 60);
    const m = whole % 60;
    return [h && `${h} h`, m && `${m} min`, `${s} s`].filter(Boolean).join(' ');
  }
  if (whole < 60) return `${whole} min`;
  const h = Math.floor(whole / 60);
  const m = whole % 60;
  return m ? `${h} h ${m}` : `${h} h`;
}

/** Compte à rebours « 1:05:09 » ou « 5:09 » ; 0 au plus bas. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** « 1 500 ₽ ». */
export function formatMoney(amount: number): string {
  return `${amount.toLocaleString('fr-FR')} ₽`;
}
