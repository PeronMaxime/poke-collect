/**
 * Page « Guildes et discussions » (Modération) : chercher une guilde, corriger son nom ou sa
 * description, lire sa discussion et en supprimer un message. Les suspensions et les noms de
 * dresseur se règlent sur la fiche du joueur (page Joueurs).
 */
import { useEffect, useState } from 'react';
import type { ModerationGuildDetailResponse, ModerationGuildDto } from '@poke/shared';
import { formatDate } from '../lib/format';
import { moderationError, useModerationGuild, useModerationGuilds } from '../lib/moderation';

const ROLE_LABELS = { leader: 'Chef', officer: 'Officier', member: 'Membre' } as const;

/** Guildes (recherche par nom), et la fiche de celle choisie. */
export function GuildModerationPage() {
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    const id = window.setTimeout(() => setQuery(text.trim()), 250);
    return () => window.clearTimeout(id);
  }, [text]);
  const guilds = useModerationGuilds(query);

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Guildes et discussions</h1>
        <p className="text-sm text-slate-500">
          Corriger le nom ou la description d’une guilde, lire sa discussion et supprimer un
          message. Chaque action est inscrite au journal. Suspendre un joueur ou renommer son
          dresseur : sa fiche, page Joueurs.
        </p>
      </div>

      <input
        className="input max-w-xs"
        type="search"
        placeholder="Rechercher une guilde…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      {guilds.isPending && <p className="text-slate-500">Chargement…</p>}
      {guilds.isError && <p className="text-red-600">{moderationError(guilds.error)}</p>}
      {guilds.data && (
        <GuildTable guilds={guilds.data} selected={selected} onSelect={setSelected} />
      )}

      {selected && <GuildPanel key={selected} guildId={selected} />}
    </div>
  );
}

function GuildTable({
  guilds,
  selected,
  onSelect,
}: {
  guilds: ModerationGuildDto[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="card overflow-x-auto p-0">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="text-left text-xs text-slate-500">
          <tr>
            <th className="px-4 py-2 font-normal">Guilde</th>
            <th className="px-4 py-2 font-normal">Chef</th>
            <th className="px-4 py-2 font-normal">Membres</th>
            <th className="px-4 py-2 text-right font-normal">Dernier message</th>
          </tr>
        </thead>
        <tbody>
          {guilds.map((g) => (
            <tr
              key={g.id}
              className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50 ${
                g.id === selected ? 'bg-brand-500/5' : ''
              }`}
              onClick={() => onSelect(g.id)}
            >
              <td className="px-4 py-2">
                <span className="block font-medium">{g.name}</span>
                {g.description && (
                  <span className="block truncate text-xs text-slate-500">{g.description}</span>
                )}
              </td>
              <td className="px-4 py-2 text-slate-500">{g.leaderName ?? '—'}</td>
              <td className="px-4 py-2 tabular-nums">{g.memberCount}</td>
              <td className="px-4 py-2 text-right text-slate-500">{formatDate(g.lastMessageAt)}</td>
            </tr>
          ))}
          {guilds.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                Aucune guilde ne correspond.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

/** Fiche d'une guilde : correction, membres, discussion. */
function GuildPanel({ guildId }: { guildId: string }) {
  const { detail, update, deleteMessage } = useModerationGuild(guildId);
  if (detail.isPending) return <p className="text-slate-500">Chargement…</p>;
  if (detail.isError) return <p className="text-red-600">{moderationError(detail.error)}</p>;
  const error = [update, deleteMessage].find((m) => m.isError)?.error;
  return (
    <section className="card space-y-5 p-5">
      <GuildForm
        key={`${detail.data.guild.name}|${detail.data.guild.description}`}
        guild={detail.data.guild}
        saving={update.isPending}
        onSave={(input) => update.mutate(input)}
      />
      {error && <p className="text-sm text-red-600">{moderationError(error)}</p>}
      <GuildMembers members={detail.data.members} />
      <GuildMessages
        messages={detail.data.messages}
        deleting={deleteMessage.isPending}
        onDelete={(id) => deleteMessage.mutate(id)}
      />
    </section>
  );
}

function GuildForm({
  guild,
  saving,
  onSave,
}: {
  guild: ModerationGuildDto;
  saving: boolean;
  onSave: (input: { name?: string; description?: string }) => void;
}) {
  const [name, setName] = useState(guild.name);
  const [description, setDescription] = useState(guild.description);
  const changed = name.trim() !== guild.name || description.trim() !== guild.description;
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...(name.trim() !== guild.name && { name: name.trim() }),
          ...(description.trim() !== guild.description && { description: description.trim() }),
        });
      }}
    >
      <h2 className="text-lg font-semibold">{guild.name}</h2>
      <p className="text-xs text-slate-500">
        Fondée le {formatDate(guild.createdAt)} · {guild.memberCount} membre(s) ·{' '}
        {guild.joinMode === 'open' ? 'adhésion libre' : 'sur demande'}
      </p>
      <label className="block text-sm">
        <span className="text-xs text-slate-500">Nom</span>
        <input
          className="input w-full max-w-sm"
          value={name}
          maxLength={24}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="block text-sm">
        <span className="text-xs text-slate-500">Description</span>
        <textarea
          className="input w-full"
          rows={2}
          value={description}
          maxLength={200}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <button type="submit" className="btn-primary" disabled={!changed || saving}>
        Enregistrer
      </button>
    </form>
  );
}

function GuildMembers({ members }: { members: ModerationGuildDetailResponse['members'] }) {
  return (
    <div>
      <h3 className="mb-2 font-semibold">Membres</h3>
      <ul className="flex flex-wrap gap-2 text-sm">
        {members.map((m) => (
          <li
            key={m.userId}
            className="rounded-lg border border-slate-200 px-2 py-1 dark:border-slate-800"
          >
            {m.trainerName} <span className="text-xs text-slate-500">· {ROLE_LABELS[m.role]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GuildMessages({
  messages,
  deleting,
  onDelete,
}: {
  messages: ModerationGuildDetailResponse['messages'];
  deleting: boolean;
  onDelete: (id: string) => void;
}) {
  return (
    <div>
      <h3 className="mb-2 font-semibold">Discussion</h3>
      {messages.length === 0 ? (
        <p className="text-sm text-slate-500">Aucun message conservé.</p>
      ) : (
        <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
          {messages.map((m) => (
            <li key={m.id} className="flex items-start gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-500">
                  {m.trainerName ?? 'Message du jeu'} · {formatDate(m.createdAt)}
                </p>
                <p className="break-words whitespace-pre-wrap">{m.body}</p>
              </div>
              {m.userId && (
                <button
                  className="btn-ghost px-2 py-1 text-xs text-red-600"
                  disabled={deleting}
                  onClick={() => onDelete(m.id)}
                >
                  Supprimer
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
