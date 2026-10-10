import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { MeResponse } from '@poke/shared';
import { ApiError, api } from './lib/api';
import { AuthPage, RESET_PASSWORD_PATH } from './pages/AuthPage';
import { CHANGELOG_PATH, ChangelogPage } from './pages/ChangelogPage';
import { CreateProfilePage } from './pages/CreateProfilePage';
import { HomePage } from './pages/HomePage';
import { LEGAL_PATHS, LegalPage } from './pages/LegalPages';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { StarterPage } from './pages/StarterPage';

/** Chemin de l'adresse, suivi lors des changements faits avec `history` (événement popstate). */
function usePathname(): string {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener('popstate', onChange);
      return () => window.removeEventListener('popstate', onChange);
    },
    () => window.location.pathname,
  );
}

/**
 * Aiguillage : lien de réinitialisation du mot de passe → nouveau mot de passe ; nouveautés et
 * pages légales (accessibles sans compte) ; non connecté → connexion ; sans profil → création du dresseur ;
 * sinon → jeu.
 */
export function App() {
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api<MeResponse>('/api/me');
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
  });
  const pathname = usePathname();

  if (pathname === RESET_PASSWORD_PATH) return <ResetPasswordPage />;
  if (pathname === CHANGELOG_PATH) return <ChangelogPage />;
  if (LEGAL_PATHS.includes(pathname)) return <LegalPage pathname={pathname} />;
  if (me.isPending) {
    return <div className="grid min-h-screen place-items-center text-slate-500">Chargement…</div>;
  }
  if (me.isError) {
    return (
      <div className="grid min-h-screen place-items-center text-red-600">
        Impossible de joindre le serveur. L’API est-elle lancée ?
      </div>
    );
  }
  if (!me.data) return <AuthPage />;
  if (!me.data.profile) return <CreateProfilePage />;
  if (me.data.profile.starterSpeciesId === null) return <StarterPage profile={me.data.profile} />;
  return <HomePage me={me.data} profile={me.data.profile} />;
}
