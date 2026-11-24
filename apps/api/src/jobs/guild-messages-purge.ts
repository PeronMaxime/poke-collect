import type { Db } from '@poke/db';
import type { ContentCache } from '../content-cache';
import { purgeOldGuildMessages } from '../game/guilds';

/**
 * Discussion de guilde : toutes les `intervalSeconds`, supprime les messages plus anciens que la
 * durée de conservation (`balance.guilds.chat.retentionDays`, voir `purgeOldGuildMessages`). Une
 * purge encore en cours n'est pas doublée.
 */

/** Lance la purge périodique des vieux messages de guilde ; retourne la fonction d'arrêt. */
export function startGuildMessagesPurge({
  db,
  content,
  intervalSeconds,
  onError,
}: {
  db: Db;
  content: ContentCache;
  intervalSeconds: number;
  onError: (err: unknown) => void;
}): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    content
      .get()
      .then((ctx) => purgeOldGuildMessages(db, ctx, new Date()))
      .catch(onError)
      .finally(() => {
        running = false;
      });
  }, intervalSeconds * 1000);
  timer.unref();
  return () => clearInterval(timer);
}
