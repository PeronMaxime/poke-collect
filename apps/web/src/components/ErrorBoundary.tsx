import { Component } from 'react';
import type { ReactNode } from 'react';

/**
 * Affiche un écran de secours au lieu d'une page blanche si un composant plante.
 * La journalisation est faite par `onCaughtError` (voir main.tsx).
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="card mx-auto my-10 max-w-lg p-6 text-center">
        <h2 className="text-lg font-semibold text-red-600">Oups, quelque chose a planté.</h2>
        <p className="mt-2 font-mono text-xs break-words text-slate-500">{error.message}</p>
        <p className="mt-2 text-xs text-slate-500">Le détail est dans la console du navigateur.</p>
        <div className="mt-4 flex justify-center gap-2">
          <button className="btn-ghost" onClick={() => this.setState({ error: null })}>
            Réessayer
          </button>
          <button className="btn-primary" onClick={() => window.location.reload()}>
            Recharger la page
          </button>
        </div>
      </div>
    );
  }
}
