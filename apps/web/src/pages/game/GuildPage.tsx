import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CHEST_RARITY_LABELS } from '@poke/content';
import type { ChestRarity } from '@poke/content';
import { GUILD_DESCRIPTION_MAX, GUILD_MESSAGE_MAX, GUILD_NAME_MAX } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type {
  CreateGuildInput,
  GuildDto,
  GuildJoinMode,
  GuildMemberDto,
  GuildMessagesResponse,
  GuildRole,
  GuildSearchResponse,
  GuildStateResponse,
  GuildSummaryDto,
} from '@poke/shared';
import { ProgressBar, useNow } from '../../components/ui';
import { api } from '../../lib/api';
import { keys, useGuild } from '../../lib/game';
import { errorText, formatMoney, guildObjectiveText, itemIcon } from '../../lib/labels';
import { ChestLootHover } from './ChestLootHover';
import { trainerLink } from './TrainerCardPage';

/** Rafraîchissement de la discussion tant que la page est ouverte. */
const CHAT_REFRESH_MS = 5000;

const ROLE_LABELS: Record<GuildRole, string> = {
  leader: 'Chef',
  officer: 'Officier',
  member: 'Membre',
};

const JOIN_MODE_LABELS: Record<GuildJoinMode, string> = {
  open: 'Ouverte',
  request: 'Sur demande',
};

const RARITY_STYLES: Record<ChestRarity, string> = {
  bronze: 'text-amber-700 dark:text-amber-500',
  silver: 'text-slate-500 dark:text-slate-300',
  gold: 'text-yellow-600 dark:text-yellow-400',
};

const chestIcon = (ctx: GameContext, rarity: ChestRarity) => itemIcon(ctx, `guild-chest-${rarity}`);

/** Durée restante en jours et heures (« 3 j 4 h »), ou heures et minutes sous une journée. */
function formatRemaining(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days} j ${hours} h`;
  return hours > 0 ? `${hours} h ${minutes % 60} min` : `${minutes % 60} min`;
}

/** Invalide la guilde (discussion et recherche comprises) et l'argent du profil après une action. */
function useGuildAction<T>(fn: (arg: T) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.guild }),
        queryClient.invalidateQueries({ queryKey: keys.me }),
      ]),
  });
}

/**
 * Guilde : sans guilde, recherche et création ; sinon, la guilde (membres, discussion) et ses
 * quêtes de la semaine.
 */
export function GuildPage({ ctx }: { ctx: GameContext }) {
  const guild = useGuild();
  if (guild.isPending) return <p className="text-sm text-slate-500">Chargement…</p>;
  if (!guild.data) return <p className="text-sm text-red-600">{errorText(guild.error)}</p>;
  return guild.data.guild ? (
    <GuildView ctx={ctx} guild={guild.data.guild} />
  ) : (
    <NoGuild ctx={ctx} state={guild.data} />
  );
}

// --- Sans guilde : recherche et création -------------------------------------------------------

function NoGuild({ ctx, state }: { ctx: GameContext; state: GuildStateResponse }) {
  const now = useNow(30_000);
  const cooldown = state.cooldownUntil ? Date.parse(state.cooldownUntil) - now : 0;
  return (
    <div className="space-y-6">
      <section className="card space-y-2">
        <h2 className="text-lg font-semibold">Les guildes</h2>
        <p className="text-sm text-slate-500">
          Une guilde rassemble des dresseurs : discutez entre membres et relevez ensemble 5 quêtes
          chaque semaine. Chaque quête terminée donne un coffre à tous les membres qui l’ont fait
          avancer. Les quêtes repartent à zéro chaque lundi à minuit.
        </p>
        {cooldown > 0 && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Tu as quitté une guilde récemment : tu pourras en rejoindre ou en fonder une dans{' '}
            {formatRemaining(cooldown)}.
          </p>
        )}
      </section>
      {state.myRequests.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Mes candidatures</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {state.myRequests.map((g) => (
              <GuildCard key={g.id} guild={g} />
            ))}
          </ul>
        </section>
      )}
      <GuildSearch />
      <CreateGuild ctx={ctx} currency={state.currency} blocked={cooldown > 0} />
    </div>
  );
}

function GuildSearch() {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(id);
  }, [query]);
  const results = useQuery({
    queryKey: [...keys.guild, 'search', debounced.toLowerCase()],
    queryFn: () => api<GuildSearchResponse>(`/api/guilds?q=${encodeURIComponent(debounced)}`),
  });
  return (
    <section className="space-y-2">
      <h2 className="font-semibold">Rejoindre une guilde</h2>
      <input
        className="input"
        placeholder="Rechercher une guilde par son nom…"
        value={query}
        maxLength={GUILD_NAME_MAX}
        onChange={(e) => setQuery(e.target.value)}
      />
      {results.data && results.data.guilds.length === 0 && (
        <p className="text-sm text-slate-500">
          {debounced
            ? 'Aucune guilde ne porte ce nom.'
            : 'Aucune guilde pour l’instant : fonde la première !'}
        </p>
      )}
      <ul className="grid gap-2 sm:grid-cols-2">
        {results.data?.guilds.map((g) => (
          <GuildCard key={g.id} guild={g} />
        ))}
      </ul>
    </section>
  );
}

function GuildCard({ guild: g }: { guild: GuildSummaryDto }) {
  const join = useGuildAction(() =>
    api<{ joined: boolean }>(`/api/guilds/${g.id}/join`, { method: 'POST' }),
  );
  const cancel = useGuildAction(() => api(`/api/guilds/${g.id}/request`, { method: 'DELETE' }));
  const full = g.memberCount >= g.maxMembers;
  return (
    <li className="card space-y-2 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-semibold">{g.name}</span>
        <span className="shrink-0 text-xs text-slate-500">
          {g.memberCount}/{g.maxMembers} membres · {JOIN_MODE_LABELS[g.joinMode]}
        </span>
      </div>
      {g.leaderName && <p className="text-xs text-slate-500">Chef : {g.leaderName}</p>}
      {g.description && <p className="text-sm whitespace-pre-line">{g.description}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {g.requested ? (
          <>
            <span className="text-sm text-slate-500">Candidature envoyée</span>
            <button
              className="btn-ghost"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate(undefined)}
            >
              Retirer
            </button>
          </>
        ) : (
          <button
            className="btn-primary"
            disabled={join.isPending || full}
            onClick={() => join.mutate(undefined)}
          >
            {full ? 'Complète' : g.joinMode === 'open' ? 'Rejoindre' : 'Postuler'}
          </button>
        )}
        {(join.error || cancel.error) && (
          <span className="text-sm text-red-600">{errorText(join.error ?? cancel.error)}</span>
        )}
      </div>
    </li>
  );
}

function CreateGuild({
  ctx,
  currency,
  blocked,
}: {
  ctx: GameContext;
  currency: number;
  blocked: boolean;
}) {
  const cost = ctx.balance.guilds.creationCost;
  const [form, setForm] = useState<CreateGuildInput>({
    name: '',
    description: '',
    joinMode: 'open',
  });
  const create = useGuildAction((input: CreateGuildInput) =>
    api<GuildStateResponse>('/api/guilds', { method: 'POST', json: input }),
  );
  const tooPoor = currency < cost;
  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">Fonder une guilde</h2>
      <p className="text-sm text-slate-500">
        Prix : {formatMoney(cost)} (tu as {formatMoney(currency)}). Tu en deviens le chef.
      </p>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate(form);
        }}
      >
        <input
          className="input"
          placeholder="Nom de la guilde"
          value={form.name}
          maxLength={GUILD_NAME_MAX}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <textarea
          className="input"
          rows={2}
          placeholder="Description (facultative)"
          value={form.description}
          maxLength={GUILD_DESCRIPTION_MAX}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <JoinModeSelect
          value={form.joinMode}
          onChange={(joinMode) => setForm({ ...form, joinMode })}
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="btn-primary"
            type="submit"
            disabled={create.isPending || tooPoor || blocked || form.name.trim().length < 3}
          >
            Fonder la guilde ({formatMoney(cost)})
          </button>
          {create.error && <span className="text-sm text-red-600">{errorText(create.error)}</span>}
        </div>
      </form>
    </section>
  );
}

function JoinModeSelect({
  value,
  onChange,
  disabled,
}: {
  value: GuildJoinMode;
  onChange: (mode: GuildJoinMode) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm">
      <span>Adhésion :</span>
      <select
        className="input w-auto"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as GuildJoinMode)}
      >
        <option value="open">Ouverte : on rejoint directement</option>
        <option value="request">Sur demande : le chef ou un officier accepte</option>
      </select>
    </label>
  );
}

// --- Dans une guilde ------------------------------------------------------------------------------

const VIEWS = [
  { id: 'guild', label: 'Guilde' },
  { id: 'quests', label: 'Quêtes de guilde' },
] as const;
type View = (typeof VIEWS)[number]['id'];

function GuildView({ ctx, guild }: { ctx: GameContext; guild: GuildDto }) {
  const [view, setView] = useState<View>('guild');
  const done = guild.quests.filter((q) => q.completedAt).length;
  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-xl font-bold">{guild.name}</h2>
        {guild.description && (
          <p className="text-sm whitespace-pre-line text-slate-500">{guild.description}</p>
        )}
      </header>
      <nav className="flex gap-1">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              view === v.id
                ? 'bg-brand-500 text-white'
                : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {v.label}
            {v.id === 'quests' && guild.quests.length > 0 && (
              <span className="ml-1.5 text-xs opacity-80">
                {done}/{guild.quests.length}
              </span>
            )}
          </button>
        ))}
      </nav>
      {view === 'guild' ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <GuildChat moderator={guild.myRole !== 'member'} />
          <div className="space-y-4">
            <MemberList guild={guild} />
            {guild.requests.length > 0 && <JoinRequests guild={guild} />}
            {guild.myRole === 'leader' && <GuildSettings guild={guild} />}
            <LeaveGuild guild={guild} />
          </div>
        </div>
      ) : (
        <GuildQuests ctx={ctx} guild={guild} />
      )}
    </div>
  );
}

function MemberList({ guild }: { guild: GuildDto }) {
  return (
    <section className="card space-y-2 p-4">
      <h3 className="font-semibold">
        Membres ({guild.members.length}/{guild.maxMembers})
      </h3>
      <ul className="divide-y divide-slate-200 dark:divide-slate-800">
        {guild.members.map((m) => (
          <MemberRow key={m.trainerName} member={m} myRole={guild.myRole} />
        ))}
      </ul>
      <p className="text-xs text-slate-500">Avancée apportée aux quêtes de la semaine à droite.</p>
    </section>
  );
}

function MemberRow({ member: m, myRole }: { member: GuildMemberDto; myRole: GuildRole }) {
  const [confirm, setConfirm] = useState<'kick' | 'leader' | null>(null);
  const name = encodeURIComponent(m.trainerName);
  const kick = useGuildAction(() => api(`/api/guild/members/${name}/kick`, { method: 'POST' }));
  const role = useGuildAction((r: GuildRole) =>
    api(`/api/guild/members/${name}/role`, { method: 'POST', json: { role: r } }),
  );
  const canKick = !m.isMe && (myRole === 'leader' || (myRole === 'officer' && m.role === 'member'));
  const canPromote = !m.isMe && myRole === 'leader';
  const pending = kick.isPending || role.isPending;
  return (
    <li className="space-y-1 py-2 text-sm">
      <div className="flex items-center gap-2">
        <a
          href={m.isMe ? '#trainer' : trainerLink(m.trainerName)}
          className="truncate font-medium hover:underline"
        >
          {m.trainerName}
        </a>
        {m.role !== 'member' && (
          <span className="rounded-full bg-brand-500/10 px-2 text-xs text-brand-600 dark:text-brand-500">
            {ROLE_LABELS[m.role]}
          </span>
        )}
        <span
          className="ml-auto font-mono text-xs text-slate-500"
          title="Avancée apportée cette semaine"
        >
          {m.weekContribution.toLocaleString('fr-FR')}
        </span>
      </div>
      {(canKick || canPromote) && (
        <div className="flex flex-wrap gap-1">
          {confirm ? (
            <>
              <button
                className={confirm === 'kick' ? 'btn-danger' : 'btn-primary'}
                disabled={pending}
                onClick={() =>
                  confirm === 'kick' ? kick.mutate(undefined) : role.mutate('leader')
                }
              >
                {confirm === 'kick'
                  ? `Exclure ${m.trainerName}`
                  : `Faire de ${m.trainerName} le chef`}
              </button>
              <button className="btn-ghost" onClick={() => setConfirm(null)}>
                Non
              </button>
            </>
          ) : (
            <>
              {canPromote && m.role === 'member' && (
                <button
                  className="btn-ghost px-2 py-1 text-xs"
                  disabled={pending}
                  onClick={() => role.mutate('officer')}
                >
                  Nommer officier
                </button>
              )}
              {canPromote && m.role === 'officer' && (
                <button
                  className="btn-ghost px-2 py-1 text-xs"
                  disabled={pending}
                  onClick={() => role.mutate('member')}
                >
                  Rétrograder
                </button>
              )}
              {canPromote && (
                <button
                  className="btn-ghost px-2 py-1 text-xs"
                  disabled={pending}
                  onClick={() => setConfirm('leader')}
                >
                  Passer chef
                </button>
              )}
              {canKick && (
                <button
                  className="btn-ghost px-2 py-1 text-xs"
                  disabled={pending}
                  onClick={() => setConfirm('kick')}
                >
                  Exclure
                </button>
              )}
            </>
          )}
        </div>
      )}
      {(kick.error || role.error) && (
        <p className="text-xs text-red-600">{errorText(kick.error ?? role.error)}</p>
      )}
    </li>
  );
}

function JoinRequests({ guild }: { guild: GuildDto }) {
  const answer = useGuildAction(({ name, accept }: { name: string; accept: boolean }) =>
    api(`/api/guild/requests/${encodeURIComponent(name)}/${accept ? 'accept' : 'decline'}`, {
      method: 'POST',
    }),
  );
  return (
    <section className="card space-y-2 p-4">
      <h3 className="font-semibold">Candidatures ({guild.requests.length})</h3>
      <ul className="space-y-2">
        {guild.requests.map((r) => (
          <li key={r.trainerName} className="flex flex-wrap items-center gap-2 text-sm">
            <a
              href={trainerLink(r.trainerName)}
              className="flex-1 truncate font-medium hover:underline"
            >
              {r.trainerName}
            </a>
            <button
              className="btn-primary px-3 py-1"
              disabled={answer.isPending}
              onClick={() => answer.mutate({ name: r.trainerName, accept: true })}
            >
              Accepter
            </button>
            <button
              className="btn-ghost px-3 py-1"
              disabled={answer.isPending}
              onClick={() => answer.mutate({ name: r.trainerName, accept: false })}
            >
              Refuser
            </button>
          </li>
        ))}
      </ul>
      {answer.error && <p className="text-xs text-red-600">{errorText(answer.error)}</p>}
    </section>
  );
}

function GuildSettings({ guild }: { guild: GuildDto }) {
  const [description, setDescription] = useState(guild.description);
  const update = useGuildAction((input: { description?: string; joinMode?: GuildJoinMode }) =>
    api('/api/guild', { method: 'PATCH', json: input }),
  );
  return (
    <section className="card space-y-2 p-4">
      <h3 className="font-semibold">Réglages de la guilde</h3>
      <textarea
        className="input"
        rows={2}
        value={description}
        maxLength={GUILD_DESCRIPTION_MAX}
        placeholder="Description"
        onChange={(e) => setDescription(e.target.value)}
      />
      {description !== guild.description && (
        <button
          className="btn-primary"
          disabled={update.isPending}
          onClick={() => update.mutate({ description })}
        >
          Enregistrer la description
        </button>
      )}
      <JoinModeSelect
        value={guild.joinMode}
        disabled={update.isPending}
        onChange={(joinMode) => update.mutate({ joinMode })}
      />
      {update.error && <p className="text-xs text-red-600">{errorText(update.error)}</p>}
    </section>
  );
}

function LeaveGuild({ guild }: { guild: GuildDto }) {
  const [confirming, setConfirming] = useState(false);
  const leave = useGuildAction(() => api('/api/guild/leave', { method: 'POST' }));
  const alone = guild.members.length === 1;
  return (
    <div className="space-y-1 text-sm">
      {confirming ? (
        <>
          <p className="text-slate-500">
            {alone
              ? 'Tu es le dernier membre : la guilde sera dissoute.'
              : guild.myRole === 'leader'
                ? 'Le rôle de chef passera à l’officier le plus ancien (ou au membre le plus ancien).'
                : 'Tu ne recevras pas les coffres des quêtes terminées après ton départ.'}{' '}
            Tu devras attendre avant de rejoindre une autre guilde.
          </p>
          <div className="flex gap-2">
            <button
              className="btn-danger"
              disabled={leave.isPending}
              onClick={() => leave.mutate(undefined)}
            >
              Quitter la guilde
            </button>
            <button className="btn-ghost" onClick={() => setConfirming(false)}>
              Non
            </button>
          </div>
        </>
      ) : (
        <button className="btn-ghost" onClick={() => setConfirming(true)}>
          Quitter la guilde
        </button>
      )}
      {leave.error && <p className="text-xs text-red-600">{errorText(leave.error)}</p>}
    </div>
  );
}

// --- Discussion -----------------------------------------------------------------------------------

function GuildChat({ moderator }: { moderator: boolean }) {
  const queryClient = useQueryClient();
  const messagesKey = [...keys.guild, 'messages'];
  const messages = useQuery({
    queryKey: messagesKey,
    queryFn: () => api<GuildMessagesResponse>('/api/guild/messages'),
    refetchInterval: CHAT_REFRESH_MS,
  });
  const [body, setBody] = useState('');
  const send = useMutation({
    mutationFn: (text: string) =>
      api('/api/guild/messages', { method: 'POST', json: { body: text } }),
    onSuccess: () => {
      setBody('');
      return queryClient.invalidateQueries({ queryKey: messagesKey });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/guild/messages/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: messagesKey }),
  });
  const list = useRef<HTMLDivElement>(null);
  const lastId = messages.data?.messages.at(-1)?.id;
  // Nouveau message : la discussion défile jusqu'en bas.
  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [lastId]);

  return (
    <section className="card flex h-[32rem] flex-col p-4">
      <h3 className="mb-2 font-semibold">Discussion</h3>
      <div ref={list} className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {messages.data?.messages.length === 0 && (
          <p className="text-sm text-slate-500">Aucun message pour l’instant.</p>
        )}
        {messages.data?.messages.map((m) =>
          m.trainerName === null ? (
            <p key={m.id} className="text-center text-xs text-slate-500 italic">
              {m.body} · {formatTime(m.createdAt)}
            </p>
          ) : (
            <div key={m.id} className={`group flex ${m.mine ? 'justify-end' : ''}`}>
              <div
                className={`max-w-[85%] rounded-xl px-3 py-1.5 text-sm ${
                  m.mine ? 'bg-brand-500 text-white' : 'bg-slate-100 dark:bg-slate-800'
                }`}
              >
                <p className={`text-xs ${m.mine ? 'text-white/80' : 'text-slate-500'}`}>
                  {m.mine ? 'Moi' : m.trainerName} · {formatTime(m.createdAt)}
                  {(m.mine || moderator) && (
                    <button
                      className="ml-2 hidden underline group-hover:inline"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(m.id)}
                    >
                      Supprimer
                    </button>
                  )}
                </p>
                <p className="break-words whitespace-pre-line">{m.body}</p>
              </div>
            </div>
          ),
        )}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) send.mutate(body.trim());
        }}
      >
        <input
          className="input"
          placeholder="Écrire un message…"
          value={body}
          maxLength={GUILD_MESSAGE_MAX}
          onChange={(e) => setBody(e.target.value)}
        />
        <button className="btn-primary" type="submit" disabled={send.isPending || !body.trim()}>
          Envoyer
        </button>
      </form>
      {(send.error || remove.error) && (
        <p className="mt-1 text-xs text-red-600">{errorText(send.error ?? remove.error)}</p>
      )}
    </section>
  );
}

/** Heure du message, précédée du jour s'il n'est pas d'aujourd'hui. */
function formatTime(iso: string): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return date.toDateString() === new Date().toDateString()
    ? time
    : `${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} ${time}`;
}

// --- Quêtes de guilde -----------------------------------------------------------------------------

function GuildQuests({ ctx, guild }: { ctx: GameContext; guild: GuildDto }) {
  const now = useNow(30_000);
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Les quêtes avancent avec les actions de tous les membres (expéditions, combats, donjons,
        éclosions). Chaque quête terminée donne un coffre à ceux qui l’ont fait avancer : ouvre-le
        depuis ton sac. Nouvelles quêtes lundi à minuit, dans{' '}
        <span className="font-medium">{formatRemaining(Date.parse(guild.week.endsAt) - now)}</span>{' '}
        : les quêtes non terminées sont alors perdues.
      </p>
      {guild.quests.length === 0 && (
        <p className="text-sm text-slate-500">Aucune quête de guilde cette semaine.</p>
      )}
      <ul className="grid gap-3 sm:grid-cols-2">
        {guild.quests.map((q) => (
          <li key={q.slot} className={`card space-y-2 p-4 ${q.completedAt ? 'opacity-80' : ''}`}>
            <div className="flex items-start gap-3">
              <ChestLootHover ctx={ctx} rarity={q.rarity}>
                <img
                  src={chestIcon(ctx, q.rarity)}
                  alt=""
                  className="h-10 w-10 [image-rendering:pixelated]"
                />
              </ChestLootHover>
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold">{q.name}</span>
                  <span className={`shrink-0 text-xs font-medium ${RARITY_STYLES[q.rarity]}`}>
                    Coffre {CHEST_RARITY_LABELS[q.rarity]}
                  </span>
                </p>
                {q.description && <p className="text-sm text-slate-500">{q.description}</p>}
              </div>
            </div>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span>{guildObjectiveText(q.objective)}</span>
              <span className="font-mono">
                {q.progress.toLocaleString('fr-FR')} / {q.target.toLocaleString('fr-FR')}
              </span>
            </div>
            <ProgressBar
              value={q.progress / q.target}
              barClassName={q.completedAt ? 'bg-emerald-500' : 'bg-brand-500'}
            />
            <p className="text-xs text-slate-500">
              {q.completedAt
                ? `Terminée ! ${q.myContribution > 0 ? 'Ton coffre t’attend dans le sac.' : 'Tu n’y as pas participé : pas de coffre.'}`
                : q.myContribution > 0
                  ? `Ta contribution : ${q.myContribution.toLocaleString('fr-FR')} · ${q.contributors} participant(s)`
                  : `Fais-la avancer pour recevoir le coffre · ${q.contributors} participant(s)`}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
