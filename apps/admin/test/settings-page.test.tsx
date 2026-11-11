import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { SettingsPage } from '../src/components/SettingsPage';
import type { WorkingVersion } from '../src/lib/content';

/** Version de travail réduite à ce que lit `SettingsPage` (et son bandeau). */
const working = (editable: boolean) =>
  ({ editable, version: { id: 7, label: 'Essai' } }) as unknown as WorkingVersion;

function renderPage(props: Partial<ComponentProps<typeof SettingsPage>> = {}) {
  const onCancel = vi.fn();
  const onSave = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SettingsPage
        title="Réglages"
        description="Description."
        working={working(true)}
        save={{ isPending: false, error: null }}
        dirty
        onCancel={onCancel}
        onSave={onSave}
        {...props}
      >
        <p>Contenu</p>
      </SettingsPage>
    </QueryClientProvider>,
  );
  return { onCancel, onSave };
}

const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;

/** Coquille commune des pages de réglages : quand Annuler et Enregistrer s'offrent, et à qui. */
describe('SettingsPage', () => {
  it('modifié et valide : Annuler et Enregistrer appellent la page', () => {
    const { onCancel, onSave } = renderPage();
    expect(screen.getByRole('heading', { name: 'Réglages' })).toBeTruthy();
    expect(screen.getByText('Contenu')).toBeTruthy();
    fireEvent.click(button('Annuler'));
    fireEvent.click(button('Enregistrer'));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('rien de modifié : les deux boutons sont grisés', () => {
    renderPage({ dirty: false });
    expect(button('Annuler').disabled).toBe(true);
    expect(button('Enregistrer').disabled).toBe(true);
  });

  it('invalide ou en cours d’enregistrement : seul Annuler reste actif', () => {
    renderPage({ valid: false, extraActions: <button>Par défaut</button> });
    expect(button('Annuler').disabled).toBe(false);
    expect(button('Enregistrer').disabled).toBe(true);
    expect(button('Par défaut')).toBeTruthy();
  });

  it('enregistrement en échec : le message s’affiche', () => {
    renderPage({ save: { isPending: true, error: new Error('boom') } });
    expect(button('Enregistrer').disabled).toBe(true);
    expect(screen.getByText('Erreur inconnue')).toBeTruthy();
  });

  it('version publiée : lecture seule, pas de boutons', () => {
    renderPage({ working: working(false), extraActions: <button>Par défaut</button> });
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Par défaut' })).toBeNull();
    expect(screen.getByText(/Lecture seule/)).toBeTruthy();
  });
});
