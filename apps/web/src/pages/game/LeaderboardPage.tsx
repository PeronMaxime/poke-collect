import { useState } from 'react';
import type { GuildLeaderboardEntryDto, LeaderboardEntryDto, LeaderboardKind } from '@poke/shared';
import { PokemonSprite, ViewTabs } from '../../components/ui';
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
      <ViewTabs
        tabs={BOARDS.map((b) => ({ id: b.id, label: b.label }))}
        selected={kind}
        onSelect={select}
      />
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
        <div className="card overflow-hidden max-sm:p-2">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-800">
              <tr>
                <th className="w-9 px-1 py-2 text-center font-medium sm:w-16 sm:px-4 sm:text-left">
                  Rang
                </th>
                <th className="px-2 py-2 font-medium sm:px-4">Dresseur</th>
                <th className="px-2 py-2 text-right font-medium sm:px-4">{board.unit}</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((e) => (
                <Row key={`${e.rank}-${e.trainerName}`} entry={e} format={format} />
              ))}
              {data.me && !meShown && (
                <>
                  <tr>
                    <td colSpan={3} className="px-2 py-1 sm:px-4 text-center text-slate-400">
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
    <div className="card overflow-hidden max-sm:p-2">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-800">
          <tr>
            <th className="w-9 px-1 py-2 text-center font-medium sm:w-16 sm:px-4 sm:text-left">
              Rang
            </th>
            <th className="px-2 py-2 font-medium sm:px-4">Guilde</th>
            <th className="px-2 py-2 text-right font-medium sm:px-4">Quêtes</th>
          </tr>
        </thead>
        <tbody>
          {data.entries.map((e) => (
            <GuildRow key={e.id} entry={e} />
          ))}
          {data.me && !meShown && (
            <>
              <tr>
                <td colSpan={3} className="px-2 py-1 sm:px-4 text-center text-slate-400">
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
      <td className="px-1 py-2 text-center tabular-nums sm:px-4 sm:text-left">
        <RankCell rank={entry.rank} />
      </td>
      <td className="max-w-0 px-2 py-2 sm:px-4">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <a
            href={guildLink(entry.id)}
            className="min-w-0 [overflow-wrap:anywhere] hover:text-brand-600 hover:underline dark:hover:text-brand-500"
            title="Voir la guilde"
          >
            {entry.name}
          </a>
          <span className="shrink-0 text-xs font-normal text-slate-500">
            {entry.memberCount} membre{entry.memberCount > 1 ? 's' : ''}
          </span>
        </span>
      </td>
      <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums sm:px-4">
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
      <td className="px-1 py-2 text-center tabular-nums sm:px-4 sm:text-left">
        <RankCell rank={entry.rank} />
      </td>
      <td className="px-2 py-2 sm:px-4">
        <span className="flex items-center gap-2">
          {entry.favorite && (
            // Masqué sur mobile pour laisser toute la place au pseudo.
            <span className="shrink-0 max-sm:hidden">
              <PokemonSprite
                speciesId={entry.favorite.speciesId}
                formId={entry.favorite.formId}
                shiny={entry.favorite.shiny}
                size={32}
              />
            </span>
          )}
          <a
            href={entry.isMe ? '#trainer' : trainerLink(entry.trainerName)}
            className="min-w-0 [overflow-wrap:anywhere] hover:text-brand-600 hover:underline dark:hover:text-brand-500"
            title="Voir sa fiche dresseur"
          >
            {entry.trainerName}
          </a>
        </span>
      </td>
      <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums sm:px-4">
        {format(entry.value)}
      </td>
    </tr>
  );
}
