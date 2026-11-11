/**
 * Fenêtre réduite du Centre Pokémon : Pokémon en soins et K.O. qui attendent.
 */
import { useState } from 'react';
import { ASSISTANT_POST_PLACES, assistantSlotCount } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import { Modal, PokemonSprite, useNow } from '../../components/ui';
import {
  assistantPlaces,
  centerState,
  shownPlaces,
  useAssistants,
  useHeal,
  usePlayerProgress,
  usePokemon,
} from '../../lib/queries';
import { errorText, speciesName } from '../../lib/labels';
import { AssistantCircle } from './AssistantCard';
import { CenterIcon, LockIcon } from './tileIcons';
import {
  Badge,
  CLOSED_PLACE,
  FREE_PLACE,
  HOVER_PRIMARY,
  Pager,
  SMALL_BTN,
  Tile,
  TileFooter,
  shortCountdown,
  usePage,
} from './tileParts';

export function CenterTile({ ctx }: { ctx: GameContext }) {
  const pokemon = usePokemon();
  const progress = usePlayerProgress();
  const assistants = useAssistants();
  const heal = useHeal();
  const now = useNow(5000);
  const { slots, healing, knockedOut, free } = centerState(ctx, pokemon.data ?? [], now, progress);
  const shown = shownPlaces(slots, [
    ...healing.map((p) => p.healSlot ?? 0),
    ...assistantPlaces(assistants.data, 'center'),
  ]);
  const size = ASSISTANT_POST_PLACES.center;
  const centers = assistantSlotCount('center', shown);
  const [center, setCenter] = usePage(centers);
  const first = center * size;
  const waiting = [...knockedOut].sort((a, b) => b.level - a.level);
  // Plus de K.O. que de places libres : choix des Pokémon à soigner (les plus hauts niveaux d'abord).
  const [selected, setSelected] = useState<string[] | null>(null);
  const chosen = (selected ?? []).filter((id) => waiting.some((p) => p.id === id)).slice(0, free);
  const toggle = (id: string) =>
    setSelected(
      chosen.includes(id)
        ? chosen.filter((x) => x !== id)
        : chosen.length < free
          ? [...chosen, id]
          : chosen,
    );

  return (
    <>
      <Tile
        tab="center"
        title="Centre Pokémon"
        icon={<CenterIcon />}
        badge={
          <Badge
            count={free > 0 ? waiting.length : 0}
            className="bg-red-500 text-white"
            title="Pokémon K.O. à soigner"
          />
        }
      >
        <Pager label="Centre" count={centers} index={center} onChange={setCenter} />
        {centers > 0 && (
          <div className="flex items-center gap-2">
            <div className="grid min-w-0 flex-1 grid-cols-3 gap-1">
              {Array.from({ length: Math.min(size, shown - first) }, (_, i) => {
                const place = first + i;
                const p = healing.find((h) => h.healSlot === place);
                if (p) {
                  const left = shortCountdown(Date.parse(p.healUntil!) - now);
                  return (
                    <div
                      key={place}
                      className="flex h-12 flex-col items-center justify-end overflow-hidden rounded-md border-2 border-well-line bg-well pb-0.5"
                      title={`${speciesName(ctx, p.speciesId, p.formId)} : soins ${left}`}
                    >
                      <PokemonSprite
                        speciesId={p.speciesId}
                        formId={p.formId}
                        shiny={p.isShiny}
                        size={36}
                        className="-my-1"
                      />
                      <span className="font-mono text-[10px] leading-none text-pink-700 dark:text-pink-300">
                        {left}
                      </span>
                    </div>
                  );
                }
                return place < slots ? (
                  <div
                    key={place}
                    title="Place libre"
                    className={`h-12 rounded-md ${FREE_PLACE}`}
                  />
                ) : (
                  <div
                    key={place}
                    title="Place fermée"
                    className={`grid h-12 place-items-center rounded-md ${CLOSED_PLACE}`}
                  >
                    <LockIcon />
                  </div>
                );
              })}
            </div>
            <AssistantCircle ctx={ctx} post="center" slot={center} closed={first >= slots} />
          </div>
        )}
        <TileFooter
          text={
            waiting.length > 0 ? `${waiting.length} Pokémon K.O. en attente` : 'Aucun Pokémon K.O.'
          }
        >
          {waiting.length > 0 && (
            <button
              className={`btn-primary ${SMALL_BTN} ${HOVER_PRIMARY}`}
              disabled={free === 0 || heal.isPending}
              title={free === 0 ? 'Toutes les places du Centre sont occupées.' : undefined}
              onClick={() =>
                free >= waiting.length
                  ? heal.mutate(waiting.map((p) => p.id))
                  : setSelected(waiting.slice(0, free).map((p) => p.id))
              }
            >
              {free >= waiting.length || free === 0 ? 'Tout soigner' : 'Soigner'}
            </button>
          )}
        </TileFooter>
        {heal.error && <p className="text-xs text-red-600">{errorText(heal.error)}</p>}
      </Tile>
      <Modal open={selected !== null} onClose={() => setSelected(null)}>
        <h2 className="text-xl font-bold">Soigner des Pokémon</h2>
        <p className="mt-1 text-sm text-slate-500">
          {waiting.length} Pokémon K.O. pour{' '}
          {free > 1 ? `${free} places libres` : `${free} place libre`} : choisis ceux à soigner.
        </p>
        <ul className="-mx-1 mt-3 grid max-h-[60vh] gap-2 overflow-y-auto p-1">
          {waiting.map((p) => {
            const on = chosen.includes(p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  disabled={!on && chosen.length >= free}
                  onClick={() => toggle(p.id)}
                  className={`flex w-full items-center gap-3 rounded-md border-2 p-2 text-left transition enabled:hover:border-brand-500 disabled:cursor-default disabled:opacity-50 ${
                    on ? 'border-ink bg-done' : 'border-well-line bg-tile'
                  }`}
                >
                  <PokemonSprite
                    speciesId={p.speciesId}
                    formId={p.formId}
                    shiny={p.isShiny}
                    size={40}
                  />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block font-medium">
                      {speciesName(ctx, p.speciesId, p.formId)}
                    </span>
                    <span className="text-xs text-slate-500">Niveau {p.level}</span>
                  </span>
                  <span
                    aria-hidden
                    className={`grid size-5 shrink-0 place-items-center rounded-[3px] border-2 text-xs font-bold ${
                      on
                        ? 'border-ink bg-ink text-white dark:border-title dark:bg-title dark:text-ink'
                        : 'border-slate-400'
                    }`}
                  >
                    {on ? '✓' : ''}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {heal.error && <p className="mt-2 text-sm text-red-600">{errorText(heal.error)}</p>}
        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="text-sm text-slate-500">
            {chosen.length} / {free} place{free > 1 ? 's' : ''}
          </span>
          <span className="flex gap-2">
            <button className="btn-ghost" onClick={() => setSelected(null)}>
              Annuler
            </button>
            <button
              className="btn-primary"
              disabled={chosen.length === 0 || heal.isPending}
              onClick={() => heal.mutate(chosen, { onSuccess: () => setSelected(null) })}
            >
              {chosen.length > 1 ? `Soigner (${chosen.length})` : 'Soigner'}
            </button>
          </span>
        </div>
      </Modal>
    </>
  );
}
