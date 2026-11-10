import type { ErrorCode } from '@poke/shared';

/**
 * Erreur métier : un refus attendu, renvoyé au client sous la forme `{ error: code, ...details }`
 * avec le statut HTTP donné (voir le gestionnaire d'erreurs de `app.ts`).
 */

/** Refus d'une action : statut HTTP, code du catalogue (`@poke/shared`), détails éventuels. */
export class GameError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    readonly details?: Record<string, unknown>,
  ) {
    super(code);
  }
}
