import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ASSISTANT_POST_INFO,
  abilityEffectSummary,
  canAssist,
  effectiveAbility,
  helpsAsAssistant,
} from '@poke/game-core';
import type { AbilityActivity, AssistantPost, GameContext } from '@poke/game-core';
import { searchKey } from '@poke/shared';
import type { AssignAssistantInput, AssistantDto, PokemonDto } from '@poke/shared';
import { Modal, PokemonSprite, useNow } from '../../components/ui';
import { api } from '../../lib/api';
import { PLAYER_STATE_KEYS, isUsable, useAssistants, usePokemon } from '../../lib/game';
import { abilityLabel, errorText, speciesName, typeLabel } from '../../lib/labels';

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

/**
 * Assistant d'un bâtiment (une pension, une couveuse, une place du Musée, un Centre Pokémon, la
 * ferme) : son
 * talent agit sur ce qu'il accueille tant qu'il y reste (il est alors occupé). Affiché en bas de la
 * carte d'une pension ou d'une place, ou en carte à part au-dessus des places qu'il couvre.
 */
export function AssistantCard({
  ctx,
  post,
  slot,
  standalone = false,
  closed = false,
}: {
  ctx: GameContext;
  post: AssistantPost;
  /** Poste : pension, couveuse, place du Musée ou Centre. */
  slot: number;
  /** Carte à part (couveuse, Centre) plutôt qu'en bas d'une carte. */
  standalone?: boolean;
  /** Poste au-delà de ceux ouverts (réglage baissé) : l'assistant peut seulement être libéré. */
  closed?: boolean;
}) {
  const queryClient = useQueryClient();
  const assistants = useAssistants();
  const pokemon = usePokemon();
  const [picking, setPicking] = useState(false);
  const info = ASSISTANT_POST_INFO[post];
  const current = assistants.data?.find((a) => a.post === post && a.slot === slot);
  const p = current ? pokemon.data?.find((x) => x.id === current.pokemonId) : undefined;

  const refresh = () =>
    Promise.all(PLAYER_STATE_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  const assign = useMutation({
    mutationFn: (input: AssignAssistantInput) =>
      api<AssistantDto>(`/api/assistants/${post}/${slot}`, { method: 'PUT', json: input }),
    onSuccess: () => {
      setPicking(false);
      return refresh();
    },
  });
  const release = useMutation({
    mutationFn: () => api(`/api/assistants/${post}/${slot}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });

  return (
    <div
      className={`text-left text-xs ${
        standalone ? 'card p-3' : 'mt-auto border-t border-slate-200 pt-2 dark:border-slate-800'
      }`}
    >
      <div className="flex items-center gap-2">
        {p ? (
          <PokemonSprite
            speciesId={p.speciesId}
            formId={p.formId}
            shiny={p.isShiny}
            size={36}
            className="shrink-0"
          />
        ) : (
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-dashed border-slate-300 text-slate-400 dark:border-slate-700"
            aria-hidden
          >
            ?
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold tracking-wide text-slate-400 uppercase">
            Assistant
          </p>
          {p ? (
            <p className="truncate font-medium">
              {speciesName(ctx, p.speciesId, p.formId)}{' '}
              <span className="font-normal text-slate-500">niv. {p.level}</span>
            </p>
          ) : (
            <p className="text-slate-500" title={info.help}>
              Aucun
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          {!closed && (
            <button
              className="btn-ghost px-2 py-0.5 text-xs"
              onClick={() => setPicking(true)}
              title={info.help}
            >
              {p ? 'Changer' : 'Choisir'}
            </button>
          )}
          {p && (
            <button
              className="btn-ghost px-2 py-0.5 text-xs"
              disabled={release.isPending}
              onClick={() => release.mutate()}
              title="Libérer l’assistant"
              aria-label="Libérer l’assistant"
            >
              ✕
            </button>
          )}
        </div>
      </div>
      {p && <AbilityLine ctx={ctx} p={p} activities={[info.activity]} assistant />}
      {(assign.error || release.error) && (
        <p className="text-red-600">{errorText(assign.error ?? release.error)}</p>
      )}
      {picking && (
        <AssistantPicker
          ctx={ctx}
          post={post}
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
  post,
  title,
  help,
  pending,
  onPick,
  onClose,
}: {
  ctx: GameContext;
  post: AssistantPost;
  title: string;
  help: string;
  pending: boolean;
  onPick: (pokemonId: string) => void;
  onClose: () => void;
}) {
  const pokemon = usePokemon();
  const now = useNow(10_000);
  const [search, setSearch] = useState('');
  const { activity, requiredType, requiredParam } = ASSISTANT_POST_INFO[post];
  // Poste à type exigé (ferme) : le type compte avant le talent.
  const [onlyUseful, setOnlyUseful] = useState(!requiredType);
  const needle = searchKey(search.trim());
  const candidates = (pokemon.data ?? [])
    .filter((p) => isUsable(p, now) && canAssist(ctx, post, p))
    .map((p) => ({ p, useful: helpsIn(ctx, p, activity) }))
    .filter(
      ({ p, useful }) =>
        (!onlyUseful || useful) &&
        (!needle ||
          searchKey(
            `${speciesName(ctx, p.speciesId, p.formId)} ${abilityLabel(effectiveAbility(ctx, p))}`,
          ).includes(needle)),
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
        {/* Talent exigé : seuls des talents utiles sont proposés. */}
        {!requiredParam && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={onlyUseful}
              onChange={(e) => setOnlyUseful(e.target.checked)}
            />
            Seulement les talents utiles ici
          </label>
        )}
      </div>
      <ul className="mt-3 grid max-h-[60vh] gap-1 overflow-y-auto sm:grid-cols-2">
        {candidates.map(({ p }) => (
          <li key={p.id}>
            <button
              type="button"
              disabled={pending}
              onClick={() => onPick(p.id)}
              className="flex w-full items-center gap-2 rounded-xl p-2 text-left transition hover:bg-slate-100 dark:hover:bg-slate-800"
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
            {requiredType ? ` de type ${typeLabel(requiredType)}` : ''}
            {onlyUseful || requiredParam ? ' dont le talent agit ici' : ''}.
          </li>
        )}
      </ul>
    </Modal>
  );
}
