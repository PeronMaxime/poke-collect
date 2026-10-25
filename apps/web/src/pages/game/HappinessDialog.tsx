import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MAX_HAPPINESS, MAX_LEVEL } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import { searchKey } from '@poke/shared';
import type { UseItemInput, UseItemResponse } from '@poke/shared';
import { Modal, PokemonSprite } from '../../components/ui';
import { api } from '../../lib/api';
import { keys, useInventory, usePokemon } from '../../lib/game';
import { errorText, itemIcon, itemName, speciesName } from '../../lib/labels';

/**
 * Choix du Pokémon à qui donner une baie de bonheur (Baie Grena) ou un Super Bonbon, depuis le
 * sac.
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
  const [search, setSearch] = useState('');
  const amount = ctx.itemEffect(itemId, 'happiness')?.amount ?? 0;
  const levels = ctx.itemEffect(itemId, 'levelUp')?.levels;
  const left = inventory.data?.find((s) => s.itemId === itemId)?.quantity ?? 0;
  const give = useMutation({
    mutationFn: ({ pokemonId, ...input }: UseItemInput & { pokemonId: string }) =>
      api<UseItemResponse>(`/api/pokemon/${pokemonId}/use-item`, { method: 'POST', json: input }),
    onSuccess: () =>
      Promise.all(
        [keys.pokemon, keys.inventory].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ),
  });
  const needle = searchKey(search.trim());
  const candidates = (pokemon.data ?? [])
    .filter(
      (p) =>
        !p.busy &&
        (levels ? p.level < MAX_LEVEL : p.happiness < MAX_HAPPINESS) &&
        (!needle || searchKey(speciesName(ctx, p.speciesId, p.formId)).includes(needle)),
    )
    .sort((a, b) => b.level - a.level)
    .slice(0, 120);

  return (
    <Modal open onClose={onClose} wide>
      <div className="flex items-center gap-3">
        <img
          src={itemIcon(ctx, itemId)}
          alt=""
          className="h-10 w-10 shrink-0 [image-rendering:pixelated]"
        />
        <div>
          <h2 className="text-xl font-bold">{itemName(ctx, itemId)}</h2>
          <p className="text-sm text-slate-500">
            Il t’en reste {left}.{' '}
            {levels
              ? `Le Pokémon gagne ${levels} niveau${levels > 1 ? 'x' : ''} (au plus ${MAX_LEVEL}).`
              : `Le Pokémon gagne ${amount} de bonheur (au plus ${MAX_HAPPINESS}).`}
          </p>
        </div>
      </div>
      <input
        className="input mt-3 max-w-64"
        placeholder="Rechercher un Pokémon…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {candidates.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Aucun Pokémon disponible.</p>
      ) : (
        <ul className="mt-3 grid max-h-[60vh] gap-2 overflow-y-auto sm:grid-cols-2">
          {candidates.map((p) => (
            <li key={p.id} className="card flex items-center gap-3 p-2">
              <PokemonSprite
                speciesId={p.speciesId}
                formId={p.formId}
                shiny={p.isShiny}
                size={48}
              />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">{speciesName(ctx, p.speciesId, p.formId)}</p>
                <p className="text-xs text-slate-500">
                  Niveau {p.level} · bonheur {p.happiness}
                </p>
              </div>
              <button
                className="btn-primary"
                disabled={left === 0 || give.isPending}
                onClick={() => give.mutate({ pokemonId: p.id, itemId })}
              >
                Donner
              </button>
            </li>
          ))}
        </ul>
      )}
      {give.error && <p className="mt-3 text-sm text-red-600">{errorText(give.error)}</p>}
      <div className="mt-4 text-right">
        <button className="btn-ghost" onClick={onClose}>
          Fermer
        </button>
      </div>
    </Modal>
  );
}
