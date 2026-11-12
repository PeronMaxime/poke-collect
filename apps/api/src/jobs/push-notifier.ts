import type { Db } from '@poke/db';
import type { ContentCache } from '../content-cache';
import { runPushRound } from '../game/push';
import type { PushSender } from '../game/push';

/**
 * Tournée des notifications push : toutes les `intervalSeconds`, prévient les joueurs abonnés de ce
 * qui vient de se terminer (voir `runPushRound`). Une tournée encore en cours n'est pas doublée.
 */

/** Lance la tournée périodique ; retourne la fonction d'arrêt. */
export function startPushNotifier({
  db,
  content,
  send,
  intervalSeconds,
  onError,
}: {
  db: Db;
  content: ContentCache;
  send: PushSender;
  intervalSeconds: number;
  onError: (err: unknown) => void;
}): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    runPushRound(db, content, send, new Date())
      .catch(onError)
      .finally(() => {
        running = false;
      });
  }, intervalSeconds * 1000);
  timer.unref();
  return () => clearInterval(timer);
}
