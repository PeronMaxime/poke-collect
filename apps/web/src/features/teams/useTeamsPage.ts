/**
 * État de l'onglet « Équipe Pkmn » : équipes enregistrées et équipe en cours de construction.
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { memberPower } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import { MAX_TEAMS, TEAM_MAX_SIZE } from '@poke/shared';
import type { PokemonDto, PokemonTeamDto, TeamInput } from '@poke/shared';
import { deleteTeam, keys, saveTeam, usePokemon, useTeams } from '../../lib/queries';
import { usePcBrowser } from '../pc/PcBrowser';
import { megaLocked } from '../common/teamPicker/filters';

/** Équipe en cours de construction : `id` null = nouvelle équipe. */
interface Draft {
  id: string | null;
  name: string;
  pokemonIds: string[];
}

/** Tout ce qu'affichent les pièces de l'onglet des équipes. */
export type TeamsModel = ReturnType<typeof useTeamsPage>;

/**
 * Équipes enregistrées et brouillon en cours (`draft`) : un Pokémon déjà rangé dans une autre
 * équipe ne peut pas être choisi, et un seul Méga-Évolué par équipe.
 */
export function useTeamsPage(ctx: GameContext) {
  const queryClient = useQueryClient();
  const pokemon = usePokemon();
  const teams = useTeams();
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
    list.reduce((sum, p) => sum + memberPower(ctx, p), 0);

  const save = useMutation({
    mutationFn: ({ id, ...input }: Draft) => saveTeam(id, input satisfies TeamInput),
    onSuccess: () => {
      setDraft(null);
      return queryClient.invalidateQueries({ queryKey: keys.teams });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteTeam(id),
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

  return {
    ctx,
    pokemon,
    teams,
    browser,
    draft,
    setDraft,
    confirmDelete,
    setConfirmDelete,
    saved,
    byId,
    teamOf,
    members,
    powerOf,
    save,
    remove,
    open,
    newDraft,
    toggle,
    move,
    error,
  };
}
