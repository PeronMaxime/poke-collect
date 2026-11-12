/**
 * Assistant d'un poste (pension, couveuse, Musée, champ, Centre) : son talent, son effet sur ce
 * poste, et le choix d'un autre assistant.
 */
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
import type { AssignAssistantInput, PokemonDto } from '@poke/shared';
import { Modal, PokemonSprite, useNow } from '../../components/ui';
import {
  assignAssistant,
  isUsable,
  keys,
  refresh,
  removeAssistant,
  useAssistants,
  usePokemon,
} from '../../lib/queries';
import { abilityLabel, errorText, speciesName, typeLabel } from '../../lib/labels';

/** Données du bâtiment où travaille l'assistant d'un poste. */
const POST_KEYS: Record<AssistantPost, readonly (readonly string[])[]> = {
  daycare: [keys.daycare],
  incubator: [keys.daycare],
  museum: [keys.museum],
  center: [],
  farm: [keys.farm],
  harvest: [keys.farm],
};

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

/** Assistant en poste et actions (nommer, libérer) d'un poste. */
function useAssistantSlot(post: AssistantPost, slot: number) {
  const queryClient = useQueryClient();
  const assistants = useAssistants();
  const pokemon = usePokemon();
  const [picking, setPicking] = useState(false);
  const current = assistants.data?.find((a) => a.post === post && a.slot === slot);
  const p = current ? pokemon.data?.find((x) => x.id === current.pokemonId) : undefined;

  // L'assistant occupe son Pokémon et change le rythme du bâtiment où il travaille.
  const refreshPost = () => refresh(queryClient, keys.assistants, keys.pokemon, ...POST_KEYS[post]);
  const assign = useMutation({
    mutationFn: (input: AssignAssistantInput) => assignAssistant(post, slot, input),
    onSuccess: () => {
      setPicking(false);
      return refreshPost();
    },
  });
  const release = useMutation({
    mutationFn: () => removeAssistant(post, slot),
    onSuccess: () => {
      setPicking(false);
      return refreshPost();
    },
  });
  return { info: ASSISTANT_POST_INFO[post], p, picking, setPicking, assign, release };
}

/**
 * Assistant d'un bâtiment (une pension, une couveuse, une place du Musée, un Centre Pokémon, un
 * champ) : son talent agit sur ce qu'il accueille tant qu'il y reste (il est alors occupé).
 * Affiché au pied de la tuile d'une pension ou d'une place, ou en tuile à part au-dessus des
 * places qu'il couvre.
 */
export function AssistantCard({
  ctx,
  post,
  slot,
  frame = 'footer',
  label = 'Assistant',
  closed = false,
}: {
  ctx: GameContext;
  post: AssistantPost;
  /** Poste : pension, couveuse, place du Musée, Centre ou champ. */
  slot: number;
  /** Tuile à part (couveuse, Centre), pied de tuile séparé d'un trait, ou rien (champ). */
  frame?: 'tile' | 'footer' | 'none';
  /** Rôle affiché au-dessus du nom (« Arrosage » pour la ferme…). */
  label?: string;
  /** Poste au-delà de ceux ouverts (réglage baissé) : l'assistant peut seulement être libéré. */
  closed?: boolean;
}) {
  const { info, p, picking, setPicking, assign, release } = useAssistantSlot(post, slot);

  return (
    <div
      className={`text-left text-xs ${
        frame === 'tile'
          ? 'tile max-w-xl p-2.5'
          : frame === 'footer'
            ? 'mt-auto border-t-2 border-dashed border-well-line pt-2.5'
            : ''
      }`}
    >
      <div className="flex items-center gap-2.5">
        {p ? (
          <span className="sprite-well size-11 shrink-0 overflow-hidden">
            <PokemonSprite speciesId={p.speciesId} formId={p.formId} shiny={p.isShiny} size={40} />
          </span>
        ) : (
          <span
            className="grid size-11 shrink-0 place-items-center rounded-md border-2 border-dashed border-slate-400 font-pixel text-[10px] text-slate-400 dark:border-slate-600"
            aria-hidden
          >
            ?
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="pixel-label text-[8px] text-slate-500 uppercase dark:text-slate-400">
            {label}
          </p>
          {p ? (
            <p className="truncate text-sm font-medium">
              {speciesName(ctx, p.speciesId, p.formId)}{' '}
              <span className="text-xs font-normal text-slate-500">N.{p.level}</span>
            </p>
          ) : (
            <p className="text-sm text-slate-500" title={info.help}>
              {closed ? 'Poste fermé' : 'Aucun'}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          {!closed && (
            <button
              className="btn-ghost px-2.5 py-1.5"
              onClick={() => setPicking(true)}
              title={info.help}
            >
              {p ? 'Changer' : 'Choisir'}
            </button>
          )}
          {p && (
            <button
              className="btn-ghost px-2 py-1.5"
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
      {p && (
        <div className="mt-1.5">
          <AbilityLine ctx={ctx} p={p} activities={[info.activity]} assistant />
        </div>
      )}
      {(assign.error || release.error) && (
        <p className="mt-1 text-red-600">{errorText(assign.error ?? release.error)}</p>
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

/**
 * Assistant d'un poste en version réduite (colonne des bâtiments) : un cercle avec son sprite, ou
 * « ? » s'il n'y en a pas. Un clic ouvre le choix de l'assistant, d'où on peut aussi le libérer.
 */
export function AssistantCircle({
  ctx,
  post,
  slot,
  closed = false,
}: {
  ctx: GameContext;
  post: AssistantPost;
  slot: number;
  /** Poste au-delà de ceux ouverts : l'assistant peut seulement être libéré. */
  closed?: boolean;
}) {
  const { info, p, picking, setPicking, assign, release } = useAssistantSlot(post, slot);
  const name = p ? `${speciesName(ctx, p.speciesId, p.formId)} (niv. ${p.level})` : 'aucun';
  const label = closed && !p ? 'Place fermée' : `Assistant : ${name}`;
  return (
    <>
      <button
        type="button"
        disabled={closed && !p}
        onClick={() => setPicking(true)}
        title={closed && !p ? label : `${label}. ${p ? 'Changer' : 'Choisir'} l’assistant.`}
        aria-label={label}
        className={`grid size-10 shrink-0 place-items-center overflow-hidden rounded-full border-2 transition enabled:hover:border-brand-500 enabled:hover:text-brand-500 disabled:cursor-default disabled:opacity-50 ${
          p
            ? 'border-well-line bg-well'
            : 'border-dashed border-slate-300 text-slate-400 dark:border-slate-700'
        }`}
      >
        {p ? (
          <PokemonSprite speciesId={p.speciesId} formId={p.formId} shiny={p.isShiny} size={40} />
        ) : (
          '?'
        )}
      </button>
      {picking && (
        <AssistantPicker
          ctx={ctx}
          post={post}
          title={info.label}
          help={info.help}
          pending={assign.isPending || release.isPending}
          current={p}
          closed={closed}
          onRelease={() => release.mutate()}
          error={assign.error ?? release.error}
          onPick={(pokemonId) => assign.mutate({ pokemonId })}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  );
}

function AssistantPicker({
  ctx,
  post,
  title,
  help,
  pending,
  current,
  closed = false,
  onRelease,
  error,
  onPick,
  onClose,
}: {
  ctx: GameContext;
  post: AssistantPost;
  title: string;
  help: string;
  pending: boolean;
  /** Assistant en poste, affiché avec un bouton pour le libérer (avec `onRelease`). */
  current?: PokemonDto;
  /** Poste fermé : on peut seulement libérer l'assistant. */
  closed?: boolean;
  onRelease?: () => void;
  error?: unknown;
  onPick: (pokemonId: string) => void;
  onClose: () => void;
}) {
  const pokemon = usePokemon();
  const now = useNow(10_000);
  const [search, setSearch] = useState('');
  const { activity, requiredType, requiredParam } = ASSISTANT_POST_INFO[post];
  // Ailleurs que chez l'arroseur de la ferme (le type suffit), canAssist ne garde que les
  // talents utiles ici ; à la ferme, on peut les filtrer.
  const [onlyUseful, setOnlyUseful] = useState(false);
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
        {help}
        {!requiredType &&
          !requiredParam &&
          ' Seuls les Pokémon dont le talent agit ici sont proposés.'}{' '}
        Le Pokémon choisi reste occupé tant qu’il est assistant.
      </p>
      {current && onRelease && (
        <div className="tile mt-3 flex items-center gap-2.5 p-2.5">
          <span className="sprite-well size-11 shrink-0 overflow-hidden">
            <PokemonSprite
              speciesId={current.speciesId}
              formId={current.formId}
              shiny={current.isShiny}
              size={40}
            />
          </span>
          <span className="min-w-0 flex-1">
            <span className="pixel-label block text-[8px] text-slate-500 uppercase dark:text-slate-400">
              Assistant actuel
            </span>
            <span className="text-sm font-medium">
              {speciesName(ctx, current.speciesId, current.formId)}{' '}
              <span className="text-xs text-slate-500">N.{current.level}</span>
            </span>
            <AbilityLine ctx={ctx} p={current} activities={[activity]} assistant />
          </span>
          <button className="btn-ghost shrink-0" disabled={pending} onClick={onRelease}>
            Libérer
          </button>
        </div>
      )}
      {error ? <p className="mt-2 text-sm text-red-600">{errorText(error)}</p> : null}
      {!closed && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input
              className="input max-w-64"
              placeholder="Pokémon ou talent…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {/* Ailleurs, seuls des talents utiles sont proposés. */}
            {requiredType && !requiredParam && (
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
          <ul className="mt-3 grid max-h-[60vh] grid-cols-1 gap-1.5 overflow-y-auto p-0.5 sm:grid-cols-2">
            {candidates.map(({ p }) => (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onPick(p.id)}
                  className="flex w-full items-center gap-2.5 rounded-md border-2 border-well-line bg-tile p-1.5 text-left transition enabled:hover:border-brand-500 enabled:hover:bg-selected disabled:opacity-60"
                >
                  <span className="sprite-well size-11 shrink-0 overflow-hidden">
                    <PokemonSprite
                      speciesId={p.speciesId}
                      formId={p.formId}
                      shiny={p.isShiny}
                      size={40}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-sm font-medium">
                      {speciesName(ctx, p.speciesId, p.formId)}{' '}
                      <span className="text-xs text-slate-500">N.{p.level}</span>
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
                {!requiredType || onlyUseful || requiredParam ? ' dont le talent agit ici' : ''}.
              </li>
            )}
          </ul>
        </>
      )}
    </Modal>
  );
}
