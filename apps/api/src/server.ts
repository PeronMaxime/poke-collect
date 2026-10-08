import { seedContent } from '@poke/content';
import { createDb, ensureSeedContent } from '@poke/db';
import { buildApp } from './app';
import { loadEnv } from './env';
import { startPushNotifier } from './game/push';

const env = loadEnv();
const handle = createDb({ databaseUrl: env.databaseUrl, pgliteDataDir: env.pgliteDataDir });

await handle.migrate();
if (await ensureSeedContent(handle.db, seedContent)) {
  console.log('Contenu de test importé (version 1, publiée).');
}

const { app, content, push } = await buildApp({ db: handle.db, env, logger: true });

// Tournée des notifications push (expéditions, combats, œufs) : pas de worker séparé.
const stopPush =
  push && env.pushIntervalSeconds > 0
    ? startPushNotifier({
        db: handle.db,
        content,
        send: push,
        intervalSeconds: env.pushIntervalSeconds,
        onError: (err) => app.log.error(err, 'Notifications push'),
      })
    : () => {};

const shutdown = async () => {
  stopPush();
  await app.close();
  await handle.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: env.port, host: env.host });
app.log.info(`Base de données : ${handle.driver}`);
