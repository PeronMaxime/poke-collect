/**
 * Donne (ou retire) le rôle admin à un compte existant, ou remet à zéro son second facteur
 * (téléphone et codes de secours perdus : il devra l'activer à nouveau à sa prochaine connexion).
 * Usage : pnpm admin:promote <email> [--revoke | --reset-2fa]
 */
import { eq } from 'drizzle-orm';
import { createDb, logAdminAction, sessions, twoFactors, users } from '@poke/db';
import { loadEnv } from '../env';

const [email, flag] = process.argv.slice(2);
if (!email || (flag && !['--revoke', '--reset-2fa'].includes(flag))) {
  console.error('Usage : pnpm admin:promote <email> [--revoke | --reset-2fa]');
  process.exit(1);
}

const env = loadEnv();
const handle = createDb({ databaseUrl: env.databaseUrl, pgliteDataDir: env.pgliteDataDir });
await handle.migrate();

const [user] = await handle.db
  .select({ id: users.id })
  .from(users)
  .where(eq(users.email, email.toLowerCase()));
if (!user) {
  console.error(`Aucun compte avec l'email ${email}. Créez d'abord le compte via le jeu.`);
  await handle.close();
  process.exit(1);
}

if (flag === '--reset-2fa') {
  // Sessions supprimées aussi : celles ouvertes avec l'ancien second facteur ne servent plus.
  await handle.db.transaction(async (tx) => {
    await tx.delete(twoFactors).where(eq(twoFactors.userId, user.id));
    await tx.delete(sessions).where(eq(sessions.userId, user.id));
    await tx
      .update(users)
      .set({ twoFactorEnabled: false, updatedAt: new Date() })
      .where(eq(users.id, user.id));
  });
  await logAdminAction(handle.db, {
    adminId: null,
    action: 'user.reset-2fa',
    entity: 'user',
    entityId: user.id,
    after: { twoFactorEnabled: false, via: 'cli' },
  });
  await handle.close();
  console.log(`Second facteur de ${email} remis à zéro : à réactiver à la prochaine connexion.`);
  process.exit(0);
}

const role = flag === '--revoke' ? 'player' : 'admin';
await handle.db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, user.id));
await logAdminAction(handle.db, {
  adminId: null,
  action: role === 'admin' ? 'user.promote' : 'user.revoke',
  entity: 'user',
  entityId: user.id,
  after: { role, via: 'cli' },
});
await handle.close();
console.log(`${email} a maintenant le rôle « ${role} ».`);
