import { seedContent } from '@poke/content';
import { createDb, ensureSeedContent } from '@poke/db';
import { buildApp } from './app';
import { loadEnv } from './env';
import { readContentSnapshot, writeContentSnapshot } from './content-snapshot';
import { startPushNotifier } from './game/push';

const env = loadEnv();
const handle = createDb({ databaseUrl: env.databaseUrl, pgliteDataDir: env.pgliteDataDir });

await handle.migrate();
// Base neuve : contenu de l'instantané versionné s'il existe, sinon contenu de test.
const snapshot = readContentSnapshot(env.contentSnapshotPath);
if (await ensureSeedContent(handle.db, snapshot ?? seedContent)) {
  console.log(
    snapshot
      ? `Contenu importé depuis ${env.contentSnapshotPath} (version 1, publiée).`
      : 'Contenu de test importé (version 1, publiée).',
  );
}

// Développement : l'instantané suit le contenu publié (migrations comprises).
const saveSnapshot = async () => {
  if (await writeContentSnapshot(handle.db, env.contentSnapshotPath)) {
    console.log(`Instantané du contenu mis à jour : ${env.contentSnapshotPath}`);
  }
};
if (env.contentSnapshotWrite) {
  await saveSnapshot().catch((err: unknown) => console.error('Instantané du contenu :', err));
}

const { app, content, push } = await buildApp({
  db: handle.db,
  env,
  logger: true,
  ...(env.contentSnapshotWrite && { onContentPublished: saveSnapshot }),
});

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
