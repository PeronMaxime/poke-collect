import { useEffect, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PublicContentDto } from '@poke/shared';
import { keys, meQuery } from './lib/game';
import { usePokemonShadows } from './lib/pokemon-shadows';
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

/** Intervalle de vérification de la version du contenu (rappel de `/api/me`). */
const CONTENT_CHECK_MS = 5 * 60_000;

/**
 * Le contenu est gardé sans limite de durée : il est rechargé seulement quand le serveur annonce
 * une autre version publiée (réponse 304 sans corps si l'ETag n'a pas changé).
 */
function useContentVersionWatch(serverVersion: number | null | undefined) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (serverVersion == null) return;
    const loaded = queryClient.getQueryData<PublicContentDto>(keys.content)?.versionId;
    if (loaded !== undefined && loaded !== serverVersion) {
      void queryClient.invalidateQueries({ queryKey: keys.content });
    }
  }, [queryClient, serverVersion]);
}

/**
 * Aiguillage : lien de réinitialisation du mot de passe → nouveau mot de passe ; nouveautés et
 * pages légales (accessibles sans compte) ; non connecté → connexion ; sans profil → création du dresseur ;
 * sinon → jeu.
 */
export function App() {
  const me = useQuery({
    ...meQuery,
    // Après des essais ratés, on retente toutes les 5 s tant que le serveur ne répond pas. Connecté,
    // un rappel toutes les 5 min suffit à voir passer une nouvelle version du contenu.
    refetchInterval: (query) =>
      query.state.status === 'error' ? 5000 : query.state.data ? CONTENT_CHECK_MS : false,
  });
  useContentVersionWatch(me.data?.contentVersion);
  const pathname = usePathname();
  usePokemonShadows(me.data?.profile?.starterSpeciesId != null);

  if (pathname === RESET_PASSWORD_PATH) return <ResetPasswordPage />;
  if (pathname === CHANGELOG_PATH) return <ChangelogPage />;
  if (LEGAL_PATHS.includes(pathname)) return <LegalPage pathname={pathname} />;
  if (me.isPending) {
    return <div className="grid min-h-screen place-items-center text-slate-500">Chargement…</div>;
  }
  // Écran plein seulement si le serveur n'a jamais répondu : un rechargement raté ne fait pas
  // disparaître le jeu (les données déjà reçues restent affichées, avec un bandeau).
  if (me.isError && me.data === undefined) {
    return (
      <div className="grid min-h-screen place-items-center px-4 text-center text-red-600">
        Impossible de joindre le serveur. Vérifie ta connexion, puis recharge la page.
      </div>
    );
  }
  if (!me.data) return <AuthPage />;
  const banner = me.isError ? <ConnectionBanner /> : null;
  if (!me.data.profile) {
    return (
      <>
        {banner}
        <CreateProfilePage />
      </>
    );
  }
  if (me.data.profile.starterSpeciesId === null) {
    return (
      <>
        {banner}
        <StarterPage profile={me.data.profile} />
      </>
    );
  }
  return (
    <>
      {banner}
      <HomePage me={me.data} profile={me.data.profile} />
    </>
  );
}

/** Bandeau affiché tant que le rechargement du profil échoue : le jeu reste utilisable. */
function ConnectionBanner() {
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 bg-amber-500 px-4 py-1.5 text-center text-sm font-medium text-white shadow"
    >
      Connexion au serveur perdue, nouvel essai…
    </div>
  );
}
