import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getForm } from '@poke/data';
import type { GameContext } from '@poke/game-core';
import { searchKey } from '@poke/shared';
import type { FavoritePokemonDto } from '@poke/shared';
import { PokemonSprite, ShinyStar } from '../../components/ui';
import { keys, setFavoritePokemon, usePokedex, usePokedexForms } from '../../lib/queries';
import { errorText, speciesName } from '../../lib/labels';
import { ProgressiveItems } from '../../components/ProgressiveGrid';
import { SELECTED_CELL, StatusPill } from './dialogParts';
import { TeamPickerDialog } from './TeamSection';
import { NameSearch, filterPill } from './TeamPicker';

/** Une case du choix : espèce ou forme capturée, normale ou chromatique. */
interface Choice extends FavoritePokemonDto {
  key: string;
  name: string;
}

const sameFavorite = (a: FavoritePokemonDto | null, b: FavoritePokemonDto | null) =>
  a === b ||
  (!!a && !!b && a.speciesId === b.speciesId && a.formId === b.formId && a.shiny === b.shiny);

/**
 * Choix du Pokémon favori (son avatar sur la fiche, les classements, la recherche et sa guilde) :
 * parmi les espèces et formes capturées au Pokédex, en chromatique si capturées ainsi.
 */
export function FavoritePicker({
  ctx,
  starterSpeciesId,
  current,
  onClose,
}: {
  ctx: GameContext;
  starterSpeciesId: number | null;
  /** Favori choisi (null : le starter). */
  current: FavoritePokemonDto | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const pokedex = usePokedex();
  const forms = usePokedexForms();
  const [picked, setPicked] = useState<FavoritePokemonDto | null>(current);
  const [search, setSearch] = useState('');
  const [onlyShiny, setOnlyShiny] = useState(current?.shiny ?? false);

  const save = useMutation({
    mutationFn: (favorite: FavoritePokemonDto | null) => setFavoritePokemon(favorite),
    onSuccess: async () => {
      await Promise.all(
        [keys.me, keys.trainerCard].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
      onClose();
    },
  });

  // Espèces capturées par numéro du Pokédex, chacune suivie de ses formes capturées.
  const choices = useMemo(() => {
    const list: Choice[] = [];
    const formsBySpecies = new Map<number, { formId: number; caughtShiny: boolean }[]>();
    for (const f of forms.data ?? []) {
      const speciesId = getForm(f.formId)?.speciesId;
      if (speciesId === undefined) continue;
      formsBySpecies.set(speciesId, [...(formsBySpecies.get(speciesId) ?? []), f]);
    }
    const speciesIds = new Set([
      ...(pokedex.data ?? []).filter((e) => e.caught).map((e) => e.speciesId),
      ...formsBySpecies.keys(),
    ]);
    const shinySpecies = new Set(
      (pokedex.data ?? []).filter((e) => e.caughtShiny).map((e) => e.speciesId),
    );
    const caughtSpecies = new Set(
      (pokedex.data ?? []).filter((e) => e.caught).map((e) => e.speciesId),
    );
    const add = (speciesId: number, formId: number | null, shiny: boolean) =>
      list.push({
        key: `${speciesId}-${formId ?? 0}-${shiny ? 's' : 'n'}`,
        speciesId,
        formId,
        shiny,
        name: speciesName(ctx, speciesId, formId),
      });
    for (const speciesId of [...speciesIds].sort((a, b) => a - b)) {
      if (caughtSpecies.has(speciesId)) {
        add(speciesId, null, false);
        if (shinySpecies.has(speciesId)) add(speciesId, null, true);
      }
      for (const f of (formsBySpecies.get(speciesId) ?? []).sort((a, b) => a.formId - b.formId)) {
        add(speciesId, f.formId, false);
        if (f.caughtShiny) add(speciesId, f.formId, true);
      }
    }
    return list;
  }, [ctx, pokedex.data, forms.data]);

  const needle = searchKey(search.trim());
  const shown = choices.filter(
    (c) => (!onlyShiny || c.shiny) && (!needle || searchKey(c.name).includes(needle)),
  );
  const shownKey = `${needle}|${onlyShiny}`;
  const loading = pokedex.isPending || forms.isPending;
  const shinyCount = choices.filter((c) => c.shiny).length;
  const pickedName = picked
    ? speciesName(ctx, picked.speciesId, picked.formId)
    : starterSpeciesId !== null
      ? speciesName(ctx, starterSpeciesId)
      : null;

  return (
    <TeamPickerDialog open onClose={onClose} title="Pokémon favori">
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden p-3 sm:p-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Ton favori s’affiche sur ta fiche, dans les classements, la recherche de dresseurs et ta
          guilde. Choisis parmi les espèces et formes capturées au Pokédex.
        </p>
        <section className="tile flex flex-wrap items-center gap-2 p-2.5">
          <NameSearch value={search} onChange={setSearch} className="min-w-0 flex-1 py-1.5" />
          <button
            type="button"
            onClick={() => setOnlyShiny(!onlyShiny)}
            disabled={shinyCount === 0}
            title={
              shinyCount === 0
                ? 'Aucun chromatique capturé'
                : 'Seulement les Pokémon capturés en chromatique'
            }
            aria-pressed={onlyShiny}
            className={`${filterPill(onlyShiny)} disabled:opacity-50`}
          >
            ★ Chromatiques
          </button>
          <span className="ml-auto text-sm text-slate-500 dark:text-slate-400">
            {shown.length} Pokémon
          </span>
        </section>
        <section
          aria-label="Pokémon capturés"
          className="tile min-h-0 flex-1 overflow-y-auto p-1.5"
        >
          {loading ? (
            <p className="p-3 text-sm text-slate-500">Chargement…</p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))] gap-1 sm:grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))]">
              <ProgressiveItems items={shown} resetKey={shownKey}>
                {(c) => {
                  const selected = sameFavorite(picked, c);
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setPicked(c)}
                      aria-pressed={selected}
                      title={`${c.name}${c.shiny ? ' chromatique' : ''}`}
                      className={`flex w-full min-w-0 flex-col items-center gap-0.5 rounded-md border-2 p-1 text-center transition ${
                        selected
                          ? SELECTED_CELL
                          : 'border-transparent hover:border-well-line hover:bg-well/40'
                      }`}
                    >
                      <span
                        className={`sprite-well size-14 sm:size-16 ${c.shiny ? 'shiny-well' : ''}`}
                      >
                        <PokemonSprite
                          speciesId={c.speciesId}
                          formId={c.formId}
                          shiny={c.shiny}
                          size={56}
                          className="h-auto w-[92%]"
                        />
                      </span>
                      <span className="w-full truncate text-xs font-semibold">
                        {c.name} {c.shiny && <ShinyStar />}
                      </span>
                    </button>
                  );
                }}
              </ProgressiveItems>
              {shown.length === 0 && (
                <p className="col-span-full p-3 text-sm text-slate-500 dark:text-slate-400">
                  Aucun Pokémon capturé ne correspond.
                </p>
              )}
            </div>
          )}
        </section>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t-[3px] border-ink bg-tile px-3 py-2.5 sm:px-4">
        {save.error ? (
          <StatusPill tone="bad" text={errorText(save.error)} />
        ) : (
          <StatusPill
            tone={picked ? 'ok' : 'idle'}
            text={
              pickedName
                ? `${picked ? 'Favori' : 'Starter'} : ${pickedName}${picked?.shiny ? ' chromatique' : ''}`
                : 'Touche un Pokémon'
            }
          />
        )}
        <span className="hidden min-w-0 flex-1 sm:block" />
        <div className="grid w-full grid-cols-[auto_auto_minmax(0,1fr)] gap-2 sm:flex sm:w-auto">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setPicked(null)}
            disabled={picked === null || starterSpeciesId === null}
            title="Afficher de nouveau ton starter"
          >
            Starter
          </button>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            className="btn-primary px-6"
            disabled={save.isPending || sameFavorite(picked, current)}
            onClick={() => save.mutate(picked)}
          >
            Enregistrer
          </button>
        </div>
      </footer>
    </TeamPickerDialog>
  );
}
