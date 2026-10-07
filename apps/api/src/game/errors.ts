/** Erreur métier : code stable pour le client, statut HTTP, détails éventuels. */
export class GameError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(code);
  }
}
