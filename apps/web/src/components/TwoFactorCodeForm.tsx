/**
 * Saisie du second facteur après le mot de passe (compte administrateur), dans le jeu comme dans
 * l'admin : code à 6 chiffres de l'application d'authentification, ou un code de secours.
 */
import { useState } from 'react';
import type { FormEvent } from 'react';
import { authErrorMessage } from '../lib/labels/errors';

/** Réponse de Better Auth à la vérification d'un code. */
interface VerifyResult {
  error: { code?: string; message?: string; status?: number } | null;
}

/**
 * `verify` : appel de Better Auth (`twoFactor.verifyTotp` ou `verifyBackupCode` selon `backup`) ;
 * `onDone` une fois la session ouverte, `onCancel` pour revenir au mot de passe.
 */
export function TwoFactorCodeForm({
  verify,
  onDone,
  onCancel,
}: {
  verify: (code: string, backup: boolean) => Promise<VerifyResult>;
  onDone: () => Promise<void> | void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState('');
  const [backup, setBackup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result = await verify(code.trim(), backup);
    setPending(false);
    if (result.error) {
      setError(authErrorMessage(result.error));
      return;
    }
    await onDone();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="block text-sm">
        {backup ? 'Code de secours' : 'Code de l’application d’authentification'}
        <input
          className="input mt-1 tracking-widest"
          autoComplete="one-time-code"
          inputMode={backup ? 'text' : 'numeric'}
          pattern={backup ? undefined : '[0-9]{6}'}
          maxLength={backup ? 32 : 6}
          required
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" className="btn-primary w-full" disabled={pending}>
        Valider
      </button>
      <div className="flex justify-between text-sm text-slate-500">
        <button
          type="button"
          className="hover:underline"
          onClick={() => {
            setBackup(!backup);
            setCode('');
            setError(null);
          }}
        >
          {backup ? 'Utiliser l’application' : 'Utiliser un code de secours'}
        </button>
        <button type="button" className="hover:underline" onClick={onCancel}>
          Retour
        </button>
      </div>
    </form>
  );
}
