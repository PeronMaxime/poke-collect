import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authClient } from '../lib/auth-client';

/**
 * Nouveau mot de passe, depuis le lien de l'e-mail : l'API redirige ici avec `?token=…`, ou
 * `?error=INVALID_TOKEN` si le lien a expiré ou a déjà servi.
 */
export function ResetPasswordPage() {
  const queryClient = useQueryClient();
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  /** Retour au jeu : l'adresse redevient `/` et l'écran de connexion s'affiche. */
  function leave() {
    window.history.replaceState(null, '', '/');
    void queryClient.invalidateQueries({ queryKey: ['me'] });
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError('Les deux mots de passe ne sont pas identiques.');
      return;
    }
    setError(null);
    setPending(true);
    const result = await authClient.resetPassword({ newPassword: password, token: token! });
    setPending(false);
    if (result.error) {
      setError(
        result.error.code === 'INVALID_TOKEN'
          ? 'Ce lien a expiré ou a déjà servi : demande un nouvel e-mail.'
          : (result.error.message ?? 'Échec de la réinitialisation'),
      );
      return;
    }
    setDone(true);
  }

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="card w-full max-w-sm">
        <h1 className="text-2xl font-bold">Nouveau mot de passe</h1>
        {!token ? (
          <p className="mt-3 text-sm text-red-600">
            Ce lien a expiré ou a déjà servi : demande un nouvel e-mail depuis l’écran de connexion.
          </p>
        ) : done ? (
          <p className="mt-3 text-sm text-green-700 dark:text-green-400">
            Mot de passe modifié. Tous tes appareils ont été déconnectés : reconnecte-toi avec le
            nouveau mot de passe.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-3">
            <label className="block text-sm">
              Nouveau mot de passe
              <input
                className="input mt-1"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              Confirmation
              <input
                className="input mt-1"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" className="btn-primary w-full" disabled={pending}>
              Enregistrer
            </button>
          </form>
        )}
        <button
          className="mt-4 w-full text-center text-sm text-slate-500 hover:underline"
          onClick={leave}
        >
          Aller à la connexion
        </button>
      </div>
    </main>
  );
}
