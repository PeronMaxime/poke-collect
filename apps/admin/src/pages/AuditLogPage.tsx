import { useInfiniteQuery } from '@tanstack/react-query';
import type { AuditLogEntryDto, Paginated } from '@poke/shared';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';

const ACTION_LABELS: Record<string, string> = {
  'content.draft.create': 'Création d’un brouillon',
  'content.draft.discard': 'Suppression d’un brouillon',
  'content.balance.update': 'Modification de l’équilibrage',
  'content.publish': 'Publication',
  'content.import': 'Import de contenu',
  'user.promote': 'Attribution du rôle admin',
  'user.revoke': 'Retrait du rôle admin',
};

const ENTITY_LABELS: Record<string, string> = {
  region: 'région',
  species_override: 'surcharge d’espèce',
  item: 'objet',
  loot_table: 'table de butin',
  zone: 'zone',
  trainer: 'dresseur',
  shop_category: 'catégorie de boutique',
  shop_entry: 'article de boutique',
  evolution_override: 'surcharge d’évolution',
  dex_milestone: 'palier du Pokédex',
  collection: 'collection',
  quest: 'quête',
};
const VERB_LABELS: Record<string, string> = {
  create: 'Création',
  update: 'Modification',
  delete: 'Suppression',
};

/** « content.zone.update » → « Modification : zone ». */
function actionLabel(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  const [, entity, verb] = action.split('.');
  if (entity && verb && ENTITY_LABELS[entity] && VERB_LABELS[verb]) {
    return `${VERB_LABELS[verb]} : ${ENTITY_LABELS[entity]}`;
  }
  return action;
}

export function AuditLogPage() {
  const log = useInfiniteQuery({
    queryKey: ['audit-log'],
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) =>
      api<Paginated<AuditLogEntryDto>>(
        `/api/admin/audit-log${pageParam ? `?cursor=${pageParam}` : ''}`,
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const entries = log.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Versions et journal</h1>
        <p className="mt-1 text-slate-500">
          Toutes les actions d’administration : qui, quoi, avant / après.
        </p>
      </div>

      <ol className="space-y-3">
        {entries.map((e) => (
          <li key={e.id} className="card p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium">
                {actionLabel(e.action)}
                <span className="ml-2 font-mono text-xs text-slate-500">
                  {e.entity}
                  {e.entityId ? ` #${e.entityId}` : ''}
                </span>
              </p>
              <p className="text-xs text-slate-500">
                {formatDate(e.at)} · {e.adminEmail ?? 'système / CLI'}
              </p>
            </div>
            {(e.before != null || e.after != null) && (
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer text-slate-500">Détails</summary>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <pre className="overflow-x-auto rounded-lg bg-slate-100 p-2 dark:bg-slate-950">
                    {JSON.stringify(e.before, null, 2)}
                  </pre>
                  <pre className="overflow-x-auto rounded-lg bg-slate-100 p-2 dark:bg-slate-950">
                    {JSON.stringify(e.after, null, 2)}
                  </pre>
                </div>
              </details>
            )}
          </li>
        ))}
      </ol>

      {entries.length === 0 && !log.isPending && (
        <p className="text-sm text-slate-500">Aucune action enregistrée pour l’instant.</p>
      )}
      {log.hasNextPage && (
        <button
          className="btn-ghost"
          disabled={log.isFetchingNextPage}
          onClick={() => log.fetchNextPage()}
        >
          Charger plus
        </button>
      )}
    </div>
  );
}
