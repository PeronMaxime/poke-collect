/**
 * Évolution, Méga-Évolution et objets de forme (Primo-Résurgence…), sur la fiche d'un Pokémon du
 * PC.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { FormKind, PokemonForm } from '@poke/data';
import { formItemOptions, heldItemForm, megaOptions } from '@poke/game-core';
import type { EvolutionCheck, EvolutionOption, GameContext } from '@poke/game-core';
import type { EvolveResponse, MegaEvolveInput, PokemonDto } from '@poke/shared';
import { PokemonSprite, useNow } from '../../../components/ui';
import {
  PROGRESS_KEYS,
  evolvePokemon,
  isUsable,
  keys,
  megaEvolvePokemon,
  patchPokemon,
  refresh,
  revertMegaEvolution,
  useDexIndex,
  useItemQuantities,
} from '../../../lib/queries';
import {
  errorText,
  evolutionMethodText,
  itemIcon,
  itemName,
  requirementText,
  speciesName,
} from '../../../lib/labels';
import { SheetSection } from '../../common/dialogParts';

/**
 * Évolution, forme tenue (Méga-Gemme, objet de forme) et retour à la forme normale du Pokémon `p`.
 * Le Pokémon est mis à jour sur place ; Pokédex, quêtes… et sac ne sont rechargés que si la réponse
 * le demande. `onEvolved` reçoit le résultat à révéler (`held` : par un objet tenu).
 */
export function useEvolutionActions(
  p: PokemonDto,
  onEvolved: (data: EvolveResponse, held: boolean) => void,
) {
  const queryClient = useQueryClient();
  const refreshAfterEvolution = (data: EvolveResponse) => {
    patchPokemon(queryClient, data.pokemon);
    const newEntries = data.newSpeciesIds.length > 0 || data.newFormIds.length > 0;
    return refresh(
      queryClient,
      ...(data.consumedItemId ? [keys.inventory] : []),
      ...(newEntries ? PROGRESS_KEYS : []),
    );
  };
  const megaEvolve = useMutation({
    mutationFn: (input: MegaEvolveInput) => megaEvolvePokemon(p.id, input),
    onSuccess: (data) => {
      onEvolved(data, true);
      return refreshAfterEvolution(data);
    },
  });
  const megaRevert = useMutation({
    mutationFn: () => revertMegaEvolution(p.id),
    // L'objet tenu revient dans le sac.
    onSuccess: (updated) => {
      patchPokemon(queryClient, updated);
      return refresh(queryClient, keys.inventory);
    },
  });
  const evolve = useMutation({
    mutationFn: ({ toSpeciesId, toFormId }: Pick<EvolutionOption, 'toSpeciesId' | 'toFormId'>) =>
      evolvePokemon(p.id, { toSpeciesId, toFormId }),
    onSuccess: (data) => {
      onEvolved(data, false);
      return refreshAfterEvolution(data);
    },
  });
  return { evolve, megaEvolve, megaRevert };
}

/** Évolutions du Pokémon : conditions de chaque méthode, bouton quand l'une est remplie. */
export function EvolutionPanel({
  ctx,
  pokemon: p,
  evolutions,
  pending,
  error,
  onEvolve,
}: {
  ctx: GameContext;
  pokemon: PokemonDto;
  evolutions: EvolutionCheck[];
  pending: boolean;
  error: unknown;
  onEvolve: (option: EvolutionOption) => void;
}) {
  const now = useNow();
  const dex = useDexIndex();
  if (evolutions.length === 0) return null;
  const usable = isUsable(p, now);
  // Même état qu'au Pokédex (shiny pour un Pokémon shiny) : silhouette tant que l'évolution n'a
  // pas été vue, grisée si vue, en couleur une fois capturée.
  const dexState = (speciesId: number, formId: number | null) => {
    const entry = dex.bySpecies.get(speciesId);
    const form = formId != null ? dex.byForm.get(formId) : undefined;
    const seen = (p.isShiny ? entry?.seenShiny : entry?.seen) ?? false;
    const caught =
      formId != null
        ? !!form && (!p.isShiny || form.caughtShiny)
        : ((p.isShiny ? entry?.caughtShiny : entry?.caught) ?? false);
    return { seen: seen || caught, caught };
  };

  return (
    <SheetSection title="Évolution">
      <ul className="space-y-2">
        {evolutions.map(({ option, method, methods }) => {
          const state = dexState(option.toSpeciesId, option.toFormId);
          return (
            <li
              key={`${option.toSpeciesId}:${option.toFormId ?? ''}`}
              className="flex flex-wrap items-center gap-3 rounded-md border-2 border-well-line bg-well p-2"
            >
              <PokemonSprite
                speciesId={option.toSpeciesId}
                formId={option.toFormId}
                shiny={p.isShiny && state.caught}
                size={48}
                silhouette={!state.seen}
                className={state.seen && !state.caught ? 'opacity-50 grayscale' : ''}
              />
              <div className="min-w-0 flex-1 basis-40 text-xs">
                <p className="text-sm font-semibold">
                  {speciesName(ctx, option.toSpeciesId, option.toFormId)}
                </p>
                {methods.length === 0 && (
                  <p className="text-slate-500">Pas encore possible dans le jeu.</p>
                )}
                {methods.map(({ method: m, missing }, i) => (
                  <p
                    key={i}
                    className={`flex flex-wrap items-center gap-1 ${
                      missing.length === 0
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-slate-500'
                    }`}
                  >
                    {m.itemId && (
                      <img
                        src={itemIcon(ctx, m.itemId)}
                        alt=""
                        width={18}
                        height={18}
                        className="[image-rendering:pixelated]"
                      />
                    )}
                    <span>
                      {i > 0 && 'ou '}
                      {missing.length === 0 && '✓ '}
                      {evolutionMethodText(ctx, m)}
                    </span>
                    {missing.length > 0 && (
                      <span className="text-slate-400">
                        — manque : {missing.map((r) => requirementText(ctx, r)).join(', ')}
                      </span>
                    )}
                  </p>
                ))}
              </div>
              {method && (
                <button
                  className="btn-primary ml-auto shrink-0 max-sm:w-full"
                  disabled={pending || !usable}
                  onClick={() => onEvolve(option)}
                >
                  Faire évoluer
                </button>
              )}
              {method && !usable && (
                <p className="w-full text-xs text-slate-500 sm:text-right">
                  Le Pokémon doit être disponible (ni occupé, ni K.O.)
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {!!error && <p className="mt-2 text-xs text-red-600">{errorText(error)}</p>}
    </SheetSection>
  );
}

/**
 * Titre du panneau et libellés selon les formes en jeu : Méga-Évolution (Méga-Gemmes),
 * Primo-Résurgence, ou changement de forme (autres objets de forme).
 */
function heldFormTexts(kinds: ReadonlySet<FormKind>) {
  const only = (kind: FormKind) => kinds.size > 0 && [...kinds].every((k) => k === kind);
  if (only('mega')) return { title: 'Méga-Évolution', remove: 'Retirer la Méga-Gemme' };
  if (only('primal')) return { title: 'Primo-Résurgence', remove: 'Retirer l’objet' };
  return { title: 'Changement de forme', remove: 'Retirer l’objet' };
}

/** Bouton qui fait prendre la forme : verbe de la Méga-Évolution, sinon de la forme. */
const applyLabel = (form: PokemonForm) =>
  form.kind === 'mega'
    ? 'Méga-Évoluer'
    : form.kind === 'primal'
      ? 'Primo-Résurgence'
      : 'Changer de forme';

/**
 * Formes tenues : les formes Méga de l'espèce et leur Méga-Gemme, et celles des objets de forme
 * (Orbe Bleu, Météorites…). Avec l'objet dans le sac, le Pokémon (forme normale) le tient et prend
 * la forme ; le lui retirer le rend normal et rend l'objet.
 */
export function MegaPanel({
  ctx,
  pokemon: p,
  pending,
  error,
  onMega,
  onRevert,
}: {
  ctx: GameContext;
  pokemon: PokemonDto;
  pending: boolean;
  error: unknown;
  onMega: (itemId: string) => void;
  onRevert: () => void;
}) {
  const options = [...megaOptions(ctx, p.speciesId), ...formItemOptions(ctx, p.speciesId)];
  if (!p.megaStone && (p.formId !== null || options.length === 0)) return null;
  const held = p.megaStone ? heldItemForm(ctx, p.megaStone) : undefined;
  const kinds = new Set((held ? [held] : options.map((o) => o.form)).map((f) => f.kind));
  const texts = heldFormTexts(kinds);
  const busyTitle = p.busy ? 'Le Pokémon doit être disponible (ni en activité)' : undefined;

  return (
    <SheetSection title={texts.title}>
      {p.megaStone ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border-2 border-well-line bg-well p-2 text-xs">
          <img
            src={itemIcon(ctx, p.megaStone)}
            alt=""
            width={32}
            height={32}
            className="[image-rendering:pixelated]"
          />
          <div className="min-w-32 flex-1">
            <p className="text-sm font-semibold">Tient : {itemName(ctx, p.megaStone)}</p>
            <p className="text-slate-500">
              En le lui retirant, il retrouve sa forme normale et l’objet revient dans ton sac.
            </p>
          </div>
          <button
            className="btn-ghost shrink-0 max-sm:w-full"
            disabled={pending || p.busy}
            title={busyTitle}
            onClick={onRevert}
          >
            {texts.remove}
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {options.flatMap(({ form, itemIds }) =>
            itemIds.map((itemId) => (
              <HeldFormOption
                key={`${form.id}:${itemId}`}
                ctx={ctx}
                pokemon={p}
                form={form}
                itemId={itemId}
                disabled={pending || p.busy}
                busyTitle={busyTitle}
                onApply={() => onMega(itemId)}
              />
            )),
          )}
        </ul>
      )}
      {!!error && <p className="mt-2 text-xs text-red-600">{errorText(error)}</p>}
    </SheetSection>
  );
}

/** Où obtenir l'objet : le donjon qui laisse la gemme, ou la quête qui le donne. */
function itemSourceText(ctx: GameContext, itemId: string): string {
  const dungeon = ctx.dungeons.find((d) => d.gemItemId === itemId);
  if (dungeon) return ` au donjon ${dungeon.name}`;
  const quest = ctx.quests.find((q) => q.rewards.items.some((i) => i.itemId === itemId));
  return quest ? ` avec la quête « ${quest.name} »` : '';
}

/** Une forme tenue possible : la forme, son objet (et combien on en a), le bouton pour la prendre. */
function HeldFormOption({
  ctx,
  pokemon: p,
  form,
  itemId,
  disabled,
  busyTitle,
  onApply,
}: {
  ctx: GameContext;
  pokemon: PokemonDto;
  form: PokemonForm;
  itemId: string;
  disabled: boolean;
  busyTitle: string | undefined;
  onApply: () => void;
}) {
  const owned = useItemQuantities();
  const dex = useDexIndex();
  const dexForm = dex.byForm.get(form.id);
  const caught = !!dexForm && (!p.isShiny || dexForm.caughtShiny);
  const quantity = owned(itemId);
  return (
    <li
      className={`flex flex-wrap items-center gap-3 rounded-md border-2 border-well-line p-2 ${
        quantity > 0 ? 'bg-well' : 'border-dashed'
      }`}
    >
      <PokemonSprite
        speciesId={p.speciesId}
        formId={form.id}
        shiny={p.isShiny && caught}
        size={48}
        className={caught ? '' : 'opacity-50 grayscale'}
      />
      <div className="min-w-0 flex-1 basis-40 text-xs">
        <p className="text-sm font-semibold">{form.nameFr}</p>
        <p
          className={`flex flex-wrap items-center gap-1 ${
            quantity > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500'
          }`}
        >
          <img
            src={itemIcon(ctx, itemId)}
            alt=""
            width={18}
            height={18}
            className={`[image-rendering:pixelated] ${quantity > 0 ? '' : 'opacity-60 grayscale'}`}
          />
          <span>
            {itemName(ctx, itemId)}
            {quantity > 0 && ` × ${quantity}`}
          </span>
          {quantity === 0 && (
            <span className="text-slate-400">— à obtenir{itemSourceText(ctx, itemId)}</span>
          )}
        </p>
      </div>
      {quantity > 0 && (
        <button
          className="btn-primary ml-auto shrink-0 max-sm:w-full"
          disabled={disabled}
          title={busyTitle}
          onClick={onApply}
        >
          {applyLabel(form)}
        </button>
      )}
    </li>
  );
}
