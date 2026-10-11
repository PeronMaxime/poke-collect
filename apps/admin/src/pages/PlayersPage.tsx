import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ACTIVE_WINDOW_MS, ONLINE_WINDOW_MS } from '@poke/shared';
import type { AdminPlayerDetailResponse, AdminPlayerDto } from '@poke/shared';
import { Sprite } from '../components/forms/pickers';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';

type Presence = 'online' | 'active' | 'inactive';
type Filter = 'all' | 'online' | 'active' | 'inactive';
type SortKey = 'name' | 'lastSeen' | 'createdAt';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'online', label: 'Connectés' },
  { value: 'active', label: 'Actifs (7 j)' },
  { value: 'inactive', label: 'Inactifs' },
];

const numberFormat = new Intl.NumberFormat('fr-FR');
const fmt = (n: number) => numberFormat.format(n);
const relative = new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto' });

function presence(p: AdminPlayerDto, now: number): Presence {
  const seen = p.lastSeenAt ? new Date(p.lastSeenAt).getTime() : null;
  if (seen !== null && now - seen < ONLINE_WINDOW_MS) return 'online';
  if (seen !== null && now - seen < ACTIVE_WINDOW_MS) return 'active';
  return 'inactive';
}

/** « à l'instant », « il y a 12 minutes », « il y a 3 jours »… */
function sinceLabel(iso: string | null, now: number): string {
  if (!iso) return 'Jamais vu';
  const minutes = Math.round((new Date(iso).getTime() - now) / 60_000);
  if (minutes > -1) return 'À l’instant';
  if (minutes > -60) return relative.format(minutes, 'minute');
  if (minutes > -48 * 60) return relative.format(Math.round(minutes / 60), 'hour');
  return relative.format(Math.round(minutes / 1440), 'day');
}

const displayName = (p: AdminPlayerDto) => p.trainerName ?? p.name;

function PresenceDot({ online }: { online: boolean }) {
  return (
    <span
      title={online ? 'Connecté' : 'Hors ligne'}
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${
        online ? 'bg-green-500 ring-2 ring-green-500/25' : 'bg-slate-300 dark:bg-slate-600'
      }`}
    />
  );
}

function ActivityPill({ presence }: { presence: Presence }) {
  return presence === 'inactive' ? (
    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800">
      Inactif
    </span>
  ) : (
    <span className="rounded bg-green-50 px-1.5 py-0.5 text-[11px] text-green-700 dark:bg-green-950 dark:text-green-400">
      Actif
    </span>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function SortHeader({
  label,
  active,
  desc,
  className = '',
  onClick,
}: {
  label: string;
  active: boolean;
  desc: boolean;
  className?: string | undefined;
  onClick: () => void;
}) {
  return (
    <th className={`px-4 py-2 font-normal ${className}`}>
      <button
        className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100"
        onClick={onClick}
      >
        {label}
        <span className="w-2 text-[10px]">{active ? (desc ? '▼' : '▲') : ''}</span>
      </button>
    </th>
  );
}

/** Horloge rafraîchie toutes les 30 s, pour que les pastilles suivent sans recharger. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** Joueurs inscrits : présence (connecté / actif sur 7 jours), recherche, filtre et tri. */
export function PlayersPage() {
  const query = useQuery({
    queryKey: ['admin-players'],
    queryFn: () => api<AdminPlayerDto[]>('/api/admin/players'),
    refetchInterval: 60_000,
  });
  const now = useNow();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({
    key: 'lastSeen',
    desc: true,
  });
  const [selected, setSelected] = useState<string | null>(null);

  const players = useMemo(() => query.data ?? [], [query.data]);
  const counts = useMemo(() => {
    const c = { online: 0, active: 0 };
    for (const p of players) {
      const s = presence(p, now);
      if (s === 'online') c.online++;
      if (s !== 'inactive') c.active++;
    }
    return c;
  }, [players, now]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = players.filter((p) => {
      const s = presence(p, now);
      if (filter === 'online' && s !== 'online') return false;
      if (filter === 'active' && s === 'inactive') return false;
      if (filter === 'inactive' && s !== 'inactive') return false;
      return (
        !needle || [p.trainerName, p.name, p.email].some((v) => v?.toLowerCase().includes(needle))
      );
    });
    const time = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);
    const compare = (a: AdminPlayerDto, b: AdminPlayerDto) => {
      if (sort.key === 'name') return displayName(a).localeCompare(displayName(b), 'fr');
      if (sort.key === 'createdAt') return time(a.createdAt) - time(b.createdAt);
      return time(a.lastSeenAt) - time(b.lastSeenAt);
    };
    return filtered.sort((a, b) => (sort.desc ? -compare(a, b) : compare(a, b)));
  }, [players, search, filter, sort, now]);

  const sortBy = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== 'name' }));
  const header = (key: SortKey, label: string, className?: string) => (
    <SortHeader
      label={label}
      active={sort.key === key}
      desc={sort.desc}
      className={className}
      onClick={() => sortBy(key)}
    />
  );

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Joueurs</h1>
        <p className="text-sm text-slate-500">
          Comptes inscrits. Connecté : jeu ouvert il y a moins de 3 minutes ; actif : vu au cours
          des 7 derniers jours. Cliquer sur une ligne ouvre la fiche dresseur.
        </p>
      </div>

      {query.isPending && <p className="text-slate-500">Chargement…</p>}
      {query.isError && <p className="text-red-600">Impossible de charger les joueurs.</p>}
      {query.data && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Tile label="Inscrits" value={fmt(players.length)} />
            <Tile label="Connectés" value={fmt(counts.online)} />
            <Tile label="Actifs (7 j)" value={fmt(counts.active)} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              className="input max-w-xs"
              type="search"
              placeholder="Rechercher (dresseur, nom, e-mail)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {FILTERS.map((f) => (
              <button
                key={f.value}
                className={f.value === filter ? 'btn-primary' : 'btn-ghost'}
                onClick={() => setFilter(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <section className="card overflow-x-auto p-0">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  {header('name', 'Joueur')}
                  <th className="px-4 py-2 font-normal">E-mail</th>
                  {header('lastSeen', 'Activité')}
                  {header('createdAt', 'Inscription', 'text-right')}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const s = presence(p, now);
                  return (
                    <tr
                      key={p.id}
                      className="cursor-pointer border-t border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                      onClick={() => setSelected(p.id)}
                    >
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <PresenceDot online={s === 'online'} />
                          {p.starterSpeciesId !== null ? (
                            <Sprite id={p.starterSpeciesId} size={28} />
                          ) : (
                            <span className="w-7" />
                          )}
                          <span className="min-w-0">
                            <span className="block truncate font-medium">
                              {displayName(p)}
                              {p.role === 'admin' && (
                                <span className="ml-2 rounded bg-brand-500/10 px-1.5 py-0.5 text-[11px] text-brand-600">
                                  Admin
                                </span>
                              )}
                            </span>
                            {p.trainerName === null && (
                              <span className="block text-xs text-slate-500">
                                Profil de dresseur non créé
                              </span>
                            )}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-slate-500">{p.email}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <ActivityPill presence={s} />
                          <span className="text-xs text-slate-500" title={formatDate(p.lastSeenAt)}>
                            {s === 'online' ? 'En ligne' : sinceLabel(p.lastSeenAt, now)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right text-slate-500">
                        {formatDate(p.createdAt)}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                      Aucun joueur ne correspond.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </>
      )}

      {selected && <PlayerCardDialog userId={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function BadgeIcon({ name, image }: { name: string; image: string | null }) {
  return image ? (
    <img src={image} alt={name} width={32} height={32} />
  ) : (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-amber-200 to-amber-500 text-amber-900 shadow-inner">
      ★
    </span>
  );
}

/** Fiche dresseur du joueur (identité, argent, badges, statistiques), en surimpression. */
function PlayerCardDialog({ userId, onClose }: { userId: string; onClose: () => void }) {
  const query = useQuery({
    queryKey: ['admin-player', userId],
    queryFn: () =>
      api<AdminPlayerDetailResponse>(`/api/admin/players/${encodeURIComponent(userId)}`),
  });
  const now = useNow();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const d = query.data;
  const card = d?.card;
  const stats: { label: string; value: string | number }[] = card
    ? [
        { label: 'Espèces capturées', value: d.speciesCaught },
        { label: 'Espèces chromatiques', value: d.shinySpeciesCaught },
        { label: 'Pokémon capturés', value: card.captures },
        { label: 'Pokémon possédés', value: card.pokemonOwned },
        { label: 'Chromatiques possédés', value: card.shiniesOwned },
        { label: 'Expéditions terminées', value: card.expeditionsCompleted },
        { label: 'Combats gagnés', value: card.battlesWon },
        { label: 'Combats perdus', value: card.battlesLost },
        { label: 'Dresseurs battus', value: card.trainersDefeated },
        { label: 'Œufs éclos', value: card.eggsHatched },
        { label: 'Fossiles restaurés', value: card.fossilsRevived },
        { label: 'Quêtes accomplies', value: card.questsCompleted },
        { label: 'Dépenses en boutique', value: `${fmt(card.moneySpent)} ₽` },
      ]
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="card w-full max-w-3xl space-y-5 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">Fiche dresseur</h2>
          <button className="btn-ghost px-3 py-1" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </div>

        {query.isPending && <p className="text-slate-500">Chargement…</p>}
        {query.isError && <p className="text-red-600">Impossible de charger la fiche.</p>}
        {d && (
          <>
            <section className="flex flex-wrap items-center gap-5 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50">
              {d.profile?.starterSpeciesId != null && (
                <Sprite id={d.profile.starterSpeciesId} size={96} />
              )}
              <div className="min-w-0 flex-1">
                <h3 className="flex items-center gap-2 text-2xl font-bold">
                  <PresenceDot online={presence(d.player, now) === 'online'} />
                  {d.profile?.trainerName ?? d.player.name}
                </h3>
                <p className="text-sm text-slate-500">
                  {d.player.name} · {d.player.email}
                </p>
                <p className="text-sm text-slate-500">
                  {d.profile
                    ? `Aventure commencée le ${new Date(d.profile.createdAt).toLocaleDateString('fr-FR', { dateStyle: 'long' })}`
                    : `Inscrit le ${formatDate(d.player.createdAt)} · profil de dresseur non créé`}
                </p>
                <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                  <ActivityPill presence={presence(d.player, now)} />
                  Dernière activité : {sinceLabel(d.player.lastSeenAt, now)}
                </p>
              </div>
              {d.profile && (
                <div className="text-right">
                  <p className="text-xs text-slate-500">Argent</p>
                  <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                    {fmt(d.profile.currency)} ₽
                  </p>
                </div>
              )}
            </section>

            {d.badges.length > 0 && (
              <section>
                <h3 className="mb-2 font-semibold">Badges</h3>
                <div className="space-y-3">
                  {d.badges.map((region) => (
                    <div
                      key={region.regionId}
                      className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"
                    >
                      <div className="mb-2 flex items-baseline justify-between text-sm">
                        <span className="font-medium">{region.regionName}</span>
                        <span className="text-slate-500">
                          {region.badges.filter((b) => b.earned).length} / {region.badges.length}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {region.badges.map((b) => (
                          <div
                            key={b.trainerId}
                            className={`flex items-center gap-2 text-sm ${b.earned ? '' : 'opacity-30 grayscale'}`}
                            title={
                              b.earned
                                ? `Remporté contre ${b.trainerName}`
                                : `Battre ${b.trainerName}`
                            }
                          >
                            <BadgeIcon name={b.name} image={b.image} />
                            <span className="min-w-0">
                              <span className="block truncate font-medium">{b.name}</span>
                              <span className="block truncate text-xs text-slate-500">
                                {b.trainerName}
                              </span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {stats.length > 0 && (
              <section>
                <h3 className="mb-2 font-semibold">Statistiques</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {stats.map((s) => (
                    <div
                      key={s.label}
                      className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"
                    >
                      <p className="text-xs text-slate-500">{s.label}</p>
                      <p className="mt-1 text-xl font-bold tabular-nums">
                        {typeof s.value === 'number' ? fmt(s.value) : s.value}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
