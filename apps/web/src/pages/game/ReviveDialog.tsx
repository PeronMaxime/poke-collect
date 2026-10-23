import type { GameContext } from '@poke/game-core';
import { Modal, PokemonSprite } from '../../components/ui';
import { usePokemon, useRevive, useReviveStacks } from '../../lib/game';
import { errorText, itemIcon, itemName, speciesName } from '../../lib/labels';

/** Choix des Pokémon K.O. à ranimer avec un Rappel (un Rappel par Pokémon). */
export function ReviveDialog({
  ctx,
  itemId,
  onClose,
}: {
  ctx: GameContext;
  itemId: string;
  onClose: () => void;
}) {
  const pokemon = usePokemon();
  const revive = useRevive();
  const left = useReviveStacks(ctx).find((s) => s.itemId === itemId)?.quantity ?? 0;
  const knockedOut = (pokemon.data ?? [])
    .filter((p) => p.knockedOut)
    .sort((a, b) => b.level - a.level);

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
            Il t’en reste {left}. Un Pokémon ranimé est aussitôt de nouveau disponible.
          </p>
        </div>
      </div>
      {knockedOut.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Aucun Pokémon K.O. pour l’instant.</p>
      ) : (
        <ul className="mt-4 grid max-h-[60vh] gap-2 overflow-y-auto sm:grid-cols-2">
          {knockedOut.map((p) => (
            <li key={p.id} className="card flex items-center gap-3 p-2">
              <PokemonSprite
                speciesId={p.speciesId}
                formId={p.formId}
                shiny={p.isShiny}
                size={48}
              />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">{speciesName(ctx, p.speciesId, p.formId)}</p>
                <p className="text-xs text-slate-500">Niveau {p.level}</p>
              </div>
              <button
                className="btn-primary"
                disabled={left === 0 || revive.isPending}
                onClick={() => revive.mutate({ itemId, pokemonIds: [p.id] })}
              >
                Ranimer
              </button>
            </li>
          ))}
        </ul>
      )}
      {revive.error && <p className="mt-3 text-sm text-red-600">{errorText(revive.error)}</p>}
      <div className="mt-4 text-right">
        <button className="btn-ghost" onClick={onClose}>
          Fermer
        </button>
      </div>
    </Modal>
  );
}
