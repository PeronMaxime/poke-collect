/**
 * Garde de toutes les pages : formulaire de connexion sans session, « Accès refusé » sans le rôle
 * admin, activation du second facteur s'il manque, reconnexion si la session ne l'a pas passé,
 * sinon les pages, avec l'utilisateur connecté dans `AdminUserContext`. Le serveur vérifie tout
 * à chaque requête : ce garde n'adapte que l'affichage.
 */
import { useQuery } from '@tanstack/react-query';
import { Outlet } from 'react-router';
import { ApiError, api } from '../lib/api';
import type { AdminUser } from '../lib/admin-user';
import { AdminUserContext } from '../lib/admin-user';
import { LoginPage } from '../pages/LoginPage';
import { TwoFactorSetupPage } from '../pages/TwoFactorSetupPage';
import { SignOutButton } from './SignOutButton';

type GateState =
  | { status: 'ok'; user: AdminUser }
  | { status: 'anonymous' }
  | { status: 'forbidden' }
  | { status: 'setup-2fa' }
  | { status: 'reauth-2fa' };

/** Le rôle est vérifié par le serveur (/api/admin/me) ; ce garde ne fait qu'adapter l'affichage. */
export function AdminGate() {
  const gate = useQuery({
    queryKey: ['admin-me'],
    queryFn: async (): Promise<GateState> => {
      try {
        const { user } = await api<{ user: AdminUser }>('/api/admin/me');
        return { status: 'ok', user };
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return { status: 'anonymous' };
        if (err instanceof ApiError && err.code === 'ADMIN_2FA_SETUP_REQUIRED') {
          return { status: 'setup-2fa' };
        }
        if (err instanceof ApiError && err.code === 'ADMIN_2FA_REQUIRED') {
          return { status: 'reauth-2fa' };
        }
        if (err instanceof ApiError && err.status === 403) return { status: 'forbidden' };
        throw err;
      }
    },
  });

  if (gate.isPending) {
    return <div className="grid min-h-screen place-items-center text-slate-500">Chargement…</div>;
  }
  if (gate.isError) {
    return (
      <div className="grid min-h-screen place-items-center text-red-600">
        Impossible de joindre le serveur. L’API est-elle lancée ?
      </div>
    );
  }
  if (gate.data.status === 'anonymous') return <LoginPage />;
  if (gate.data.status === 'setup-2fa') return <TwoFactorSetupPage />;
  if (gate.data.status === 'reauth-2fa') {
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <div className="card max-w-sm space-y-4 text-center">
          <h1 className="text-lg font-semibold">Code demandé</h1>
          <p className="text-sm text-slate-500">
            Cette session a été ouverte sans le code de ton application (connexion Google ou
            Discord, ou avant l’activation du second facteur). Déconnecte-toi, puis reconnecte-toi
            avec ton mot de passe et ton code.
          </p>
          <SignOutButton />
        </div>
      </main>
    );
  }
  if (gate.data.status === 'forbidden') {
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <div className="card max-w-sm space-y-4 text-center">
          <h1 className="text-lg font-semibold">Accès refusé</h1>
          <p className="text-sm text-slate-500">
            Ce compte n’a pas le rôle administrateur. Un admin peut l’attribuer avec
            <code className="mx-1 rounded bg-slate-100 px-1 dark:bg-slate-800">
              pnpm admin:promote
            </code>
            .
          </p>
          <SignOutButton />
        </div>
      </main>
    );
  }
  return (
    <AdminUserContext value={gate.data.user}>
      <Outlet />
    </AdminUserContext>
  );
}
