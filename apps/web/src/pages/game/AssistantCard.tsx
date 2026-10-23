import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ASSISTANT_POST_INFO,
  abilityEffectSummary,
  effectiveAbility,
  helpsAsAssistant,
} from '@poke/game-core';
import type { AbilityActivity, AssistantPost, GameContext } from '@poke/game-core';
import type { AssignAssistantInput, AssistantDto, PokemonDto } from '@poke/shared';
import { Modal, PokemonSprite, useNow } from '../../components/ui';
import { api } from '../../lib/api';
import { PLAYER_STATE_KEYS, isUsable, useAssistants, usePokemon } from '../../lib/game';
import { abilityLabel, errorText, speciesName } from '../../lib/labels';

/** Le talent du Pokémon a-t-il un effet dans cette activité, en tant qu'assistant ? */
function helpsIn(ctx: GameContext, p: PokemonDto, activity: AbilityActivity): boolean {
  return (ctx.ability(effectiveAbility(ctx, p))?.effects ?? []).some((e) =>
    helpsAsAssistant(e, activity),
  );
}

/**
 * Talent d'un Pokémon et ses effets dans `activities` seulement (ceux de la pension pour un
 * parent ou l'assistant de la Pension…).
 */
export function AbilityLine({
  ctx,
  p,
  activities,
  assistant = false,
}: {
  ctx: GameContext;
  p: PokemonDto;
  activities: readonly AbilityActivity[];
  /** Seulement les effets qui agissent chez un assistant. */
  assistant?: boolean;
}) {
  const ability = effectiveAbility(ctx, p);
  const summary = abilityEffectSummary(ctx, ability, activities, assistant);
  return (
    <span className="block text-xs text-slate-500">
      {abilityLabel(ability)}
      {summary && <span className="text-emerald-700 dark:text-emerald-400"> · {summary}</span>}
    </span>
  );
}

/** Assistant d'un bâtiment : son talent y agit tant qu'il y reste (il est alors occupé). */
export function AssistantCard({ ctx, post }: { ctx: GameContext; post: AssistantPost }) {
  const queryClient = useQueryClient();
  const assistants = useAssistants();
  const pokemon = usePokemon();
  const [picking, setPicking] = useState(false);
  const info = ASSISTANT_POST_INFO[post];
  const current = assistants.data?.find((a) => a.post === post);
  const p = current ? pokemon.data?.find((x) => x.id === current.pokemonId) : undefined;

  const refresh = () =>
    Promise.all(PLAYER_STATE_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  const assign = useMutation({
    mutationFn: (input: AssignAssistantInput) =>
      api<AssistantDto>(`/api/assistants/${post}`, { method: 'PUT', json: input }),
    onSuccess: () => {
      setPicking(false);
      return refresh();
    },
  });
  const release = useMutation({
    mutationFn: () => api(`/api/assistants/${post}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });

  return (
    <div className="card flex flex-wrap items-center gap-3 p-3">
      {p ? (
        <PokemonSprite speciesId={p.speciesId} formId={p.formId} shiny={p.isShiny} size={56} />
      ) : (
        <span className="grid h-14 w-14 place-items-center rounded-full border-2 border-dashed border-slate-300 text-slate-400 dark:border-slate-700">
          ?
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{info.label}</p>
        {p ? (
          <>
            <p className="text-sm">
              {speciesName(ctx, p.speciesId, p.formId)}{' '}
              <span className="text-xs text-slate-500">niv. {p.level}</span>
            </p>
            <AbilityLine ctx={ctx} p={p} activities={[info.activity]} assistant />
          </>
        ) : (
          <p className="text-xs text-slate-500">{info.help}</p>
        )}
        {(assign.error || release.error) && (
          <p className="text-xs text-red-600">{errorText(assign.error ?? release.error)}</p>
        )}
      </div>
      <div className="flex gap-2">
        <button className="btn-ghost py-1 text-sm" onClick={() => setPicking(true)}>
          {p ? 'Changer' : 'Choisir'}
        </button>
        {p && (
          <button
            className="btn-ghost py-1 text-sm"
            disabled={release.isPending}
            onClick={() => release.mutate()}
          >
            Libérer
          </button>
        )}
      </div>
      {picking && (
        <AssistantPicker
          ctx={ctx}
          activity={info.activity}
          title={info.label}
          help={info.help}
          pending={assign.isPending}
          onPick={(pokemonId) => assign.mutate({ pokemonId })}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}

function AssistantPicker({
  ctx,
  activity,
  title,
  help,
  pending,
  onPick,
  onClose,
}: {
  ctx: GameContext;
  activity: AbilityActivity;
  title: string;
  help: string;
  pending: boolean;
  onPick: (pokemonId: string) => void;
  onClose: () => void;
}) {
  const pokemon = usePokemon();
  const now = useNow(10_000);
  const [search, setSearch] = useState('');
  const [onlyUseful, setOnlyUseful] = useState(true);
  const needle = search.trim().toLowerCase();
  const candidates = (pokemon.data ?? [])
    .filter((p) => isUsable(p, now))
    .map((p) => ({ p, useful: helpsIn(ctx, p, activity) }))
    .filter(
      ({ p, useful }) =>
        (!onlyUseful || useful) &&
        (!needle ||
          `${speciesName(ctx, p.speciesId, p.formId)} ${abilityLabel(effectiveAbility(ctx, p))}`
            .toLowerCase()
            .includes(needle)),
    )
    .sort((a, b) => Number(b.useful) - Number(a.useful) || b.p.level - a.p.level)
    .slice(0, 120);

  return (
    <Modal open onClose={onClose} wide>
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="text-sm text-slate-500">
        {help} Le Pokémon choisi reste occupé tant qu’il est assistant.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          className="input max-w-64"
          placeholder="Pokémon ou talent…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyUseful}
            onChange={(e) => setOnlyUseful(e.target.checked)}
          />
          Seulement les talents utiles ici
        </label>
      </div>
      <ul className="mt-3 grid max-h-[60vh] gap-1 overflow-y-auto sm:grid-cols-2">
        {candidates.map(({ p, useful }) => (
          <li key={p.id}>
            <button
              type="button"
              disabled={pending}
              onClick={() => onPick(p.id)}
              className={`flex w-full items-center gap-2 rounded-xl p-2 text-left transition hover:bg-slate-100 dark:hover:bg-slate-800 ${
                useful ? '' : 'opacity-60'
              }`}
            >
              <PokemonSprite
                speciesId={p.speciesId}
                formId={p.formId}
                shiny={p.isShiny}
                size={40}
              />
              <span className="min-w-0 flex-1">
                <span className="text-sm font-medium">
                  {speciesName(ctx, p.speciesId, p.formId)}{' '}
                  <span className="text-xs text-slate-500">niv. {p.level}</span>
                </span>
                <AbilityLine ctx={ctx} p={p} activities={[activity]} assistant />
              </span>
            </button>
          </li>
        ))}
        {candidates.length === 0 && (
          <li className="text-sm text-slate-500">
            Aucun Pokémon disponible
            {onlyUseful ? ' dont le talent agit ici' : ''}.
          </li>
        )}
      </ul>
    </Modal>
  );
}
