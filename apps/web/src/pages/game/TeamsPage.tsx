import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { pokemonPower } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import { MAX_TEAMS, TEAM_MAX_SIZE, TEAM_NAME_MAX } from '@poke/shared';
import type { PokemonDto, PokemonTeamDto, TeamInput } from '@poke/shared';
import { PokemonSprite, ShinyStar, useNow } from '../../components/ui';
import { api } from '../../lib/api';
import { keys, usePokemon, useTeams } from '../../lib/game';
import { errorText } from '../../lib/labels';
import { PcFilterBar, PcPokemonCard, usePcBrowser } from './PcBrowser';
import { MEGA_LOCKED_TITLE, megaLocked } from './TeamPicker';

/** Équipe en cours de construction : `id` null = nouvelle équipe. */
interface Draft {
  id: string | null;
  name: string;
  pokemonIds: string[];
}

/**
 * Équipes enregistrées : construites ici depuis le PC (mêmes filtres), puis choisies d'un clic au
 * départ d'une expédition, d'un combat ou d'un donjon. Un Pokémon n'est que dans une équipe.
 */
export function TeamsPage({ ctx }: { ctx: GameContext }) {
  const queryClient = useQueryClient();
  const pokemon = usePokemon();
  const teams = useTeams();
  const now = useNow();
  const browser = usePcBrowser(ctx, pokemon.data ?? []);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const saved = teams.data ?? [];
  const byId = new Map((pokemon.data ?? []).map((p) => [p.id, p]));
  // Équipe de chaque Pokémon déjà rangé ailleurs que dans l'équipe en cours de modification.
  const teamOf = new Map<string, PokemonTeamDto>();
  for (const t of saved) {
    if (t.id === draft?.id) continue;
    for (const id of t.pokemonIds) teamOf.set(id, t);
  }
  const members = draft?.pokemonIds.flatMap((id) => byId.get(id) ?? []) ?? [];
  const powerOf = (list: readonly PokemonDto[]) =>
    list.reduce((sum, p) => sum + pokemonPower(ctx.species(p.speciesId, p.formId)!, p), 0);

  const save = useMutation({
    mutationFn: ({ id, ...input }: Draft) =>
      api<PokemonTeamDto>(id ? `/api/teams/${id}` : '/api/teams', {
        method: id ? 'PUT' : 'POST',
        json: input satisfies TeamInput,
      }),
    onSuccess: () => {
      setDraft(null);
      return queryClient.invalidateQueries({ queryKey: keys.teams });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/teams/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setDraft(null);
      return queryClient.invalidateQueries({ queryKey: keys.teams });
    },
  });

  function open(next: Draft | null) {
    setDraft(next);
    setConfirmDelete(false);
    save.reset();
    remove.reset();
  }

  function newDraft(pokemonIds: string[] = []): Draft {
    const names = new Set(saved.map((t) => t.name));
    let n = saved.length + 1;
    while (names.has(`Équipe ${n}`)) n++;
    return { id: null, name: `Équipe ${n}`, pokemonIds };
  }

  /** Clic sur un Pokémon du PC : l'ajoute à l'équipe en cours (ou en commence une), ou l'en retire. */
  function toggle(p: PokemonDto) {
    if (teamOf.has(p.id) || megaLocked(p, members)) return;
    if (!draft) {
      if (saved.length < MAX_TEAMS) open(newDraft([p.id]));
      return;
    }
    const ids = draft.pokemonIds;
    setDraft({
      ...draft,
      pokemonIds: ids.includes(p.id)
        ? ids.filter((id) => id !== p.id)
        : ids.length < TEAM_MAX_SIZE
          ? [...ids, p.id]
          : ids,
    });
  }

  function move(index: number, delta: number) {
    if (!draft) return;
    const ids = [...draft.pokemonIds];
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    setDraft({ ...draft, pokemonIds: ids });
  }

  const error = save.error ?? remove.error;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">Équipes enregistrées</h2>
          <p className="text-sm text-slate-500">
            Choisis une équipe d'un clic au départ d'une expédition, d'un combat ou d'un donjon. Un
            Pokémon ne fait partie que d'une équipe à la fois.
          </p>
        </div>
        <button
          className="btn-primary"
          disabled={saved.length >= MAX_TEAMS}
          title={saved.length >= MAX_TEAMS ? `Au plus ${MAX_TEAMS} équipes` : undefined}
          onClick={() => open(newDraft())}
        >
          Nouvelle équipe
        </button>
      </div>

      {saved.length > 0 && (
        <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {saved.map((t) => {
            const list = t.pokemonIds.flatMap((id) => byId.get(id) ?? []);
            const editing = draft?.id === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => open(editing ? null : { ...t, pokemonIds: [...t.pokemonIds] })}
                className={`card p-3 text-left transition hover:-translate-y-0.5 ${
                  editing ? 'ring-2 ring-brand-500' : ''
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-semibold">{t.name}</span>
                  <span className="shrink-0 text-xs text-slate-500">
                    {list.length} / {TEAM_MAX_SIZE} · PE {powerOf(list)}
                  </span>
                </div>
                <div className="mt-1 grid grid-cols-6 gap-1">
                  {Array.from({ length: TEAM_MAX_SIZE }, (_, i) => {
                    const p = list[i];
                    return p ? (
                      <PokemonSprite
                        key={p.id}
                        speciesId={p.speciesId}
                        formId={p.formId}
                        shiny={p.isShiny}
                        size={44}
                      />
                    ) : (
                      <span
                        key={i}
                        className="aspect-square rounded-lg border border-dashed border-slate-300 dark:border-slate-700"
                      />
                    );
                  })}
                </div>
              </button>
            );
          })}
        </div>
      )}
      {saved.length === 0 && !draft && !teams.isPending && (
        <p className="mb-4 text-sm text-slate-500">
          Aucune équipe enregistrée : crée-en une, ou touche un Pokémon du PC pour commencer.
        </p>
      )}

      {draft && (
        <div className="card sticky top-2 z-10 mb-4 p-3 shadow-lg">
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="input max-w-56"
              value={draft.name}
              maxLength={TEAM_NAME_MAX}
              placeholder="Nom de l'équipe"
              aria-label="Nom de l'équipe"
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <span className="text-sm text-slate-500">
              {members.length} / {TEAM_MAX_SIZE} · PE {powerOf(members)}
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              {draft.id &&
                (confirmDelete ? (
                  <>
                    <button
                      className="btn-danger"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(draft.id!)}
                    >
                      Confirmer la suppression
                    </button>
                    <button className="btn-ghost" onClick={() => setConfirmDelete(false)}>
                      Garder
                    </button>
                  </>
                ) : (
                  <button className="btn-ghost text-red-600" onClick={() => setConfirmDelete(true)}>
                    Supprimer
                  </button>
                ))}
              <button className="btn-ghost" onClick={() => open(null)}>
                Annuler
              </button>
              <button
                className="btn-primary"
                disabled={!draft.name.trim() || save.isPending}
                onClick={() => save.mutate({ ...draft, name: draft.name.trim() })}
              >
                Enregistrer
              </button>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {Array.from({ length: TEAM_MAX_SIZE }, (_, i) => {
              const p = members[i];
              if (!p)
                return (
                  <div
                    key={i}
                    className="flex min-h-24 items-center justify-center rounded-xl border border-dashed border-slate-300 p-1 text-center text-xs text-slate-400 dark:border-slate-700"
                  >
                    {i === members.length ? 'Touche un Pokémon du PC' : ''}
                  </div>
                );
              const species = ctx.species(p.speciesId, p.formId);
              return (
                <div
                  key={p.id}
                  className="relative flex flex-col items-center rounded-xl border border-brand-500 bg-brand-500/10 p-1 text-xs"
                >
                  <span className="absolute top-0.5 left-1.5 text-[10px] font-semibold text-slate-500">
                    {i + 1}
                  </span>
                  <button
                    type="button"
                    className="absolute top-0 right-1 text-slate-400 hover:text-red-600"
                    onClick={() => toggle(p)}
                    aria-label={`Retirer ${species?.nameFr ?? 'ce Pokémon'}`}
                    title="Retirer de l'équipe"
                  >
                    ✕
                  </button>
                  <PokemonSprite
                    speciesId={p.speciesId}
                    formId={p.formId}
                    shiny={p.isShiny}
                    size={48}
                  />
                  <span className="max-w-full truncate">
                    {species?.nameFr} {p.isShiny && <ShinyStar />}
                  </span>
                  <span className="text-slate-500">N.{p.level}</span>
                  <span className="flex gap-1">
                    <button
                      type="button"
                      className="px-1 text-slate-400 hover:text-slate-900 disabled:opacity-30 dark:hover:text-slate-100"
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                      aria-label="Avancer"
                      title="Avancer dans l'ordre de passage"
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      className="px-1 text-slate-400 hover:text-slate-900 disabled:opacity-30 dark:hover:text-slate-100"
                      disabled={i === members.length - 1}
                      onClick={() => move(i, 1)}
                      aria-label="Reculer"
                      title="Reculer dans l'ordre de passage"
                    >
                      ›
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{errorText(error)}</p>}
        </div>
      )}

      <h3 className="mb-2 font-semibold">PC</h3>
      <PcFilterBar ctx={ctx} browser={browser} />
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {browser.filtered.map((entry) => {
          const { p } = entry;
          const index = draft?.pokemonIds.indexOf(p.id) ?? -1;
          const other = teamOf.get(p.id);
          const locked = megaLocked(p, members);
          return (
            <PcPokemonCard
              key={p.id}
              entry={entry}
              tags={browser.tagFilter.tags}
              now={now}
              onSelect={() => toggle(p)}
              title={
                other
                  ? `Déjà dans l'équipe « ${other.name} »`
                  : locked
                    ? MEGA_LOCKED_TITLE
                    : undefined
              }
              topLeft={
                index >= 0 && (
                  <span className="absolute top-1.5 left-2 rounded-full bg-brand-500 px-1.5 text-[10px] font-bold text-white">
                    {index + 1}
                  </span>
                )
              }
              badges={
                other && (
                  <span className="max-w-20 truncate rounded bg-violet-100 px-1 text-[10px] text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                    {other.name}
                  </span>
                )
              }
              className={`${index >= 0 ? 'ring-2 ring-brand-500' : ''} ${
                other || locked ? 'cursor-not-allowed opacity-40' : ''
              }`}
            />
          );
        })}
      </div>
      {browser.filtered.length === 0 && !pokemon.isPending && (
        <p className="text-sm text-slate-500">Aucun Pokémon ne correspond.</p>
      )}
    </div>
  );
}
