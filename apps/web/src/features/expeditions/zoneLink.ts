/**
 * Lien direct vers une zone d'expédition (`#expeditions/<zone>`), suivi depuis le Pokédex ou les
 * quêtes : l'onglet Expéditions s'ouvre sur la zone, prête à lancer.
 */
import { useEffect, useState } from 'react';

/** Lien vers une zone (`#expeditions/<zone>`), depuis le Pokédex. */
export const zoneLink = (zoneId: string) => `#expeditions/${zoneId}`;

function zoneFromHash(): string | null {
  const [tab, zoneId] = window.location.hash.slice(1).split('/');
  return tab === 'expeditions' && zoneId ? decodeURIComponent(zoneId) : null;
}

/**
 * Zone demandée par un lien, à l'arrivée sur la page ou pendant qu'elle est affichée. L'ancre est
 * consommée (l'adresse redevient `#expeditions`) ; à l'appelant d'ouvrir le départ, puis d'appeler
 * la seconde valeur pour oublier la demande.
 */
export function useLinkedZone(): [zoneId: string | null, clear: () => void] {
  const [linkedZoneId, setLinkedZoneId] = useState(zoneFromHash);
  useEffect(() => {
    const consume = () => {
      const zoneId = zoneFromHash();
      if (zoneId) history.replaceState(null, '', '#expeditions');
      return zoneId;
    };
    consume();
    const onHash = () => setLinkedZoneId(consume());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return [linkedZoneId, () => setLinkedZoneId(null)];
}
