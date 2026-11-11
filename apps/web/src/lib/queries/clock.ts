/**
 * L'heure : celle du joueur, envoyée au serveur, et l'écart avec celle du serveur.
 */

/** Décalage de l'heure locale par rapport à UTC, envoyé au serveur (évolutions jour / nuit). */
export const utcOffsetMinutes = () => -new Date().getTimezoneOffset();

/** Décalage entre l'horloge du serveur et celle du navigateur (comptes à rebours justes). */
export function serverOffset(data: { serverTime: string } | undefined, updatedAt: number) {
  return data ? Date.parse(data.serverTime) - updatedAt : 0;
}
