/**
 * Écran du compte suspendu par la modération : date de fin (ou suspension définitive), motif,
 * adresse pour contester, et déconnexion. Le jeu rouvre seul à la fin de la suspension.
 */
import { useQueryClient } from '@tanstack/react-query';
import type { AccountSuspensionDto } from '@poke/shared';
import { authClient } from '../lib/auth-client';
import { CONTACT_EMAIL } from './LegalPages';

const untilFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' });

/** Compte suspendu : rien du jeu n'est accessible, seulement la déconnexion. */
export function SuspendedPage({ suspension }: { suspension: AccountSuspensionDto }) {
  const queryClient = useQueryClient();
  async function signOut() {
    await authClient.signOut();
    // Comme la déconnexion du jeu : `me` passe à null (écran de connexion), puis le reste est vidé.
    queryClient.setQueryData(['me'], null);
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
  }
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="card w-full max-w-md space-y-4">
        <h1 className="text-xl font-bold">Compte suspendu</h1>
        <p className="text-sm">
          {suspension.permanent
            ? 'Ton compte est suspendu définitivement.'
            : `Ton compte est suspendu jusqu’au ${untilFormat.format(new Date(suspension.until))}. Le jeu rouvrira tout seul à cette date.`}
        </p>
        {suspension.reason && (
          <p className="rounded-lg bg-slate-100 p-3 text-sm dark:bg-slate-800">
            Motif : {suspension.reason}
          </p>
        )}
        <p className="text-sm text-slate-500">
          Une erreur ? Écris-nous à{' '}
          <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
        <button className="btn-ghost w-full" onClick={() => void signOut()}>
          Se déconnecter
        </button>
      </div>
    </main>
  );
}
