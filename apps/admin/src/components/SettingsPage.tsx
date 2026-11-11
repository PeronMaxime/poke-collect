/**
 * Modèle des pages de réglages : ce qui s'enregistre en un bloc dans l'équilibrage (`balance` :
 * équilibrage, menu, Sac, bâtiments, complétions d'expédition), par opposition aux entités d'une
 * collection, éditées une par une avec `EntityPage`. La page tient son brouillon dans un hook
 * (état, `dirty`, validité, `useSaveBalance`) ; `SettingsPage` écrit une fois l'en-tête, les
 * boutons Annuler et Enregistrer, le bandeau de version et l'erreur d'enregistrement.
 */
import type { ReactNode } from 'react';
import type { WorkingVersion } from '../lib/content';
import { errorMessage } from '../lib/content';
import { VersionBanner } from './EntityPage';

/** Props d'une page de réglages ; les boutons ne s'affichent que sur un brouillon. */
interface SettingsPageProps {
  title: string;
  description: string;
  working: WorkingVersion;
  /** Mutation d'enregistrement (`useSaveBalance`) : son état grise le bouton, son erreur s'affiche. */
  save: { isPending: boolean; error: Error | null };
  /** Le brouillon diffère de la version enregistrée : Annuler et Enregistrer deviennent actifs. */
  dirty: boolean;
  /** Faux tant qu'un champ est invalide : Enregistrer reste grisé. */
  valid?: boolean;
  onCancel: () => void;
  onSave: () => void;
  /** Boutons placés avant Annuler (« Menu par défaut »…). */
  extraActions?: ReactNode;
  children: ReactNode;
}

/** Page de réglages : titre, description, boutons, bandeau de version, erreur, puis le contenu. */
export function SettingsPage({
  title,
  description,
  working,
  save,
  dirty,
  valid = true,
  onCancel,
  onSave,
  extraActions,
  children,
}: SettingsPageProps) {
  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mt-1 text-slate-500">{description}</p>
        </div>
        {working.editable && (
          <div className="flex gap-2">
            {extraActions}
            <button className="btn-ghost" disabled={!dirty} onClick={onCancel}>
              Annuler
            </button>
            <button
              className="btn-primary"
              disabled={!dirty || !valid || save.isPending}
              onClick={onSave}
            >
              Enregistrer
            </button>
          </div>
        )}
      </div>
      <VersionBanner working={working} />
      {save.error && <p className="text-sm text-red-600">{errorMessage(save.error)}</p>}
      {children}
    </div>
  );
}
