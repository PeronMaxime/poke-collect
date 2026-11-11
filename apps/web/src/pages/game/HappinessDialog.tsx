import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MAX_HAPPINESS, MAX_LEVEL } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type { PokemonDto, UseItemInput } from '@poke/shared';
import { ProgressBar } from '../../components/ui';
import {
  applyItem,
  patchPokemon,
  setItemQuantity,
  useInventory,
  usePokemon,
} from '../../lib/queries';
import { errorText, itemName, speciesName } from '../../lib/labels';
import { SECTION_TITLE, StatusPill } from './dialogParts';
import type { StatusTone } from './dialogParts';
import {
  ChosenPokemon,
  ItemPokemonPicker,
  pendingEvolution,
  pokemonLabel,
} from './ItemPokemonPicker';

/** Pastille verte d'un Pokémon qu'une évolution attend (bonheur ou niveau à atteindre). */
function EvolutionMark() {
  return (
    <span
      aria-hidden
      className="grid size-5 place-items-center rounded border-2 border-ink bg-emerald-400 font-pixel text-[9px] leading-none text-[#10203a]"
    >
      ↑
    </span>
  );
}

/**
 * Choix du Pokémon à qui donner une baie de bonheur (Baie Grena) ou un Super Bonbon, depuis le
 * sac : le Pokémon choisi le reste, pour lui en donner plusieurs à la suite.
 */
export function HappinessDialog({
  ctx,
  itemId,
  onClose,
}: {
  ctx: GameContext;
  itemId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const pokemon = usePokemon();
  const inventory = useInventory();
  const [chosen, setChosen] = useState<string | null>(null);
  const [given, setGiven] = useState<{ name: string; count: number } | null>(null);
  const amount = ctx.itemEffect(itemId, 'happiness')?.amount ?? 0;
  const levels = ctx.itemEffect(itemId, 'levelUp')?.levels;
  const kind = levels ? 'level' : 'happiness';
  const left = inventory.data?.find((s) => s.itemId === itemId)?.quantity ?? 0;
  const give = useMutation({
    mutationFn: ({ pokemonId, ...input }: UseItemInput & { pokemonId: string }) =>
      applyItem(pokemonId, input),
    onSuccess: (data) => {
      patchPokemon(queryClient, data.pokemon);
      setItemQuantity(queryClient, data.itemId, data.remaining);
      const name = pokemonLabel(ctx, data.pokemon);
      setGiven((g) => ({ name, count: g?.name === name ? g.count + 1 : 1 }));
    },
  });

  const useful = (p: PokemonDto) => (levels ? p.level < MAX_LEVEL : p.happiness < MAX_HAPPINESS);
  // Le Pokémon choisi reste dans la liste une fois au maximum (le bouton se grise).
  const candidates = (pokemon.data ?? []).filter((p) => p.id === chosen || (!p.busy && useful(p)));
  const picked = candidates.find((p) => p.id === chosen);
  const evolution = (p: PokemonDto) => pendingEvolution(ctx, p, kind);
  const pickedEvolution = picked ? evolution(picked) : null;

  const status: { tone: StatusTone; text: string } = !picked
    ? { tone: 'idle', text: 'Choisis un Pokémon' }
    : !useful(picked)
      ? { tone: 'bad', text: levels ? 'Déjà au niveau maximal' : 'Bonheur déjà au maximum' }
      : left === 0
        ? { tone: 'bad', text: `Plus de ${itemName(ctx, itemId)}` }
        : levels
          ? {
              tone: 'ok',
              text: `Niveau ${picked.level} → ${Math.min(MAX_LEVEL, picked.level + levels)}`,
            }
          : {
              tone: 'ok',
              text: `Bonheur ${picked.happiness} → ${Math.min(MAX_HAPPINESS, picked.happiness + amount)}`,
            };

  /** Objets encore à donner pour atteindre le seuil de l'évolution. */
  const stillNeeded = (p: PokemonDto, required: number) =>
    Math.ceil((required - (levels ? p.level : p.happiness)) / Math.max(1, levels ?? amount));

  return (
    <ItemPokemonPicker
      ctx={ctx}
      itemId={itemId}
      title={itemName(ctx, itemId)}
      left={left}
      summary={
        levels
          ? `Le Pokémon gagne ${levels} niveau${levels > 1 ? 'x' : ''} (au plus ${MAX_LEVEL}).`
          : `Le Pokémon gagne ${amount} de bonheur (au plus ${MAX_HAPPINESS}).`
      }
      candidates={candidates}
      emptyText={
        levels
          ? 'Aucun Pokémon disponible : ils sont occupés ou déjà au niveau maximal.'
          : 'Aucun Pokémon disponible : ils sont occupés ou leur bonheur est déjà au maximum.'
      }
      selected={chosen ? [chosen] : []}
      onToggle={(p) => setChosen((id) => (id === p.id ? null : p.id))}
      extraSort={
        levels ? undefined : { label: 'Bonheur', compare: (a, b) => b.happiness - a.happiness }
      }
      extraToggle={{
        label: levels ? 'Évolue par niveau' : 'Évolue par bonheur',
        title: levels
          ? 'N’afficher que les Pokémon qui évoluent en montant de niveau'
          : 'N’afficher que les Pokémon qui évoluent avec assez de bonheur',
        icon: <span className="text-emerald-600 dark:text-emerald-400">↑</span>,
        test: (p) => evolution(p) !== null,
      }}
      cellLine={(p) => (levels ? `N.${p.level}` : `N.${p.level} · ♥ ${p.happiness}`)}
      cellBadge={(p) => (evolution(p) ? <EvolutionMark /> : null)}
      aside={
        <>
          <h3 className={SECTION_TITLE}>Pokémon choisi</h3>
          <ChosenPokemon ctx={ctx} p={picked}>
            {picked && (
              <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                {levels ? (
                  <>
                    <p className="flex justify-between">
                      <span>Niveau</span>
                      <b>
                        {picked.level} / {MAX_LEVEL}
                      </b>
                    </p>
                    <ProgressBar value={picked.level / MAX_LEVEL} barClassName="bg-[#48a8e8]" />
                  </>
                ) : (
                  <>
                    <p className="flex justify-between">
                      <span>Bonheur</span>
                      <b>
                        {picked.happiness} / {MAX_HAPPINESS}
                      </b>
                    </p>
                    <ProgressBar
                      value={picked.happiness / MAX_HAPPINESS}
                      barClassName="bg-pink-400"
                    />
                  </>
                )}
              </div>
            )}
          </ChosenPokemon>
          {picked && pickedEvolution && (
            <p className="rounded-md border-2 border-emerald-600 bg-emerald-50 px-2.5 py-1.5 text-sm dark:border-emerald-400 dark:bg-emerald-950/50">
              Évolue en <b>{speciesName(ctx, pickedEvolution.speciesId, pickedEvolution.formId)}</b>{' '}
              {levels
                ? `au niveau ${pickedEvolution.required}`
                : `à ${pickedEvolution.required} de bonheur`}{' '}
              <span className="text-slate-600 dark:text-slate-400">
                (encore {stillNeeded(picked, pickedEvolution.required)})
              </span>
            </p>
          )}
          {given && (
            <p className="rounded-md border-2 border-well-line px-2.5 py-1.5 text-sm">
              {given.count > 1 ? `${given.count} donnés` : 'Donné'} à <b>{given.name}</b>.
            </p>
          )}
          <p className="mt-auto border-t-2 border-well-line pt-2.5 text-xs text-slate-500 dark:text-slate-400">
            Le Pokémon choisi reste sélectionné : touche « Donner » plusieurs fois pour lui en
            donner plusieurs. Les Pokémon occupés (expédition, pension…) n’apparaissent pas.
          </p>
        </>
      }
      footer={
        <>
          <StatusPill tone={status.tone} text={status.text} />
          {give.error && (
            <span className="text-sm text-red-600 sm:w-auto">{errorText(give.error)}</span>
          )}
          <div className="grid w-full grid-cols-[auto_minmax(0,1fr)] gap-2 sm:ml-auto sm:flex sm:w-auto">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Fermer
            </button>
            <button
              type="button"
              className="btn-primary px-6"
              disabled={status.tone !== 'ok' || give.isPending}
              onClick={() => give.mutate({ pokemonId: picked!.id, itemId })}
            >
              Donner
            </button>
          </div>
        </>
      }
      onClose={onClose}
    />
  );
}
