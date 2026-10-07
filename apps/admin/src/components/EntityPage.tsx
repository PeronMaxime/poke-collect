import { useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { ContentEntityKind, ContentIssue } from '@poke/content';
import type { z } from 'zod';
import type { EntityCollection, WorkingVersion } from '../lib/content';
import {
  errorMessage,
  useDeleteEntity,
  useRefreshContent,
  useSaveEntity,
  useWorkingVersion,
} from '../lib/content';
import { api } from '../lib/api';
import { validate } from './forms/fields';
import type { FieldErrors } from './forms/fields';

/** Bandeau : on édite le brouillon, ou on consulte la version publiée en lecture seule. */
export function VersionBanner({ working }: { working: WorkingVersion }) {
  const refresh = useRefreshContent();
  const create = useMutation({
    mutationFn: () =>
      api('/api/admin/content/drafts', {
        method: 'POST',
        json: { label: `Modifications du ${new Date().toLocaleDateString('fr-FR')}` },
      }),
    onSuccess: refresh,
  });
  if (working.editable) {
    return (
      <div className="rounded-lg bg-amber-100 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
        Brouillon v{working.version.id} « {working.version.label} » : les joueurs ne voient pas ces
        modifications avant la publication (tableau de bord).
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm dark:bg-slate-800">
      <span>
        Lecture seule : version publiée v{working.version.id}. Créez un brouillon pour modifier.
      </span>
      <button
        className="btn-primary py-1"
        disabled={create.isPending}
        onClick={() => create.mutate()}
      >
        Créer un brouillon
      </button>
    </div>
  );
}

export function IssueList({ issues }: { issues: readonly ContentIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="space-y-1 text-sm">
      {issues.map((i, n) => (
        <li
          key={n}
          className={i.severity === 'error' ? 'text-red-600' : 'text-amber-700 dark:text-amber-400'}
        >
          {i.severity === 'error' ? '⛔' : '⚠️'} {i.message}
        </li>
      ))}
    </ul>
  );
}

export interface EntityFormProps<T> {
  value: T;
  onChange: (value: T) => void;
  errors: FieldErrors;
  isNew: boolean;
  editable: boolean;
  working: WorkingVersion;
}

interface EntityPageProps<T> {
  title: string;
  description: string;
  collection: EntityCollection;
  entityKind: ContentEntityKind;
  schema: z.ZodType<T>;
  list: (working: WorkingVersion) => T[];
  getKey: (entity: T) => string;
  searchText: (entity: T, working: WorkingVersion) => string;
  renderListItem: (entity: T, working: WorkingVersion) => ReactNode;
  create: (working: WorkingVersion) => T;
  duplicate?: (entity: T) => T;
  renderForm: (props: EntityFormProps<T>) => ReactNode;
  /** Panneau supplémentaire sous le formulaire (simulateur…). */
  renderExtra?: (entity: T, working: WorkingVersion) => ReactNode;
  newLabel?: string;
}

/** Page type d'une section de contenu : liste filtrable à gauche, fiche d'édition à droite. */
export function EntityPage<T>(props: EntityPageProps<T>) {
  const working = useWorkingVersion();
  const [selection, setSelection] = useState<{ key: string | null; initial: T } | null>(null);
  const [search, setSearch] = useState('');

  if (working.isPending) return <p className="text-slate-500">Chargement…</p>;
  if (!working.data) return <p className="text-red-600">{errorMessage(working.error)}</p>;
  const w = working.data;
  const entities = props.list(w);
  const needle = search.trim().toLowerCase();
  const visible = entities.filter(
    (e) => !needle || props.searchText(e, w).toLowerCase().includes(needle),
  );
  const issueKeys = new Set(
    w.issues
      .filter((i) => i.entity === props.entityKind && i.severity === 'error')
      .map((i) => i.entityId),
  );
  // La sélection suit le contenu rechargé après une sauvegarde.
  const current =
    selection?.key != null ? entities.find((e) => props.getKey(e) === selection.key) : undefined;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{props.title}</h1>
        <p className="mt-1 text-slate-500">{props.description}</p>
      </div>
      <VersionBanner working={w} />

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="card space-y-2 p-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          <div className="flex gap-2">
            <input
              className="input"
              placeholder="Filtrer…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {w.editable && (
              <button
                className="btn-primary shrink-0 px-3"
                title={props.newLabel ?? 'Nouveau'}
                onClick={() => setSelection({ key: null, initial: props.create(w) })}
              >
                +
              </button>
            )}
          </div>
          <ul className="space-y-0.5">
            {visible.map((e) => {
              const key = props.getKey(e);
              return (
                <li key={key}>
                  <button
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition ${
                      selection?.key === key
                        ? 'bg-brand-500/10 text-brand-600 dark:text-brand-500'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                    onClick={() => setSelection({ key, initial: e })}
                  >
                    <span className="min-w-0 flex-1">{props.renderListItem(e, w)}</span>
                    {issueKeys.has(key) && <span title="Erreur de cohérence">⛔</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          {visible.length === 0 && <p className="px-2 text-sm text-slate-500">Aucun élément.</p>}
        </aside>

        <section className="min-w-0">
          {selection ? (
            <EntityEditor
              key={`${w.version.id}:${selection.key ?? 'new'}`}
              {...props}
              working={w}
              isNew={selection.key === null}
              initial={current ?? selection.initial}
              onSaved={(key, saved) => setSelection({ key, initial: saved })}
              onDeleted={() => setSelection(null)}
              onDuplicate={(copy) => setSelection({ key: null, initial: copy })}
            />
          ) : (
            <div className="card text-sm text-slate-500">
              Sélectionnez un élément dans la liste{w.editable ? ' ou créez-en un avec « + »' : ''}.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function EntityEditor<T>({
  working,
  isNew,
  initial,
  onSaved,
  onDeleted,
  onDuplicate,
  ...props
}: EntityPageProps<T> & {
  working: WorkingVersion;
  isNew: boolean;
  initial: T;
  onSaved: (key: string, saved: T) => void;
  onDeleted: () => void;
  onDuplicate: (copy: T) => void;
}) {
  const [value, setValue] = useState<T>(initial);
  const save = useSaveEntity<T>(working.version.id, props.collection);
  const remove = useDeleteEntity(working.version.id, props.collection);
  const { valid, errors } = validate(props.schema, value);
  const key = isNew ? null : props.getKey(initial);
  const dirty = JSON.stringify(value) !== JSON.stringify(initial);
  const issues = key
    ? working.issues.filter((i) => i.entity === props.entityKind && i.entityId === key)
    : [];
  const editable = working.editable;

  return (
    <div className="space-y-4">
      <div className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">
            {isNew ? 'Nouvel élément' : props.getKey(initial)}
          </h2>
          {editable && (
            <div className="flex gap-2">
              {!isNew && props.duplicate && (
                <button className="btn-ghost" onClick={() => onDuplicate(props.duplicate!(value))}>
                  Dupliquer
                </button>
              )}
              {!isNew && (
                <button
                  className="btn-danger"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(key!, { onSuccess: onDeleted })}
                >
                  Supprimer
                </button>
              )}
              <button
                className="btn-primary"
                disabled={!valid || (!dirty && !isNew) || save.isPending}
                onClick={() =>
                  save.mutate(
                    { entity: value, key },
                    { onSuccess: () => onSaved(props.getKey(value), value) },
                  )
                }
              >
                {isNew ? 'Créer' : 'Enregistrer'}
              </button>
            </div>
          )}
        </div>
        {(save.error || remove.error) && (
          <p className="text-sm text-red-600">{errorMessage(save.error ?? remove.error)}</p>
        )}
        {!dirty && <IssueList issues={issues} />}
        {props.renderForm({ value, onChange: setValue, errors, isNew, editable, working })}
      </div>
      {!isNew && props.renderExtra?.(value, working)}
    </div>
  );
}
