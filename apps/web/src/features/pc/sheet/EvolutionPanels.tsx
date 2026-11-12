/**
 * Évolution et Méga-Évolution, sur la fiche d'un Pokémon du PC.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { megaOptions } from '@poke/game-core';
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
 * Évolution, Méga-Évolution et retour à la forme normale du Pokémon `p`. Le Pokémon est mis à jour
 * sur place ; Pokédex, quêtes… et sac ne sont rechargés que si la réponse le demande. `onEvolved`
 * reçoit le résultat à révéler (`mega` : par Méga-Gemme).
 */
export function useEvolutionActions(
  p: PokemonDto,
  onEvolved: (data: EvolveResponse, mega: boolean) => void,
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
    // La Méga-Gemme revient dans le sac.
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
 * Méga-Évolution : les formes Méga de l'espèce et leur Méga-Gemme. Avec la gemme dans le sac, le
 * Pokémon (forme normale) Méga-Évolue en la tenant ; la lui retirer le rend normal et rend la gemme.
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
  const owned = useItemQuantities();
  const dex = useDexIndex();
  const options = megaOptions(ctx, p.speciesId);
  if (!p.megaStone && (p.formId !== null || options.length === 0)) return null;
  const busyTitle = p.busy ? 'Le Pokémon doit être disponible (ni en activité)' : undefined;
  // Donjon qui laisse la gemme (indice pour l'obtenir).
  const dungeonOf = (itemId: string) => ctx.dungeons.find((d) => d.gemItemId === itemId);

  return (
    <SheetSection title="Méga-Évolution">
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
              En la retirant, il retrouve sa forme normale et la gemme revient dans ton sac.
            </p>
          </div>
          <button
            className="btn-ghost shrink-0 max-sm:w-full"
            disabled={pending || p.busy}
            title={busyTitle}
            onClick={onRevert}
          >
            Retirer la Méga-Gemme
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {options.flatMap(({ form, itemIds }) =>
            itemIds.map((itemId) => {
              const dexForm = dex.byForm.get(form.id);
              const caught = !!dexForm && (!p.isShiny || dexForm.caughtShiny);
              const quantity = owned(itemId);
              const dungeon = dungeonOf(itemId);
              return (
                <li
                  key={`${form.id}:${itemId}`}
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
                        <span className="text-slate-400">
                          — à obtenir{dungeon && ` au donjon ${dungeon.name}`}
                        </span>
                      )}
                    </p>
                  </div>
                  {quantity > 0 && (
                    <button
                      className="btn-primary ml-auto shrink-0 max-sm:w-full"
                      disabled={pending || p.busy}
                      title={busyTitle}
                      onClick={() => onMega(itemId)}
                    >
                      Méga-Évoluer
                    </button>
                  )}
                </li>
              );
            }),
          )}
        </ul>
      )}
      {!!error && <p className="mt-2 text-xs text-red-600">{errorText(error)}</p>}
    </SheetSection>
  );
}
