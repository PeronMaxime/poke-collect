import { useQuery } from '@tanstack/react-query';
import type { MeResponse } from '@poke/shared';
import { ApiError, api } from './lib/api';
import { AuthPage } from './pages/AuthPage';
import { CreateProfilePage } from './pages/CreateProfilePage';
import { HomePage } from './pages/HomePage';
import { StarterPage } from './pages/StarterPage';

/** Aiguillage : non connecté → connexion ; sans profil → création du dresseur ; sinon → jeu. */
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
