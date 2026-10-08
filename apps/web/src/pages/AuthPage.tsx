import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authClient } from '../lib/auth-client';
import { api } from '../lib/api';

type Mode = 'sign-in' | 'sign-up' | 'forgot';

/** Page où mène le lien de l'e-mail de réinitialisation (voir App). */
export const RESET_PASSWORD_PATH = '/reinitialiser-mot-de-passe';

const PROVIDER_LABELS: Record<string, string> = { google: 'Google', discord: 'Discord' };

export function AuthPage() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const config = useQuery({
    queryKey: ['config'],
    queryFn: () => api<{ oauthProviders: string[]; passwordReset: boolean }>('/api/config'),
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setPending(true);
    if (mode === 'forgot') {
      const result = await authClient.requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}${RESET_PASSWORD_PATH}`,
      });
      setPending(false);
      if (result.error) {
        setError(result.error.message ?? 'Envoi impossible, réessaie plus tard.');
        return;
      }
      // Même message que l'adresse existe ou non : on ne révèle pas qui a un compte.
      setNotice('Si un compte existe avec cette adresse, un e-mail vient d’être envoyé.');
      return;
    }
    const result =
      mode === 'sign-in'
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name: email.split('@')[0] ?? email });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? 'Échec de l’authentification');
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['me'] });
  }

  function switchMode(next: Mode) {
    setError(null);
    setNotice(null);
    setMode(next);
  }

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="card w-full max-w-sm">
        <h1 className="text-2xl font-bold">Dexpedition</h1>
        <p className="mt-1 text-sm text-slate-500">
          {mode === 'sign-in'
            ? 'Connecte-toi pour reprendre ta collection.'
            : mode === 'sign-up'
              ? 'Crée ton compte de dresseur.'
              : 'Indique ton adresse : tu recevras un lien pour choisir un nouveau mot de passe.'}
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <label className="block text-sm">
            Email
            <input
              className="input mt-1"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {mode !== 'forgot' && (
            <label className="block text-sm">
              Mot de passe
              <input
                className="input mt-1"
                type="password"
                autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                minLength={8}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {notice && <p className="text-sm text-green-700 dark:text-green-400">{notice}</p>}
          <button type="submit" className="btn-primary w-full" disabled={pending}>
            {mode === 'sign-in'
              ? 'Se connecter'
              : mode === 'sign-up'
                ? 'Créer le compte'
                : 'Envoyer le lien'}
          </button>
        </form>

        {mode === 'sign-in' && config.data?.passwordReset && (
          <button
            className="mt-2 w-full text-center text-sm text-slate-500 hover:underline"
            onClick={() => switchMode('forgot')}
          >
            Mot de passe oublié ?
          </button>
        )}

        {mode !== 'forgot' && config.data && config.data.oauthProviders.length > 0 && (
          <div className="mt-4 space-y-2">
            {config.data.oauthProviders.map((provider) => (
              <button
                key={provider}
                className="btn-ghost w-full"
                onClick={() =>
                  authClient.signIn.social({ provider, callbackURL: window.location.origin })
                }
              >
                Continuer avec {PROVIDER_LABELS[provider] ?? provider}
              </button>
            ))}
          </div>
        )}

        <button
          className="mt-4 w-full text-center text-sm text-slate-500 hover:underline"
          onClick={() => switchMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}
        >
          {mode === 'sign-in'
            ? 'Pas encore de compte ? Inscription'
            : mode === 'sign-up'
              ? 'Déjà un compte ? Connexion'
              : 'Retour à la connexion'}
        </button>
      </div>
    </main>
  );
}
