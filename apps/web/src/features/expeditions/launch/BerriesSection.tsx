/**
 * Section « Baies » du formulaire de départ : une baie de capture et une baie de rencontres au plus.
 */
import { formatDuration, formatMultiplier, itemIcon, itemName } from '../../../lib/labels';
import { SELECTED_CELL } from '../../common/dialogParts';
import type { GameContext } from '@poke/game-core';
import type { LaunchModel } from './useLaunchExpedition';
import { COUNT_BADGE, ItemBubble, Section } from './parts';

/** Baies emportées, facultatives : sorte, nombre et temps d'effet. */
export function BerriesSection({ launch }: { launch: LaunchModel }) {
  const {
    ctx,
    owned,
    unlimitedItems,
    berryDurationMinutes,
    captureBerries,
    encounterBerries,
    berryId,
    setBerryId,
    berriesTaken,
    setBerryCount,
    encounterBerryId,
    setEncounterBerryId,
    encounterBerriesTaken,
    setEncounterBerryCount,
    maxBerries,
    berriesChosen,
  } = launch;
  return (
    <Section
      title="Baies"
      note="facultatives"
      help={`Une baie de capture et une baie de rencontres au plus. Chacune agit ${berryDurationMinutes} min, l’une après l’autre dès le départ ; celles pas encore entamées sont rendues au retour.`}
      summary={
        berriesChosen.length === 0
          ? 'Aucune'
          : berriesChosen.map((b) => (
              <span key={b.itemId} className="inline-flex items-center gap-0.5">
                <img
                  src={itemIcon(ctx, b.itemId)}
                  alt={itemName(ctx, b.itemId)}
                  className="size-6 [image-rendering:pixelated]"
                />
                ×{b.count}
              </span>
            ))
      }
    >
      {captureBerries.length + encounterBerries.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Aucune baie utile dans ton sac.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <BerrySlot
            ctx={ctx}
            title="Capture"
            items={captureBerries}
            selected={berryId}
            quantity={unlimitedItems ? undefined : owned}
            onSelect={(id) => setBerryId(berryId === id ? null : id)}
            effect={
              berryId &&
              `Capture ${formatMultiplier(ctx.itemEffect(berryId, 'captureBoost')!.multiplier)}`
            }
            count={berriesTaken}
            max={maxBerries(berryId)}
            minutesEach={berryDurationMinutes}
            onCount={setBerryCount}
            empty="Aucune baie de capture dans ton sac."
          />
          <BerrySlot
            ctx={ctx}
            title="Rencontres"
            items={encounterBerries}
            selected={encounterBerryId}
            quantity={unlimitedItems ? undefined : owned}
            onSelect={(id) => setEncounterBerryId(encounterBerryId === id ? null : id)}
            effect={
              encounterBerryId &&
              `Rencontres ${formatMultiplier(ctx.itemEffect(encounterBerryId, 'encounterBoost')!.multiplier)}`
            }
            count={encounterBerriesTaken}
            max={maxBerries(encounterBerryId)}
            minutesEach={berryDurationMinutes}
            onCount={setEncounterBerryCount}
            empty="Aucune baie de rencontres dans ton sac."
          />
        </div>
      )}
    </Section>
  );
}

/** Baies d'une sorte (capture ou rencontres) : choix de la baie et nombre à envoyer. */
function BerrySlot({
  ctx,
  title,
  items,
  selected,
  quantity,
  onSelect,
  effect,
  count,
  max,
  minutesEach,
  onCount,
  empty,
}: {
  ctx: GameContext;
  title: string;
  items: readonly string[];
  selected: string | null;
  /** Quantité possédée ; absente = stock illimité (simulateur). */
  quantity?: (itemId: string) => number;
  onSelect: (itemId: string) => void;
  /** Effet de la baie choisie (« Capture ×1,5 »). */
  effect: string | null;
  count: number;
  max: number;
  /** Temps d'effet de chaque baie. */
  minutesEach: number;
  onCount: (count: number) => void;
  empty: string;
}) {
  const setCount = (n: number) => onCount(Math.max(1, Math.min(max, n)));
  return (
    <div className="rounded-md border-2 border-well-line p-2.5">
      <p className="font-pixel text-[8px] leading-normal text-slate-500 uppercase dark:text-slate-400">
        {title}
      </p>
      {items.length === 0 ? (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{empty}</p>
      ) : (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex flex-wrap gap-1.5">
            {items.map((itemId) => {
              const on = itemId === selected;
              return (
                <ItemBubble key={itemId} ctx={ctx} itemId={itemId}>
                  <button
                    type="button"
                    onClick={() => onSelect(itemId)}
                    aria-pressed={on}
                    aria-label={itemName(ctx, itemId)}
                    className={`relative grid size-11 place-items-center rounded-md border-2 ${
                      on ? SELECTED_CELL : 'border-well-line bg-well hover:border-slate-500'
                    }`}
                  >
                    <img
                      src={itemIcon(ctx, itemId)}
                      alt=""
                      className="size-8 [image-rendering:pixelated]"
                    />
                    {quantity && <span className={COUNT_BADGE}>{quantity(itemId)}</span>}
                  </button>
                </ItemBubble>
              );
            })}
          </div>
          {selected ? (
            <div className="flex items-center gap-1.5 text-xs">
              <button
                type="button"
                className="btn-ghost size-8 p-0"
                aria-label="Une baie de moins"
                disabled={count <= 1}
                onClick={() => setCount(count - 1)}
              >
                −
              </button>
              <input
                type="number"
                className="input w-14 px-1 py-1 text-center"
                aria-label={`Nombre de baies (${title.toLowerCase()})`}
                min={1}
                max={max}
                value={count}
                onChange={(e) => setCount(Number(e.target.value) || 1)}
              />
              <button
                type="button"
                className="btn-ghost size-8 p-0"
                aria-label="Une baie de plus"
                disabled={count >= max}
                onClick={() => setCount(count + 1)}
              >
                +
              </button>
              <span className="text-slate-500 dark:text-slate-400">/ {max}</span>
            </div>
          ) : (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Touche une baie pour l’emporter.
            </span>
          )}
        </div>
      )}
      {selected && effect && (
        <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300">
          {effect} pendant les {formatDuration(count * minutesEach)} qui suivent le départ.
        </p>
      )}
    </div>
  );
}
