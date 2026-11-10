import type { Db } from '@poke/db';
import type { ContentCache } from '../content-cache';
import { settleGuildQuests } from '../game/guilds';

/**
 * Coffres de guilde : toutes les `intervalSeconds`, distribue les coffres des quêtes dont la
 * période (jour ou semaine) vient de finir (voir `settleGuildQuests`). Une distribution encore en
 * cours n'est pas doublée.
 */

/** Lance la distribution périodique des coffres de guilde ; retourne la fonction d'arrêt. */
export function startGuildRewards({
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
      .then((ctx) => settleGuildQuests(db, ctx, new Date()))
      .catch(onError)
      .finally(() => {
        running = false;
      });
  }, intervalSeconds * 1000);
  timer.unref();
  return () => clearInterval(timer);
}
