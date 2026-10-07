import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authClient } from '../lib/auth-client';
import { api } from '../lib/api';

type Mode = 'sign-in' | 'sign-up';

const PROVIDER_LABELS: Record<string, string> = { google: 'Google', discord: 'Discord' };

export function AuthPage() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const config = useQuery({
    queryKey: ['config'],
    queryFn: () => api<{ oauthProviders: string[] }>('/api/config'),
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
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

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="card w-full max-w-sm">
        <h1 className="text-2xl font-bold">Poké Collect</h1>
        <p className="mt-1 text-sm text-slate-500">
          {mode === 'sign-in'
            ? 'Connecte-toi pour reprendre ta collection.'
            : 'Crée ton compte de dresseur.'}
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
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={pending}>
            {mode === 'sign-in' ? 'Se connecter' : 'Créer le compte'}
          </button>
        </form>

        {config.data && config.data.oauthProviders.length > 0 && (
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
          onClick={() => {
            setError(null);
            setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
          }}
        >
          {mode === 'sign-in' ? 'Pas encore de compte ? Inscription' : 'Déjà un compte ? Connexion'}
        </button>
      </div>
    </main>
  );
}
