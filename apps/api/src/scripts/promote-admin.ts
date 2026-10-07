/**
 * Donne (ou retire) le rôle admin à un compte existant.
 * Usage : pnpm admin:promote <email> [--revoke]
 */
import { eq } from 'drizzle-orm';
import { createDb, logAdminAction, users } from '@poke/db';
import { loadEnv } from '../env';

const [email, flag] = process.argv.slice(2);
if (!email) {
  console.error('Usage : pnpm admin:promote <email> [--revoke]');
  process.exit(1);
}
const role = flag === '--revoke' ? 'player' : 'admin';

const env = loadEnv();
const handle = createDb({ databaseUrl: env.databaseUrl, pgliteDataDir: env.pgliteDataDir });
await handle.migrate();

const [updated] = await handle.db
  .update(users)
  .set({ role, updatedAt: new Date() })
  .where(eq(users.email, email.toLowerCase()))
  .returning({ id: users.id });

if (!updated) {
  console.error(`Aucun compte avec l'email ${email}. Créez d'abord le compte via le jeu.`);
  await handle.close();
  process.exit(1);
}

await logAdminAction(handle.db, {
  adminId: null,
  action: role === 'admin' ? 'user.promote' : 'user.revoke',
  entity: 'user',
  entityId: updated.id,
  after: { role, via: 'cli' },
});
await handle.close();
console.log(`${email} a maintenant le rôle « ${role} ».`);
