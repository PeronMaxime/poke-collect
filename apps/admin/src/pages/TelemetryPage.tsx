import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DurationStats, TelemetryResponse, TelemetryStepKind } from '@poke/shared';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';

const PERIODS = [7, 30, 90] as const;

const KIND_LABELS: Record<TelemetryStepKind, string> = {
  expedition: 'Départ',
  region: 'Région',
  trainer: 'Dresseur',
  reward: 'Récompense',
  quest: 'Quête',
};

const numberFormat = new Intl.NumberFormat('fr-FR');
const fmt = (n: number) => numberFormat.format(n);

/** Heures → « 45 min », « 3,5 h » ou « 2,1 j ». */
function formatHours(h: number | null): string {
  if (h === null) return '—';
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${numberFormat.format(Math.round(h * 10) / 10)} h`;
  return `${numberFormat.format(Math.round((h / 24) * 10) / 10)} j`;
}

const percent = (part: number, total: number) => (total > 0 ? (part / total) * 100 : null);
const formatPercent = (p: number | null) => (p === null ? '—' : `${Math.round(p)} %`);

/** Barre de proportion (une seule série : la valeur est aussi écrite à côté). */
function Meter({ value, title }: { value: number | null; title?: string }) {
  return (
    <div className="flex items-center gap-2" title={title}>
      <div className="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-brand-500"
          style={{ width: `${Math.min(100, Math.max(0, value ?? 0))}%` }}
        />
      </div>
      <span className="w-12 text-right font-mono text-xs">{formatPercent(value)}</span>
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

const durationTitle = (d: DurationStats) =>
  `${d.players} joueur(s) · médiane ${formatHours(d.medianHours)} · 90 % en moins de ${formatHours(d.p90Hours)}`;

/**
 * Télémétrie d'équilibrage : parcours des joueurs (temps de complétion depuis l'inscription) et
 * goulets (dresseurs, étapes de quête, zones), pour régler le contenu dans les autres sections.
 */
export function TelemetryPage() {
  const [days, setDays] = useState<number>(30);
  const query = useQuery({
    queryKey: ['telemetry', days],
    queryFn: () => api<TelemetryResponse>(`/api/admin/telemetry?days=${days}`),
  });
  const t = query.data;

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Télémétrie</h1>
          <p className="text-sm text-slate-500">
            Temps de complétion et goulets, déduits des parties en cours (contenu publié). Combats,
            expéditions et économie : sur la période choisie ; parcours : depuis l’inscription.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {PERIODS.map((p) => (
            <button
              key={p}
              className={p === days ? 'btn-primary' : 'btn-ghost'}
              onClick={() => setDays(p)}
            >
              {p} j
            </button>
          ))}
          <button className="btn-ghost" onClick={() => void query.refetch()}>
            Actualiser
          </button>
        </div>
      </div>

      {query.isPending && <p className="text-slate-500">Chargement…</p>}
      {query.isError && <p className="text-red-600">Impossible de charger la télémétrie.</p>}
      {t && (
        <>
          <p className="text-xs text-slate-500">Calculée le {formatDate(t.generatedAt)}.</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Tile
              label="Joueurs"
              value={fmt(t.players.total)}
              hint={`${fmt(t.players.withStarter)} avec un starter`}
            />
            <Tile label="Nouveaux (7 j)" value={fmt(t.players.new7d)} />
            <Tile label="Actifs (24 h)" value={fmt(t.players.active1d)} />
            <Tile label="Actifs (7 j)" value={fmt(t.players.active7d)} />
            <Tile
              label={`Gagné / dépensé (${t.days} j)`}
              value={`${fmt(t.economy.earned)} ₽`}
              hint={`${fmt(t.economy.spent)} ₽ dépensés en boutique`}
            />
            <Tile
              label="Solde médian"
              value={
                t.economy.medianBalance === null
                  ? '—'
                  : `${fmt(Math.round(t.economy.medianBalance))} ₽`
              }
            />
          </div>

          <section className="card overflow-x-auto p-0">
            <h2 className="px-4 pt-4 font-semibold">Parcours des joueurs</h2>
            <p className="px-4 text-xs text-slate-500">
              Part des joueurs (avec starter) ayant atteint chaque étape, et temps écoulé depuis
              leur inscription. Une étape peu atteinte avec un temps long signale un goulet.
            </p>
            <table className="mt-2 w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-normal">Étape</th>
                  <th className="px-4 py-2 font-normal">Atteinte</th>
                  <th className="px-4 py-2 text-right font-normal">Joueurs</th>
                  <th className="px-4 py-2 text-right font-normal">Médiane</th>
                  <th className="px-4 py-2 text-right font-normal">90 %</th>
                </tr>
              </thead>
              <tbody>
                {t.steps.map((s) => (
                  <tr
                    key={`${s.kind}:${s.id}`}
                    className="border-t border-slate-100 dark:border-slate-800"
                  >
                    <td className="px-4 py-1.5">
                      <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {KIND_LABELS[s.kind]}
                      </span>
                      {s.label}
                    </td>
                    <td className="px-4 py-1.5">
                      <Meter value={s.reachedPercent} title={durationTitle(s)} />
                    </td>
                    <td className="px-4 py-1.5 text-right font-mono">{fmt(s.players)}</td>
                    <td className="px-4 py-1.5 text-right font-mono">
                      {formatHours(s.medianHours)}
                    </td>
                    <td className="px-4 py-1.5 text-right font-mono">{formatHours(s.p90Hours)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="card overflow-x-auto p-0">
              <h2 className="px-4 pt-4 font-semibold">Dresseurs ({t.days} j)</h2>
              <p className="px-4 text-xs text-slate-500">
                « Bloqués » : joueurs qui ont perdu sans jamais gagner. Une victoire réelle bien
                sous la chance estimée, ou beaucoup de bloqués, désigne un dresseur trop dur.
              </p>
              <table className="mt-2 w-full text-sm">
                <thead className="text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-normal">Dresseur</th>
                    <th className="px-4 py-2 text-right font-normal">Combats</th>
                    <th className="px-4 py-2 font-normal">Victoires</th>
                    <th className="px-4 py-2 text-right font-normal">Estimée</th>
                    <th className="px-4 py-2 text-right font-normal">Bloqués</th>
                  </tr>
                </thead>
                <tbody>
                  {[...t.trainers]
                    .sort((a, b) => b.stuckPlayers - a.stuckPlayers || b.battles - a.battles)
                    .map((tr) => (
                      <tr
                        key={tr.trainerId}
                        className="border-t border-slate-100 dark:border-slate-800"
                      >
                        <td className="px-4 py-1.5">{tr.label}</td>
                        <td className="px-4 py-1.5 text-right font-mono">{fmt(tr.battles)}</td>
                        <td className="px-4 py-1.5">
                          <Meter
                            value={percent(tr.wins, tr.battles)}
                            title={`${tr.wins} victoire(s)`}
                          />
                        </td>
                        <td className="px-4 py-1.5 text-right font-mono">
                          {formatPercent(tr.avgWinChance === null ? null : tr.avgWinChance * 100)}
                        </td>
                        <td
                          className={`px-4 py-1.5 text-right font-mono ${tr.stuckPlayers > 0 ? 'font-semibold text-amber-700 dark:text-amber-400' : ''}`}
                        >
                          {tr.stuckPlayers > 0 ? `⚠ ${fmt(tr.stuckPlayers)}` : '0'}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </section>

            <section className="card overflow-x-auto p-0">
              <h2 className="px-4 pt-4 font-semibold">Zones ({t.days} j)</h2>
              <p className="px-4 text-xs text-slate-500">
                Expéditions récupérées sur la période. Une zone délaissée ou au taux de capture
                faible est à revoir (PE minimale, rencontres, durées).
              </p>
              <table className="mt-2 w-full text-sm">
                <thead className="text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-normal">Zone</th>
                    <th className="px-4 py-2 text-right font-normal">Expéditions</th>
                    <th className="px-4 py-2 text-right font-normal">Joueurs</th>
                    <th className="px-4 py-2 text-right font-normal">Durée moy.</th>
                    <th className="px-4 py-2 font-normal">Capture</th>
                  </tr>
                </thead>
                <tbody>
                  {t.zones.map((z) => (
                    <tr key={z.zoneId} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-4 py-1.5">{z.label}</td>
                      <td className="px-4 py-1.5 text-right font-mono">{fmt(z.expeditions)}</td>
                      <td className="px-4 py-1.5 text-right font-mono">{fmt(z.players)}</td>
                      <td className="px-4 py-1.5 text-right font-mono">
                        {z.avgDurationMinutes === null ? '—' : `${z.avgDurationMinutes} min`}
                      </td>
                      <td className="px-4 py-1.5">
                        <Meter
                          value={percent(z.captures, z.encounters)}
                          title={`${z.captures} capture(s) sur ${z.encounters} rencontre(s)`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>

          <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
            <section className="card overflow-x-auto p-0">
              <h2 className="px-4 pt-4 font-semibold">Quêtes</h2>
              <p className="px-4 text-xs text-slate-500">
                Joueurs actuellement à chaque étape et depuis combien de temps (médiane).
              </p>
              <table className="mt-2 w-full text-sm">
                <thead className="text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-normal">Quête / étape</th>
                    <th className="px-4 py-2 text-right font-normal">Joueurs</th>
                    <th className="px-4 py-2 text-right font-normal">Depuis</th>
                  </tr>
                </thead>
                <tbody>
                  {t.quests.map((q) => (
                    <QuestRows key={q.questId} quest={q} />
                  ))}
                </tbody>
              </table>
            </section>

            <section className="card p-4">
              <h2 className="font-semibold">Pokédex national</h2>
              <p className="text-xs text-slate-500">Joueurs par part du Pokédex capturée.</p>
              <ul className="mt-3 space-y-1.5 text-sm">
                {t.dexDistribution.map((b) => (
                  <li key={b.label} className="flex items-center justify-between gap-2">
                    <span className="w-24 shrink-0 text-slate-500">{b.label}</span>
                    <Meter
                      value={percent(b.players, t.players.withStarter)}
                      title={`${b.players} joueur(s)`}
                    />
                    <span className="w-8 text-right font-mono text-xs">{b.players}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function QuestRows({ quest }: { quest: TelemetryResponse['quests'][number] }) {
  return (
    <>
      <tr className="border-t border-slate-200 dark:border-slate-700">
        <td className="px-4 py-1.5 font-medium">{quest.label}</td>
        <td className="px-4 py-1.5 text-right text-xs text-slate-500" colSpan={2}>
          {fmt(quest.started)} commencée(s) · {fmt(quest.completed)} terminée(s)
        </td>
      </tr>
      {quest.steps.map((s) => (
        <tr key={s.index} className="text-slate-600 dark:text-slate-300">
          <td className="px-4 py-1 pl-8 text-xs">
            {s.index + 1}. {s.name}
          </td>
          <td
            className={`px-4 py-1 text-right font-mono text-xs ${s.players > 0 ? 'font-semibold' : 'text-slate-400'}`}
          >
            {fmt(s.players)}
          </td>
          <td className="px-4 py-1 text-right font-mono text-xs" title={durationTitle(s)}>
            {formatHours(s.medianHours)}
          </td>
        </tr>
      ))}
    </>
  );
}
