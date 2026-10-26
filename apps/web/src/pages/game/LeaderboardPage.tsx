import { useState } from 'react';
import type { GuildLeaderboardEntryDto, LeaderboardEntryDto, LeaderboardKind } from '@poke/shared';
import { PokemonSprite } from '../../components/ui';
import { useGuildLeaderboard, useLeaderboard } from '../../lib/game';
import { formatMoney } from '../../lib/labels';
import { guildLink, trainerLink } from './TrainerCardPage';

/** Classements de dresseurs, puis celui des guildes. */
type Board = LeaderboardKind | 'guilds';

const BOARDS: { id: Board; label: string; unit: string; hint: string }[] = [
  {
    id: 'species',
    label: 'Pokémon capturés',
    unit: 'Pokémon',
    hint: 'Espèces et formes (régionales, Méga…) différentes capturées au moins une fois (Pokédex).',
  },
  { id: 'money', label: 'Fortune', unit: 'Argent', hint: 'Poké Dollars possédés actuellement.' },
  {
    id: 'badges',
    label: 'Badges',
    unit: 'Badges',
    hint: 'Badges d’arène remportés, toutes régions.',
  },
  {
    id: 'shiny',
    label: 'Chromatiques',
    unit: 'Pokémon',
    hint: 'Espèces et formes (régionales, Méga…) différentes capturées au moins une fois en chromatique.',
  },
  {
    id: 'guilds',
    label: 'Guildes',
    unit: 'Quêtes',
    hint: 'Quêtes de guilde terminées depuis la création de la guilde.',
  },
];

const MEDALS = ['🥇', '🥈', '🥉'];
const STORAGE_KEY = 'leaderboard-tab';

function savedBoard(): Board {
  const saved = localStorage.getItem(STORAGE_KEY);
  return BOARDS.find((b) => b.id === saved)?.id ?? 'species';
}

/** Classements entre dresseurs, un onglet par classement. */
export function LeaderboardPage() {
  const [kind, setKind] = useState<Board>(savedBoard);
  const board = BOARDS.find((b) => b.id === kind)!;
  const guildBoard = kind === 'guilds';
  const query = useLeaderboard(guildBoard ? 'species' : kind, !guildBoard);
  const guildQuery = useGuildLeaderboard(guildBoard);
  const data = query.data;
  const meShown = data?.entries.some((e) => e.isMe) ?? false;

  function select(id: Board) {
    setKind(id);
    localStorage.setItem(STORAGE_KEY, id);
  }

  const format = (value: number) =>
    kind === 'money' ? formatMoney(value) : value.toLocaleString('fr-FR');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1" role="tablist">
        {BOARDS.map((b) => (
          <button
            key={b.id}
            role="tab"
            aria-selected={b.id === kind}
            onClick={() => select(b.id)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              b.id === kind
                ? 'bg-brand-500 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>
      <p className="text-sm text-slate-500">
        {board.hint}
        {guildBoard
          ? guildQuery.data && ` ${guildQuery.data.total.toLocaleString('fr-FR')} guildes classées.`
          : data && ` ${data.total.toLocaleString('fr-FR')} dresseurs classés.`}
      </p>

      {guildBoard ? (
        <GuildBoard query={guildQuery} />
      ) : query.isError ? (
        <p className="text-red-600">Impossible de charger le classement.</p>
      ) : !data ? (
        <p className="text-slate-500">Chargement…</p>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-800">
              <tr>
                <th className="w-16 px-4 py-2 font-medium">Rang</th>
                <th className="px-4 py-2 font-medium">Dresseur</th>
                <th className="px-4 py-2 text-right font-medium">{board.unit}</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((e) => (
                <Row key={`${e.rank}-${e.trainerName}`} entry={e} format={format} />
              ))}
              {data.me && !meShown && (
                <>
                  <tr>
                    <td colSpan={3} className="px-4 py-1 text-center text-slate-400">
                      ⋯
                    </td>
                  </tr>
                  <Row entry={data.me} format={format} />
                </>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function GuildBoard({ query }: { query: ReturnType<typeof useGuildLeaderboard> }) {
  const data = query.data;
  if (query.isError) return <p className="text-red-600">Impossible de charger le classement.</p>;
  if (!data) return <p className="text-slate-500">Chargement…</p>;
  if (data.total === 0) return <p className="text-slate-500">Aucune guilde pour l’instant.</p>;
  const meShown = data.entries.some((e) => e.isMine);
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-800">
          <tr>
            <th className="w-16 px-4 py-2 font-medium">Rang</th>
            <th className="px-4 py-2 font-medium">Guilde</th>
            <th className="px-4 py-2 text-right font-medium">Quêtes</th>
          </tr>
        </thead>
        <tbody>
          {data.entries.map((e) => (
            <GuildRow key={e.id} entry={e} />
          ))}
          {data.me && !meShown && (
            <>
              <tr>
                <td colSpan={3} className="px-4 py-1 text-center text-slate-400">
                  ⋯
                </td>
              </tr>
              <GuildRow entry={data.me} />
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}

function GuildRow({ entry }: { entry: GuildLeaderboardEntryDto }) {
  return (
    <tr
      className={`border-t border-slate-100 first:border-t-0 dark:border-slate-800/60 ${
        entry.isMine ? 'bg-brand-500/10 font-semibold' : ''
      }`}
    >
      <td className="px-4 py-2 tabular-nums">
        <RankCell rank={entry.rank} />
      </td>
      <td className="max-w-0 px-4 py-2">
        <span className="flex items-baseline gap-2">
          <a
            href={guildLink(entry.id)}
            className="truncate hover:text-brand-600 hover:underline dark:hover:text-brand-500"
            title="Voir la guilde"
          >
            {entry.name}
          </a>
          <span className="shrink-0 text-xs font-normal text-slate-500">
            {entry.memberCount} membre{entry.memberCount > 1 ? 's' : ''}
            {entry.isMine && ' · (la tienne)'}
          </span>
        </span>
      </td>
      <td className="px-4 py-2 text-right tabular-nums">
        {entry.questsCompleted.toLocaleString('fr-FR')}
      </td>
    </tr>
  );
}

function RankCell({ rank }: { rank: number }) {
  return rank <= MEDALS.length ? (
    <span className="text-lg" title={`Rang ${rank}`}>
      {MEDALS[rank - 1]}
    </span>
  ) : (
    <>{rank}</>
  );
}

function Row({ entry, format }: { entry: LeaderboardEntryDto; format: (value: number) => string }) {
  return (
    <tr
      className={`border-t border-slate-100 first:border-t-0 dark:border-slate-800/60 ${
        entry.isMe ? 'bg-brand-500/10 font-semibold' : ''
      }`}
    >
      <td className="px-4 py-2 tabular-nums">
        <RankCell rank={entry.rank} />
      </td>
      <td className="px-4 py-2">
        <span className="flex items-center gap-2">
          {entry.starterSpeciesId !== null && (
            <PokemonSprite speciesId={entry.starterSpeciesId} size={32} />
          )}
          <a
            href={entry.isMe ? '#trainer' : trainerLink(entry.trainerName)}
            className="truncate hover:text-brand-600 hover:underline dark:hover:text-brand-500"
            title="Voir sa fiche dresseur"
          >
            {entry.trainerName}
          </a>
          {entry.isMe && <span className="text-xs font-normal text-slate-500">(vous)</span>}
        </span>
      </td>
      <td className="px-4 py-2 text-right tabular-nums">{format(entry.value)}</td>
    </tr>
  );
}
