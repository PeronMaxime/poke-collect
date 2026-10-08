import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { seedContent } from '@poke/content';
import type { ContentEntityKind } from '@poke/content';
import type { ContentVersionDto, ContentVersionStatus } from '@poke/shared';
import { IssueList } from '../components/EntityPage';
import { ApiError, api } from '../lib/api';
import { useWorkingVersion } from '../lib/content';
import { formatDate } from '../lib/format';

const ISSUE_SECTIONS: Record<ContentEntityKind, { path: string; label: string }> = {
  balance: { path: '/balance', label: 'Équilibrage' },
  region: { path: '/regions', label: 'Régions' },
  speciesOverride: { path: '/species', label: 'Espèces' },
  item: { path: '/items', label: 'Objets' },
  lootTable: { path: '/loot-tables', label: 'Tables de butin' },
  zone: { path: '/zones', label: 'Zones' },
  trainer: { path: '/trainers', label: 'Dresseurs' },
  shopCategory: { path: '/shop', label: 'Boutique (catégories)' },
  shopEntry: { path: '/shop', label: 'Boutique (articles)' },
  evolutionOverride: { path: '/evolutions', label: 'Évolutions' },
  dexMilestone: { path: '/progression', label: 'Progression (paliers)' },
  collection: { path: '/progression', label: 'Progression (collections)' },
  quest: { path: '/quests', label: 'Quêtes' },
};

const STATUS_LABELS: Record<ContentVersionStatus, string> = {
  draft: 'Brouillon',
  published: 'Publiée',
  archived: 'Archivée',
};

const STATUS_STYLES: Record<ContentVersionStatus, string> = {
  draft: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  published: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  archived: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const msg = (err.body as { message?: string } | null)?.message;
    return msg ?? err.code;
  }
  return 'Erreur inconnue';
}

export function DashboardPage() {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState('');
  const [badJson, setBadJson] = useState(false);
  const versions = useQuery({
    queryKey: ['content-versions'],
    queryFn: () => api<ContentVersionDto[]>('/api/admin/content/versions'),
  });

  const working = useWorkingVersion();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['content-versions'] }),
      queryClient.invalidateQueries({ queryKey: ['content-version'] }),
      queryClient.invalidateQueries({ queryKey: ['audit-log'] }),
    ]);

  const importContent = useMutation({
    mutationFn: (input: { label: string; content: unknown }) =>
      api<ContentVersionDto>('/api/admin/content/import', { method: 'POST', json: input }),
    onSuccess: refresh,
  });

  function exportContent() {
    if (!working.data) return;
    const { versionId: _, ...data } = working.data.content;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `poke-collect-contenu-v${working.data.version.id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importFile(file: File) {
    let content: unknown;
    try {
      content = JSON.parse(await file.text());
    } catch {
      setBadJson(true);
      return;
    }
    setBadJson(false);
    importContent.mutate({ label: `Import ${file.name}`, content });
  }

  const createDraft = useMutation({
    mutationFn: (input: { label: string; basedOnId?: number }) =>
      api<ContentVersionDto>('/api/admin/content/drafts', { method: 'POST', json: input }),
    onSuccess: () => {
      setLabel('');
      return refresh();
    },
  });
  const publish = useMutation({
    mutationFn: (id: number) =>
      api<ContentVersionDto>(`/api/admin/content/versions/${id}/publish`, { method: 'POST' }),
    onSuccess: refresh,
  });
  const discard = useMutation({
    mutationFn: (id: number) => api(`/api/admin/content/versions/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });

  const list = versions.data ?? [];
  const published = list.find((v) => v.status === 'published');
  const draft = list.find((v) => v.status === 'draft');
  const mutationError = createDraft.error ?? publish.error ?? discard.error ?? importContent.error;
  const issues = working.data?.issues ?? [];
  const errorCount = issues.filter((i) => i.severity === 'error').length;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tableau de bord</h1>
        <p className="mt-1 text-slate-500">
          Les modifications se font dans un brouillon, puis sont publiées en une fois.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card">
          <p className="text-sm text-slate-500">Version publiée</p>
          <p className="mt-1 text-xl font-semibold">
            {published ? `v${published.id} — ${published.label}` : 'Aucune'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Publiée le {formatDate(published?.publishedAt ?? null)}
          </p>
        </div>

        <div className="card">
          <p className="text-sm text-slate-500">Brouillon en cours</p>
          {draft ? (
            <>
              <p className="mt-1 text-xl font-semibold">
                v{draft.id} — {draft.label}
              </p>
              <p className="mt-1 text-xs text-slate-500">Basé sur v{draft.basedOnId}</p>
              <div className="mt-4 flex gap-2">
                <button
                  className="btn-primary"
                  disabled={publish.isPending}
                  onClick={() => publish.mutate(draft.id)}
                >
                  Publier
                </button>
                <button
                  className="btn-danger"
                  disabled={discard.isPending}
                  onClick={() => discard.mutate(draft.id)}
                >
                  Supprimer
                </button>
              </div>
            </>
          ) : (
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (label.trim()) createDraft.mutate({ label: label.trim() });
              }}
            >
              <input
                className="input"
                placeholder="Nom du brouillon"
                value={label}
                maxLength={120}
                onChange={(e) => setLabel(e.target.value)}
              />
              <button
                className="btn-primary shrink-0"
                disabled={!label.trim() || createDraft.isPending}
              >
                Créer
              </button>
            </form>
          )}
        </div>
      </div>

      {mutationError && <p className="text-sm text-red-600">{errorMessage(mutationError)}</p>}
      {badJson && <p className="text-sm text-red-600">Fichier JSON illisible.</p>}

      {working.data && (
        <section className="card space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">
              Alertes de cohérence — v{working.data.version.id} (
              {working.data.editable ? 'brouillon' : 'publiée'})
            </h2>
            <span className="text-sm text-slate-500">
              {errorCount} erreur(s) bloquante(s), {issues.length - errorCount} avertissement(s)
            </span>
          </div>
          {issues.length === 0 ? (
            <p className="text-sm text-emerald-600">Aucun problème détecté.</p>
          ) : (
            (Object.keys(ISSUE_SECTIONS) as ContentEntityKind[]).map((kind) => {
              const list = issues.filter((i) => i.entity === kind);
              if (list.length === 0) return null;
              return (
                <div key={kind}>
                  <Link
                    to={ISSUE_SECTIONS[kind].path}
                    className="text-sm font-medium text-brand-600 hover:underline"
                  >
                    {ISSUE_SECTIONS[kind].label}
                  </Link>
                  <IssueList
                    issues={list.map((i) => ({
                      ...i,
                      message: i.entityId ? `${i.entityId} : ${i.message}` : i.message,
                    }))}
                  />
                </div>
              );
            })
          )}
          {working.data.editable && errorCount > 0 && (
            <p className="text-xs text-slate-500">
              Les erreurs bloquantes empêchent la publication.
            </p>
          )}
        </section>
      )}

      <section className="card space-y-3">
        <h2 className="font-semibold">Import / export</h2>
        <p className="text-sm text-slate-500">
          Sauvegarde ou transfert du contenu complet entre environnements. Un import crée un
          brouillon (aucun brouillon ne doit exister).
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" disabled={!working.data} onClick={exportContent}>
            Exporter v{working.data?.version.id ?? '…'} (JSON)
          </button>
          <label className={`btn-ghost ${draft ? 'pointer-events-none opacity-50' : ''}`}>
            Importer un JSON…
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              disabled={!!draft}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void importFile(file);
              }}
            />
          </label>
          <button
            className="btn-ghost"
            disabled={!!draft || importContent.isPending}
            onClick={() =>
              importContent.mutate({ label: 'Contenu de test (seed)', content: seedContent })
            }
          >
            Charger le contenu de test
          </button>
        </div>
      </section>

      <section className="card overflow-x-auto p-0">
        <h2 className="px-6 pt-5 font-semibold">Historique des versions</h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-xs text-slate-500 uppercase">
            <tr className="border-b border-slate-200 dark:border-slate-800">
              <th className="px-6 py-2">Version</th>
              <th className="px-6 py-2">Statut</th>
              <th className="px-6 py-2">Libellé</th>
              <th className="px-6 py-2">Publiée le</th>
              <th className="px-6 py-2" />
            </tr>
          </thead>
          <tbody>
            {list.map((v) => (
              <tr
                key={v.id}
                className="border-b border-slate-100 last:border-0 dark:border-slate-800"
              >
                <td className="px-6 py-3 font-mono">v{v.id}</td>
                <td className="px-6 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[v.status]}`}>
                    {STATUS_LABELS[v.status]}
                  </span>
                </td>
                <td className="px-6 py-3">{v.label}</td>
                <td className="px-6 py-3 text-slate-500">{formatDate(v.publishedAt)}</td>
                <td className="px-6 py-3 text-right">
                  {v.status === 'archived' && !draft && (
                    <button
                      className="text-sm text-brand-600 hover:underline"
                      onClick={() =>
                        createDraft.mutate({ label: `Retour à v${v.id}`, basedOnId: v.id })
                      }
                    >
                      Restaurer en brouillon
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
