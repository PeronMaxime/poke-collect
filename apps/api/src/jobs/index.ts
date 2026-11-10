import type { Db } from '@poke/db';
import type { ContentCache } from '../content-cache';
import type { Env } from '../env';
import type { PushSender } from '../game/push';
import { startGuildRewards } from './guild-rewards';
import { startPushNotifier } from './push-notifier';
import { startSpeciesCountsFlush } from './species-counts';

/**
 * Tâches de fond de l'API : tout ce qui tourne à intervalle régulier, hors des requêtes.
 *
 * | Tâche                 | Fichier            | Rythme                  | Par processus ? |
 * | --------------------- | ------------------ | ----------------------- | --------------- |
 * | Compteurs d'espèces   | `species-counts`   | 30 s                    | oui, toujours   |
 * | Notifications push    | `push-notifier`    | `PUSH_INTERVAL_SECONDS` | non : un seul   |
 * | Coffres de guilde     | `guild-rewards`    | 60 s                    | non : un seul   |
 *
 * L'API tourne aujourd'hui en un seul processus, qui lance tout. Si l'on en lançait plusieurs, un
 * seul devrait garder `BACKGROUND_JOBS` actif : les autres le mettent à `0` et ne lancent que les
 * compteurs d'espèces (voir docs/ARCHITECTURE.md, section 10).
 */

/** Intervalle d'écriture des compteurs d'espèces. */
const SPECIES_COUNTS_INTERVAL_MS = 30_000;
/** Intervalle de distribution des coffres de guilde. */
const GUILD_REWARDS_INTERVAL_SECONDS = 60;

export interface JobsOptions {
  db: Db;
  content: ContentCache;
  env: Pick<Env, 'backgroundJobs' | 'pushIntervalSeconds'>;
  /** Envoi des notifications ; null : notifications push désactivées (pas de clés VAPID). */
  push: PushSender | null;
  /** Une tâche a échoué : l'erreur est journalisée, la tâche réessaie au tour suivant. */
  onError: (err: unknown, job: string) => void;
}

/**
 * Lance les tâches de fond ; la fonction retournée les arrête, après une dernière écriture des
 * compteurs d'espèces. À appeler une fois par processus, au démarrage du serveur.
 */
export function startJobs({ db, content, env, push, onError }: JobsOptions): () => Promise<void> {
  const stopSpeciesCounts = startSpeciesCountsFlush(db, SPECIES_COUNTS_INTERVAL_MS, (err) =>
    onError(err, 'Compteurs des espèces'),
  );
  if (!env.backgroundJobs) return stopSpeciesCounts;

  const stopPush =
    push && env.pushIntervalSeconds > 0
      ? startPushNotifier({
          db,
          content,
          send: push,
          intervalSeconds: env.pushIntervalSeconds,
          onError: (err) => onError(err, 'Notifications push'),
        })
      : () => {};
  const stopGuildRewards = startGuildRewards({
    db,
    content,
    intervalSeconds: GUILD_REWARDS_INTERVAL_SECONDS,
    onError: (err) => onError(err, 'Coffres de guilde'),
  });
  return async () => {
    stopPush();
    stopGuildRewards();
    await stopSpeciesCounts();
  };
}
