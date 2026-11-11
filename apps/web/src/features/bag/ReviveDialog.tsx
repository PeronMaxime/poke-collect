import { useState } from 'react';
import type { GameContext } from '@poke/game-core';
import { PokemonSprite, ShinyStar } from '../../components/ui';
import { usePokemon, useRevive, useReviveStacks } from '../../lib/queries';
import { errorText, itemName } from '../../lib/labels';
import {
  CrossIcon,
  SECTION_TITLE,
  SLOT_BUTTON,
  SLOT_CLASS,
  StatusPill,
} from '../common/dialogParts';
import type { StatusTone } from '../common/dialogParts';
import { ItemPokemonPicker, pokemonLabel } from './ItemPokemonPicker';

/** État du choix des Pokémon K.O. à ranimer : choisis, Rappels restants, ranimés. */
function useReviveDialog({
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
  const [chosen, setChosen] = useState<string[]>([]);
  const [revived, setRevived] = useState(0);
  const knockedOut = (pokemon.data ?? []).filter((p) => p.knockedOut);
  // Pokémon soignés entre-temps (Centre Pokémon) : retirés du choix.
  const picked = chosen
    .map((id) => knockedOut.find((p) => p.id === id))
    .filter((p) => p !== undefined);
  const name = itemName(ctx, itemId);

  const status: { tone: StatusTone; text: string } =
    picked.length === 0
      ? { tone: 'idle', text: 'Choisis des Pokémon K.O.' }
      : picked.length > left
        ? { tone: 'bad', text: `Il te faut ${picked.length} ${name} (tu en as ${left})` }
        : {
            tone: 'ok',
            text: `${picked.length} Pokémon à ranimer`,
          };

  function chooseAll() {
    const ids = picked.map((p) => p.id);
    for (const p of [...knockedOut].sort((a, b) => b.level - a.level)) {
      if (ids.length >= left) break;
      if (!ids.includes(p.id)) ids.push(p.id);
    }
    setChosen(ids);
  }

  return {
    ctx,
    itemId,
    onClose,
    revive,
    left,
    setChosen,
    revived,
    setRevived,
    knockedOut,
    picked,
    name,
    status,
    chooseAll,
  };
}

/** Ce qu'affichent les pièces de `ReviveDialog`. */
type ReviveDialogModel = ReturnType<typeof useReviveDialog>;

/**
 * Choix des Pokémon K.O. à ranimer avec un Rappel (un Rappel par Pokémon) : on en choisit
 * plusieurs, puis on les ranime d'un coup.
 */
export function ReviveDialog({
  ctx,
  itemId,
  onClose,
}: {
  ctx: GameContext;
  itemId: string;
  onClose: () => void;
}) {
  const m = useReviveDialog({ ctx, itemId, onClose });
  const { left, setChosen, knockedOut, picked, name } = m;
  return (
    <ItemPokemonPicker
      ctx={ctx}
      itemId={itemId}
      title={name}
      left={left}
      summary="Un Rappel par Pokémon : un Pokémon ranimé est aussitôt de nouveau disponible."
      candidates={knockedOut}
      emptyText="Aucun Pokémon K.O. pour l’instant."
      selected={picked.map((p) => p.id)}
      onToggle={(p) =>
        setChosen((ids) => (ids.includes(p.id) ? ids.filter((id) => id !== p.id) : [...ids, p.id]))
      }
      cellLine={(p) => `N.${p.level}`}
      aside={<ReviveAside m={m} />}
      footer={<ReviveFooter m={m} />}
      onClose={onClose}
    />
  );
}

/** Les Pokémon à ranimer, « Tout choisir » et « Vider ». */
function ReviveAside({ m }: { m: ReviveDialogModel }) {
  const { ctx, left, setChosen, revived, knockedOut, picked, name, chooseAll } = m;
  return (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className={SECTION_TITLE}>À ranimer</h3>
        <span className="font-mono text-sm text-slate-500 dark:text-slate-400">
          {picked.length} / {left}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          className="btn-ghost px-3 py-1 text-sm"
          disabled={knockedOut.length === 0 || left === 0}
          onClick={chooseAll}
          title={`Choisir les Pokémon K.O. de plus haut niveau, dans la limite de tes ${name}`}
        >
          Tout choisir
        </button>
        {picked.length > 0 && (
          <button
            type="button"
            className="btn-ghost px-3 py-1 text-sm"
            onClick={() => setChosen([])}
          >
            Vider
          </button>
        )}
      </div>
      {picked.length === 0 ? (
        <p
          className={`${SLOT_CLASS} border-dashed border-well-line p-3 text-sm text-slate-500 dark:text-slate-400`}
        >
          Touche les Pokémon K.O. à ranimer dans la liste.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {picked.map((p) => (
            <li
              key={p.id}
              className={`${SLOT_CLASS} flex items-center gap-2 border-well-line p-1.5`}
            >
              <span className={`sprite-well size-10 shrink-0 ${p.isShiny ? 'shiny-well' : ''}`}>
                <PokemonSprite
                  speciesId={p.speciesId}
                  formId={p.formId}
                  shiny={p.isShiny}
                  size={36}
                />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                {pokemonLabel(ctx, p)} {p.isShiny && <ShinyStar />}{' '}
                <span className="font-normal text-slate-500 dark:text-slate-400">N.{p.level}</span>
              </span>
              <button
                type="button"
                className={SLOT_BUTTON}
                aria-label={`Retirer ${pokemonLabel(ctx, p)}`}
                onClick={() => setChosen((ids) => ids.filter((id) => id !== p.id))}
              >
                <CrossIcon />
              </button>
            </li>
          ))}
        </ul>
      )}
      {revived > 0 && (
        <p className="rounded-md border-2 border-emerald-600 bg-emerald-50 px-2.5 py-1.5 text-sm dark:border-emerald-400 dark:bg-emerald-950/50">
          {revived > 1 ? `${revived} Pokémon ranimés` : 'Pokémon ranimé'} : de nouveau disponibles.
        </p>
      )}
      <p className="mt-auto border-t-2 border-well-line pt-2.5 text-xs text-slate-500 dark:text-slate-400">
        Sans Rappel, un Pokémon K.O. attend ses soins au Centre Pokémon.
      </p>
    </>
  );
}

/** Pied : état du choix, erreur, Fermer et Ranimer. */
function ReviveFooter({ m }: { m: ReviveDialogModel }) {
  const { itemId, onClose, revive, setChosen, setRevived, picked, status } = m;
  return (
    <>
      <StatusPill tone={status.tone} text={status.text} />
      {revive.error && <span className="text-sm text-red-600">{errorText(revive.error)}</span>}
      <div className="grid w-full grid-cols-[auto_minmax(0,1fr)] gap-2 sm:ml-auto sm:flex sm:w-auto">
        <button type="button" className="btn-ghost" onClick={onClose}>
          Fermer
        </button>
        <button
          type="button"
          className="btn-primary px-6"
          disabled={status.tone !== 'ok' || revive.isPending}
          onClick={() =>
            revive.mutate(
              { itemId, pokemonIds: picked.map((p) => p.id) },
              {
                onSuccess: (rows) => {
                  setRevived(rows.length);
                  setChosen([]);
                },
              },
            )
          }
        >
          Ranimer{picked.length > 1 && ` (${picked.length})`}
        </button>
      </div>
    </>
  );
}
