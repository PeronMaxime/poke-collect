/**
 * Connexion à l'admin : adresse et mot de passe (captcha si le serveur le demande), puis code du
 * second facteur. Le rôle et le second facteur sont vérifiés ensuite par `AdminGate`.
 */
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthConfigDto } from '@poke/shared';
import { TwoFactorCodeForm } from '@web/components/TwoFactorCodeForm';
import { useCaptcha } from '@web/lib/captcha';
import { authErrorMessage } from '@web/lib/labels/errors';
import { api } from '../lib/api';
import { authClient } from '../lib/auth-client';

/** Formulaire de connexion ; une fois connecté, `AdminGate` relit le rôle et le second facteur. */
export function LoginPage() {
  const queryClient = useQueryClient();
  const config = useQuery({
    queryKey: ['config'],
    queryFn: () => api<AuthConfigDto>('/api/config'),
  });
  const captcha = useCaptcha(config.data?.captchaSiteKey);
  const { mount: captchaMount, ready: captchaReady } = captcha;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [needsCode, setNeedsCode] = useState(false);
  const recheck = () => queryClient.invalidateQueries({ queryKey: ['admin-me'] });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result = await authClient.signIn.email({
      email,
      password,
      fetchOptions: captcha.fetchOptions,
    });
    setPending(false);
    captcha.reset();
    if (result.error) {
      setError(authErrorMessage(result.error));
      return;
    }
    if ('twoFactorRedirect' in result.data && result.data.twoFactorRedirect) {
      setNeedsCode(true);
      return;
    }
    // Pas encore de second facteur : `AdminGate` affiche son activation.
    await recheck();
  }

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="card w-full max-w-sm space-y-3">
        <div className="pb-2">
          <h1 className="text-xl font-bold">Administration</h1>
          <p className="text-sm text-slate-500">
            {needsCode
              ? 'Saisis le code de ton application d’authentification.'
              : 'Connexion avec un compte administrateur.'}
          </p>
        </div>
        {needsCode ? (
          <TwoFactorCodeForm
            verify={(code, backup) =>
              backup
                ? authClient.twoFactor.verifyBackupCode({ code })
                : authClient.twoFactor.verifyTotp({ code })
            }
            onDone={recheck}
            onCancel={() => setNeedsCode(false)}
          />
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
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
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {config.data?.captchaSiteKey && <div ref={captchaMount} className="min-h-16" />}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              className="btn-primary w-full"
              disabled={pending || !captchaReady}
            >
              Se connecter
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
