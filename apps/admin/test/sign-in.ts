import { inject } from 'vitest';
import { totpCode } from '../../api/src/testing/totp';
import { api } from '../src/lib/api';

/**
 * Connecte l'administrateur de l'API de test comme dans l'admin : mot de passe, puis code de son
 * application d'authentification.
 */
export async function signInAdmin() {
  const { email, password, totpURI } = inject('admin');
  await api('/api/auth/sign-in/email', { method: 'POST', json: { email, password } });
  await api('/api/auth/two-factor/verify-totp', {
    method: 'POST',
    json: { code: totpCode(totpURI) },
  });
}
