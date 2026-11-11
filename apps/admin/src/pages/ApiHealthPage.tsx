/**
 * Page « Santé de l'API » : requêtes, erreurs et durées par route et par minute, gardées en mémoire
 * par le processus de l'API.
 */
import { useQuery } from '@tanstack/react-query';
import type { ApiMetricsResponse } from '@poke/shared';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';

const numberFormat = new Intl.NumberFormat('fr-FR');
const fmt = (n: number) => numberFormat.format(n);
const ms = (n: number) => `${fmt(n)} ms`;
const timeFormat = new Intl.DateTimeFormat('fr-FR', { timeStyle: 'short' });

function Tile({
  label,
  value,
  hint,
  alert,
}: {
  label: string;
  value: string;
  hint?: string;
  alert?: boolean;
}) {
  return (
    <div className="card p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${alert ? 'text-red-600' : ''}`}>{value}</p>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/** Histogramme des requêtes par minute : la part en erreur (5xx) et refusée (429) est colorée. */
function MinutesChart({ minutes }: { minutes: ApiMetricsResponse['minutes'] }) {
  const max = Math.max(1, ...minutes.map((m) => m.requests));
  return (
    <div className="flex h-24 items-end gap-px" role="img" aria-label="Requêtes par minute">
      {minutes.map((m) => {
        const ok = Math.max(0, m.requests - m.errors - m.limited);
        const part = (n: number) => `${(n / max) * 100}%`;
        return (
          <div
            key={m.at}
            className="flex min-w-px flex-1 flex-col justify-end"
            title={`${timeFormat.format(new Date(m.at))} : ${m.requests} requête(s), ${m.errors} erreur(s), ${m.limited} refus 429, ${m.slow} lente(s), moyenne ${m.avgMs} ms`}
          >
            <div className="bg-red-500" style={{ height: part(m.errors) }} />
            <div className="bg-amber-400" style={{ height: part(m.limited) }} />
            <div className="bg-brand-500" style={{ height: part(ok) }} />
          </div>
        );
      })}
    </div>
  );
}

/**
 * Santé de l’API : requêtes, erreurs 5xx, refus 429 et durées par route, gardés en mémoire par le
 * processus (ils repartent de zéro à chaque redémarrage, donc à chaque mise en ligne).
 */
export function ApiHealthPage() {
  const query = useQuery({
    queryKey: ['api-metrics'],
    queryFn: () => api<ApiMetricsResponse>('/api/admin/metrics'),
    refetchInterval: 30_000,
  });
  const m = query.data;
  const lastHour = m?.minutes.slice(-60) ?? [];
  const recent = lastHour.reduce(
    (sum, minute) => ({
      requests: sum.requests + minute.requests,
      errors: sum.errors + minute.errors,
      limited: sum.limited + minute.limited,
    }),
    { requests: 0, errors: 0, limited: 0 },
  );

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Santé de l’API</h1>
          <p className="text-sm text-slate-500">
            Requêtes, erreurs et durées par route, depuis le dernier démarrage de l’API. Une requête
            de plus de {m ? ms(m.slowThresholdMs) : '500 ms'} est « lente » et figure dans les
            journaux.
          </p>
        </div>
        <button className="btn-ghost" onClick={() => void query.refetch()}>
          Actualiser
        </button>
      </div>

      {query.isPending && <p className="text-slate-500">Chargement…</p>}
      {query.isError && <p className="text-red-600">Impossible de charger les mesures.</p>}
      {m && (
        <>
          <p className="text-xs text-slate-500">
            Démarrée le {formatDate(m.startedAt)} · mesures du {formatDate(m.generatedAt)}.
          </p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="Requêtes (depuis le démarrage)" value={fmt(m.totals.requests)} />
            <Tile
              label="Erreurs 5xx"
              value={fmt(m.totals.errors)}
              hint={`${fmt(recent.errors)} sur la dernière heure`}
              alert={recent.errors > 0}
            />
            <Tile
              label="Refus 429"
              value={fmt(m.totals.limited)}
              hint={`${fmt(recent.limited)} sur la dernière heure`}
              alert={recent.limited > 0}
            />
            <Tile label="Requêtes lentes" value={fmt(m.totals.slow)} />
          </div>

          <section className="card p-4">
            <h2 className="font-semibold">Requêtes par minute</h2>
            <p className="mb-2 text-xs text-slate-500">
              Les deux dernières heures. <span className="text-amber-500">■</span> refus 429 ·{' '}
              <span className="text-red-500">■</span> erreurs 5xx.
            </p>
            {m.minutes.length > 0 ? (
              <MinutesChart minutes={m.minutes} />
            ) : (
              <p className="text-sm text-slate-500">Aucune requête mesurée pour l’instant.</p>
            )}
          </section>

          <section className="card p-4">
            <h2 className="font-semibold">Dernières erreurs 5xx</h2>
            <p className="mb-2 text-xs text-slate-500">
              Les {m.recentErrors.length > 0 ? m.recentErrors.length : 50} plus récentes depuis le
              démarrage, de la plus récente à la plus ancienne. Le détail n’est jamais renvoyé aux
              joueurs.
            </p>
            {m.recentErrors.length === 0 ? (
              <p className="text-sm text-slate-500">Aucune erreur depuis le démarrage.</p>
            ) : (
              <ul className="space-y-2">
                {m.recentErrors.map((e, i) => (
                  <li
                    key={`${e.at}-${i}`}
                    className="rounded-md border border-slate-200 p-2 text-sm dark:border-slate-700"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="text-xs text-slate-500">{formatDate(e.at)}</span>
                      <span className="font-mono text-xs">{e.route}</span>
                      <span className="font-mono text-xs text-red-600">
                        {e.status}
                        {e.code ? ` · ${e.code}` : ''}
                      </span>
                    </div>
                    <p className="mt-1 break-words font-mono text-xs">
                      <strong>{e.name}</strong> : {e.message}
                    </p>
                    {e.stack && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-slate-500">
                          Pile d’appels
                        </summary>
                        <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-words text-xs text-slate-600 dark:text-slate-400">
                          {e.stack}
                        </pre>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card overflow-x-auto p-0">
            <h2 className="px-4 pt-4 font-semibold">Routes</h2>
            <p className="px-4 text-xs text-slate-500">
              De la plus lente à la plus rapide (95 % des requêtes répondent en moins du « p95 », à
              un palier près).
            </p>
            <table className="mt-2 w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-normal">Route</th>
                  <th className="px-4 py-2 text-right font-normal">Requêtes</th>
                  <th className="px-4 py-2 text-right font-normal">Moyenne</th>
                  <th className="px-4 py-2 text-right font-normal">p95</th>
                  <th className="px-4 py-2 text-right font-normal">Max</th>
                  <th className="px-4 py-2 text-right font-normal">Lentes</th>
                  <th className="px-4 py-2 text-right font-normal">429</th>
                  <th className="px-4 py-2 text-right font-normal">5xx</th>
                </tr>
              </thead>
              <tbody>
                {m.routes.map((r) => (
                  <tr key={r.route} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-1.5 font-mono text-xs">{r.route}</td>
                    <td className="px-4 py-1.5 text-right font-mono">{fmt(r.count)}</td>
                    <td className="px-4 py-1.5 text-right font-mono">{ms(r.avgMs)}</td>
                    <td
                      className={`px-4 py-1.5 text-right font-mono ${r.p95Ms >= m.slowThresholdMs ? 'text-amber-600' : ''}`}
                    >
                      {ms(r.p95Ms)}
                    </td>
                    <td className="px-4 py-1.5 text-right font-mono">{ms(r.maxMs)}</td>
                    <td className="px-4 py-1.5 text-right font-mono">{fmt(r.slow)}</td>
                    <td className="px-4 py-1.5 text-right font-mono">{fmt(r.limited)}</td>
                    <td
                      className={`px-4 py-1.5 text-right font-mono ${r.errors > 0 ? 'text-red-600' : ''}`}
                    >
                      {fmt(r.errors)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
