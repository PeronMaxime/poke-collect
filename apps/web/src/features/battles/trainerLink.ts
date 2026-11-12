/**
 * Lien vers le combat d'un dresseur (`#battles/<dresseur>`), suivi depuis une étape de quête.
 */
import { useEffect, useState } from 'react';

/** Lien vers le combat d'un dresseur (`#battles/<dresseur>`), depuis une étape de quête. */
export const trainerBattleLink = (trainerId: string) => `#battles/${encodeURIComponent(trainerId)}`;

/** Dresseur désigné par l'adresse de la page, s'il y en a un. */
function trainerFromHash(): string | null {
  const [tab, trainerId] = window.location.hash.slice(1).split('/');
  return tab === 'battles' && trainerId ? decodeURIComponent(trainerId) : null;
}

/**
 * Dresseur du lien suivi : l'ancre est consommée (l'adresse redevient `#battles`) à l'arrivée et à
 * chaque changement d'adresse ; à la page de le remettre à `null` une fois traité.
 */
export function useTrainerLink() {
  const [linkedTrainerId, setLinkedTrainerId] = useState(trainerFromHash);
  useEffect(() => {
    const consume = () => {
      const trainerId = trainerFromHash();
      if (trainerId) history.replaceState(null, '', '#battles');
      return trainerId;
    };
    consume();
    const onHash = () => setLinkedTrainerId(consume());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return [linkedTrainerId, setLinkedTrainerId] as const;
}
