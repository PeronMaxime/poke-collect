/**
 * Connexion, inscription et mot de passe oublié, avant d'entrer dans le jeu ; captcha et
 * confirmation de l'adresse si le serveur les demande, code du second facteur pour un compte
 * administrateur.
 */
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthConfigDto } from '@poke/shared';
import { TwoFactorCodeForm } from '../components/TwoFactorCodeForm';
import { authClient } from '../lib/auth-client';
import { useCaptcha } from '../lib/captcha';
import { authErrorMessage } from '../lib/labels';
import { FanDisclaimer, LegalLinks, PRIVACY_PATH } from './LegalPages';
import { fetchAuthConfig } from '../lib/queries';

type Mode = 'sign-in' | 'sign-up' | 'forgot' | 'two-factor';

/** Page où mène le lien de l'e-mail de réinitialisation (voir App). */
export const RESET_PASSWORD_PATH = '/reinitialiser-mot-de-passe';

const PROVIDER_LABELS: Record<string, string> = { google: 'Google', discord: 'Discord' };

const SUBTITLES: Record<Mode, string> = {
  'sign-in': 'Connecte-toi pour reprendre ta collection.',
  'sign-up': 'Crée ton compte de dresseur.',
  forgot: 'Indique ton adresse : tu recevras un lien pour choisir un nouveau mot de passe.',
  'two-factor': 'Ce compte est protégé par un second facteur : saisis le code de ton application.',
};

const SUBMIT_LABELS: Record<Exclude<Mode, 'two-factor'>, string> = {
  'sign-in': 'Se connecter',
  'sign-up': 'Créer le compte',
  forgot: 'Envoyer le lien',
};

/** État et envoi du formulaire (mode, champs, captcha, messages). */
function useAuthForm(config: AuthConfigDto | undefined) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const captcha = useCaptcha(config?.captchaSiteKey);
  const enterGame = () => queryClient.invalidateQueries({ queryKey: ['me'] });

  function switchMode(next: Mode) {
    setError(null);
    setNotice(null);
    setMode(next);
  }

  async function submit() {
    const { fetchOptions } = captcha;
    if (mode === 'forgot') {
      const result = await authClient.requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}${RESET_PASSWORD_PATH}`,
        fetchOptions,
      });
      if (result.error) return setError(authErrorMessage(result.error));
      // Même message que l'adresse existe ou non : on ne révèle pas qui a un compte.
      return setNotice('Si un compte existe avec cette adresse, un e-mail vient d’être envoyé.');
    }
    if (mode === 'sign-up') {
      const result = await authClient.signUp.email({
        email,
        password,
        name: email.split('@')[0] ?? email,
        callbackURL: window.location.origin,
        fetchOptions,
      });
      if (result.error) return setError(authErrorMessage(result.error));
      if (!result.data.token) {
        // Adresse à confirmer : pas de session avant le clic sur le lien.
        setMode('sign-in');
        return setNotice(
          `Un e-mail de confirmation vient de partir vers ${email} : ouvre son lien pour entrer dans le jeu.`,
        );
      }
    } else {
      const result = await authClient.signIn.email({ email, password, fetchOptions });
      if (result.error) return setError(authErrorMessage(result.error));
      if ('twoFactorRedirect' in result.data && result.data.twoFactorRedirect) {
        return setMode('two-factor');
      }
    }
    await enterGame();
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setPending(true);
    try {
      await submit();
    } finally {
      setPending(false);
      captcha.reset();
    }
  }

  return {
    mode,
    switchMode,
    email,
    setEmail,
    password,
    setPassword,
    error,
    notice,
    pending,
    captcha,
    onSubmit,
    enterGame,
  };
}

/** Écran de connexion, d'inscription et de mot de passe oublié. */
export function AuthPage() {
  const config = useQuery({ queryKey: ['config'], queryFn: () => fetchAuthConfig() });
  const form = useAuthForm(config.data);
  const { mode, switchMode } = form;
  const { mount: captchaMount, ready: captchaReady, failed: captchaFailed } = form.captcha;

  return (
    <main className="grid min-h-screen place-items-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="card">
          <h1 className="text-2xl font-bold">Dexpedition</h1>
          <p className="mt-1 text-sm text-slate-500">{SUBTITLES[mode]}</p>

          {mode === 'two-factor' ? (
            <div className="mt-6">
              <TwoFactorCodeForm
                verify={(code, backup) =>
                  backup
                    ? authClient.twoFactor.verifyBackupCode({ code })
                    : authClient.twoFactor.verifyTotp({ code })
                }
                onDone={form.enterGame}
                onCancel={() => switchMode('sign-in')}
              />
            </div>
          ) : (
            <form onSubmit={form.onSubmit} className="mt-6 space-y-3">
              <label className="block text-sm">
                Email
                <input
                  className="input mt-1"
                  type="email"
                  autoComplete="email"
                  required
                  value={form.email}
                  onChange={(e) => form.setEmail(e.target.value)}
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
                    value={form.password}
                    onChange={(e) => form.setPassword(e.target.value)}
                  />
                </label>
              )}
              {mode === 'sign-up' && (
                <p className="text-xs text-slate-500">
                  Tes données servent uniquement au jeu : voir la{' '}
                  <a href={PRIVACY_PATH} target="_blank" className="underline">
                    politique de confidentialité
                  </a>
                  .
                </p>
              )}
              {config.data?.captchaSiteKey && <div ref={captchaMount} className="min-h-16" />}
              {captchaFailed && (
                <p className="text-sm text-red-600">
                  La vérification anti-robots ne s’est pas chargée (bloqueur de publicités ?).
                </p>
              )}
              {form.error && <p className="text-sm text-red-600">{form.error}</p>}
              {form.notice && (
                <p className="text-sm text-green-700 dark:text-green-400">{form.notice}</p>
              )}
              <button
                type="submit"
                className="btn-primary w-full"
                disabled={form.pending || !captchaReady}
              >
                {SUBMIT_LABELS[mode]}
              </button>
            </form>
          )}

          {mode === 'sign-in' && config.data?.passwordReset && (
            <button
              className="mt-2 w-full text-center text-sm text-slate-500 hover:underline"
              onClick={() => switchMode('forgot')}
            >
              Mot de passe oublié ?
            </button>
          )}

          {(mode === 'sign-in' || mode === 'sign-up') &&
            config.data &&
            config.data.oauthProviders.length > 0 && (
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

          {mode !== 'two-factor' && (
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
          )}
        </div>
        <footer className="mt-6 space-y-2 text-center text-xs text-slate-400">
          <p>
            <FanDisclaimer />
          </p>
          <LegalLinks />
        </footer>
      </div>
    </main>
  );
}
