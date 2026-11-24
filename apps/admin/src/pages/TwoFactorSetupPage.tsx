/**
 * Activation du second facteur, exigée de tout administrateur avant d'ouvrir l'admin
 * (`ADMIN_2FA_SETUP_REQUIRED`) : mot de passe, QR code ou clé à ajouter dans l'application
 * d'authentification, codes de secours montrés une seule fois, puis premier code.
 */
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { TwoFactorCodeForm } from '@web/components/TwoFactorCodeForm';
import { authErrorMessage } from '@web/lib/labels/errors';
import { authClient } from '../lib/auth-client';
import { SignOutButton } from '../components/SignOutButton';
import { TotpQrCode } from '../components/TotpQrCode';

/** Ce que rend `twoFactor.enable` : lien `otpauth://` et codes de secours. */
interface Enrollment {
  totpURI: string;
  backupCodes: string[];
}

/** Clé du lien `otpauth://`, par groupes de 4 pour la recopier à la main. */
function readableSecret(totpURI: string): string {
  const secret = new URL(totpURI).searchParams.get('secret') ?? '';
  return secret.match(/.{1,4}/g)?.join(' ') ?? secret;
}

/** Étape 2 : clé, codes de secours, premier code. */
function EnrollmentStep({
  enrollment,
  onCancel,
}: {
  enrollment: Enrollment;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  return (
    <div className="space-y-4 text-sm">
      <ol className="list-decimal space-y-3 pl-5">
        <li>
          Dans ton application d’authentification (Google Authenticator, Microsoft Authenticator,
          Aegis, 1Password…), scanne ce QR code ou ajoute un compte avec la clé :
          <TotpQrCode value={enrollment.totpURI} />
          <code className="mt-1 block rounded bg-slate-100 p-2 font-mono text-base break-all dark:bg-slate-800">
            {readableSecret(enrollment.totpURI)}
          </code>
          <a className="text-blue-600 underline" href={enrollment.totpURI}>
            Ou ouvrir directement l’application (sur téléphone)
          </a>
        </li>
        <li>
          Note ces codes de secours en lieu sûr : chacun ouvre l’admin une fois si tu perds ton
          téléphone. Ils ne seront plus affichés.
          <ul className="mt-1 grid grid-cols-2 gap-1 rounded bg-slate-100 p-2 font-mono dark:bg-slate-800">
            {enrollment.backupCodes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
          <button
            type="button"
            className="btn-ghost mt-1"
            onClick={() => void navigator.clipboard.writeText(enrollment.backupCodes.join('\n'))}
          >
            Copier les codes
          </button>
          <label className="mt-2 flex items-center gap-2">
            <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
            J’ai noté mes codes de secours
          </label>
        </li>
        <li>Saisis le code à 6 chiffres affiché par l’application.</li>
      </ol>
      {saved && (
        <TwoFactorCodeForm
          verify={(code, backup) =>
            backup
              ? authClient.twoFactor.verifyBackupCode({ code })
              : authClient.twoFactor.verifyTotp({ code })
          }
          onDone={() => queryClient.invalidateQueries({ queryKey: ['admin-me'] })}
          onCancel={onCancel}
        />
      )}
    </div>
  );
}

/** Écran d'activation du second facteur. */
export function TwoFactorSetupPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result = await authClient.twoFactor.enable({ password });
    setPending(false);
    if (result.error) {
      setError(authErrorMessage(result.error));
      return;
    }
    setEnrollment(result.data as Enrollment);
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-8">
      <div className="card w-full max-w-md space-y-4">
        <div>
          <h1 className="text-xl font-bold">Double authentification</h1>
          <p className="text-sm text-slate-500">
            L’admin demande, en plus du mot de passe, un code de ton téléphone à chaque connexion. À
            activer une fois pour toutes.
          </p>
        </div>
        {enrollment ? (
          <EnrollmentStep enrollment={enrollment} onCancel={() => setEnrollment(null)} />
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <label className="block text-sm">
              Mot de passe du compte
              <input
                className="input mt-1"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" className="btn-primary w-full" disabled={pending}>
              Continuer
            </button>
          </form>
        )}
        <SignOutButton />
      </div>
    </main>
  );
}
