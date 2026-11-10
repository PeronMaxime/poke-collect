import { seedContent } from '@poke/content/seed';
import { createDb, ensureSeedContent } from '@poke/db';
import { buildApp } from './app';
import { loadEnv } from './env';
import { readContentSnapshot, writeContentSnapshot } from './content-snapshot';
import { startJobs } from './jobs';
import { consoleMailer, smtpMailer } from './mail';

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

// E-mails : SMTP s'il est configuré ; sinon affichés dans la console, sauf en production.
const mailer = env.smtp
  ? smtpMailer(env.smtp.url, env.smtp.from)
  : process.env.NODE_ENV === 'production'
    ? null
    : consoleMailer((text) => console.log(text));

const { app, content, push } = await buildApp({
  db: handle.db,
  env,
  mailer,
  logger: true,
  ...(env.contentSnapshotWrite && { onContentPublished: saveSnapshot }),
});

// Tâches de fond (compteurs d'espèces, notifications push, coffres de guilde) : pas de worker séparé.
const stopJobs = startJobs({
  db: handle.db,
  content,
  env,
  push,
  onError: (err, job) => app.log.error(err, job),
});

const shutdown = async () => {
  await app.close();
  await stopJobs();
  await handle.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: env.port, host: env.host });
app.log.info(`Base de données : ${handle.driver}`);
