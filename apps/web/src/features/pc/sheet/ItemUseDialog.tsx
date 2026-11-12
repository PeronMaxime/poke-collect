/**
 * Popin « Objet » de la fiche d'un Pokémon du PC : utiliser sur lui un objet du sac.
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { STAT_NAMES } from '@poke/data';
import type { StatName } from '@poke/data';
import { MAX_IV, effectiveAbility, getNature, itemUseOptions } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type { InventoryEntryDto, PokemonDto, UseItemInput } from '@poke/shared';
import { Modal, PokemonSprite } from '../../../components/ui';
import { applyItem, patchPokemon, setItemQuantity } from '../../../lib/queries';
import {
  STAT_LABELS,
  abilityLabel,
  effectText,
  errorText,
  itemIcon,
  itemName,
  natureLabel,
  speciesName,
} from '../../../lib/labels';
import {
  CollapsibleSheetSection,
  InfoCell,
  LAUNCH_DIALOG_CLASS,
  SELECTED_CELL,
  StatusPill,
} from '../../common/dialogParts';
import { HUD_PILL } from './parts';

/** Objets endgame du sac utilisables sur ce Pokémon (Capsules, Aromates, Pilule / Patch Talent). */
export function usableItems(
  ctx: GameContext,
  p: PokemonDto,
  inventory: InventoryEntryDto[] | undefined,
) {
  // Un Pokémon Méga-Évolué garde le talent de sa forme normale.
  const target = {
    ...p,
    formId: p.megaStone ? null : p.formId,
    originalNature: p.originalNature ?? p.nature,
  };
  return (inventory ?? [])
    .filter((i) => i.quantity > 0)
    .flatMap((i) => {
      const options = itemUseOptions(ctx, target, i.itemId);
      return options ? [{ ...i, options }] : [];
    });
}

/** Objet du sac utilisable sur un Pokémon, avec ce qu'il lui ferait. */
export type UsableItem = ReturnType<typeof usableItems>[number];
type ItemEffectType = UsableItem['options']['effect']['type'];

/** Rubriques de la popin « Objet », dans l'ordre d'affichage. */
const ITEM_GROUPS: { type: ItemEffectType; title: string }[] = [
  { type: 'levelUp', title: 'Niveau' },
  { type: 'ivCap', title: 'IV' },
  { type: 'abilityChange', title: 'Talent' },
  { type: 'mint', title: 'Nature (Aromates)' },
  { type: 'happiness', title: 'Bonheur' },
];

/** Effet d'un objet, sans le « Sur un Pokémon : » du Sac (on est déjà sur sa fiche). */
const itemEffectText = (item: UsableItem) => {
  const text = effectText(item.options.effect).replace(/^Sur un Pokémon : /, '');
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** Pourquoi l'objet ne ferait rien sur ce Pokémon. */
function uselessReason(item: UsableItem): string {
  const { effect } = item.options;
  switch (effect.type) {
    case 'ivCap':
      return 'Tous ses IV sont déjà à 31';
    case 'mint':
      return 'Nature actuelle';
    case 'abilityChange':
      return effect.hidden ? 'Pas de talent caché à lui donner' : 'Aucun autre talent à lui donner';
    case 'happiness':
      return 'Bonheur déjà au maximum';
    case 'levelUp':
      return 'Déjà au niveau maximal';
  }
}

/**
 * Popin « Objet » de la fiche du PC : objets du sac rangés par effet (niveau, IV, talent,
 * nature, bonheur), avec l'état actuel du Pokémon en tête. Le serveur vérifie de nouveau et
 * consomme l'objet.
 */
export function ItemUseDialog({
  ctx,
  pokemon: p,
  items,
  open,
  onClose,
}: {
  ctx: GameContext;
  pokemon: PokemonDto;
  items: UsableItem[];
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  // IV choisi pour chaque Capsule « 1 IV au choix ».
  const [chosenStats, setChosenStats] = useState<Record<string, StatName>>({});
  const [done, setDone] = useState<string | null>(null);
  const use = useMutation({
    mutationFn: (input: UseItemInput) => applyItem(p.id, input),
    onSuccess: (data, input) => {
      setChosenStats({});
      setDone(
        `${itemName(ctx, input.itemId)} utilisé sur ${speciesName(ctx, p.speciesId, p.formId)}.`,
      );
      patchPokemon(queryClient, data.pokemon);
      setItemQuantity(queryClient, data.itemId, data.remaining);
    },
  });
  const close = () => {
    setDone(null);
    use.reset();
    onClose();
  };

  const species = ctx.species(p.speciesId, p.formId);
  const disabled = use.isPending || p.busy;
  const busyTitle = p.busy ? 'Le Pokémon doit être disponible (ni en activité)' : undefined;
  const run = (item: UsableItem) => {
    const stat = chosenStats[item.itemId];
    setDone(null);
    use.mutate({ itemId: item.itemId, ...(stat && { stat }) });
  };

  return (
    <Modal open={open} onClose={close} wide className={LAUNCH_DIALOG_CLASS}>
      <header className="flex shrink-0 items-center gap-2 border-b-[3px] border-ink bg-hud px-3 py-2 text-white sm:gap-3 sm:px-4">
        <PokemonSprite
          speciesId={p.speciesId}
          formId={p.formId}
          shiny={p.isShiny}
          size={40}
          className="-my-1 shrink-0"
        />
        <h2 className="min-w-0 truncate font-pixel text-xs text-[#f8d030] uppercase sm:text-sm">
          Objets · {species?.nameFr}
        </h2>
        <span className={HUD_PILL}>N.{p.level}</span>
        <div className="flex-1" />
        <button
          type="button"
          className="btn size-10 shrink-0 border-[#0b0f1e] bg-brand-500 p-0 text-white"
          onClick={close}
          aria-label="Fermer"
          title="Fermer (Échap)"
        >
          ✕
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
        <CurrentState ctx={ctx} pokemon={p} />

        {p.busy && (
          <p className="rounded-md border-2 border-sky-700 bg-sky-50 px-3 py-2 text-sm text-sky-800 dark:border-sky-400 dark:bg-sky-950 dark:text-sky-300">
            Le Pokémon doit être disponible (ni en activité) pour recevoir un objet.
          </p>
        )}
        {done && <StatusPill tone="ok" text={done} />}
        {!!use.error && <StatusPill tone="bad" text={errorText(use.error)} />}

        {items.length === 0 && (
          <p className="text-sm text-slate-500">Aucun objet utilisable sur ce Pokémon.</p>
        )}
        {ITEM_GROUPS.map(({ type, title }) => {
          const group = items.filter((i) => i.options.effect.type === type);
          if (group.length === 0) return null;
          return (
            <CollapsibleSheetSection
              key={type}
              id={`pc.items.${type}`}
              title={title}
              aside={
                <span className="pixel-label text-[9px] text-slate-500">
                  {type === 'mint'
                    ? `${group.length} Aromate${group.length > 1 ? 's' : ''}`
                    : `${group.length} objet${group.length > 1 ? 's' : ''}`}
                </span>
              }
            >
              {type === 'mint' ? (
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {group.map((item) => (
                    <MintTile
                      key={item.itemId}
                      ctx={ctx}
                      item={item}
                      disabled={disabled}
                      busyTitle={busyTitle}
                      onUse={() => run(item)}
                    />
                  ))}
                </ul>
              ) : (
                <ul className="space-y-2">
                  {group.map((item) => (
                    <ItemRow
                      key={item.itemId}
                      ctx={ctx}
                      pokemon={p}
                      item={item}
                      stat={chosenStats[item.itemId]}
                      onStat={(stat) => setChosenStats((cur) => ({ ...cur, [item.itemId]: stat }))}
                      disabled={disabled}
                      busyTitle={busyTitle}
                      onUse={() => run(item)}
                    />
                  ))}
                </ul>
              )}
            </CollapsibleSheetSection>
          );
        })}
      </div>
    </Modal>
  );
}

/** Rappel de ce que les objets changent : nature, talent, IV et bonheur du Pokémon. */
function CurrentState({ ctx, pokemon: p }: { ctx: GameContext; pokemon: PokemonDto }) {
  const species = ctx.species(p.speciesId, p.formId);
  const nature = getNature(p.nature);
  const natureUp =
    nature?.increasedStat && nature.increasedStat !== nature.decreasedStat
      ? nature.increasedStat
      : undefined;
  const ivTotal = STAT_NAMES.reduce((sum, s) => sum + p.ivs[s], 0);
  return (
    <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
      <InfoCell
        label="Nature"
        value={natureLabel(p.nature)}
        sub={
          natureUp ? `+${STAT_LABELS[natureUp]}, −${STAT_LABELS[nature!.decreasedStat!]}` : 'Neutre'
        }
      />
      <InfoCell
        label="Talent"
        value={abilityLabel(effectiveAbility(ctx, p))}
        sub={species?.abilities.find((a) => a.name === p.ability)?.isHidden ? 'Caché' : undefined}
      />
      <InfoCell label="IV" value={`${ivTotal} / ${MAX_IV * 6}`} />
      <InfoCell label="Bonheur" value={`${p.happiness} / 255`} />
    </dl>
  );
}

/** Stats que change une nature (augmentée, baissée), ou « Neutre ». */
function natureStats(natureId: string) {
  const n = getNature(natureId);
  if (!n?.increasedStat || n.increasedStat === n.decreasedStat) {
    return <span className="text-slate-500">Neutre</span>;
  }
  return (
    <>
      <span className="text-red-600 dark:text-red-400">▲ {STAT_LABELS[n.increasedStat]}</span>{' '}
      <span className="text-sky-700 dark:text-sky-400">▼ {STAT_LABELS[n.decreasedStat!]}</span>
    </>
  );
}

/**
 * Un objet de la popin : son effet (ou pourquoi il ne ferait rien) et « Utiliser ». Une Capsule
 * « 1 IV au choix » demande d'abord l'IV à monter (`stat`).
 */
function ItemRow({
  ctx,
  pokemon: p,
  item,
  stat,
  onStat,
  disabled,
  busyTitle,
  onUse,
}: {
  ctx: GameContext;
  pokemon: PokemonDto;
  item: UsableItem;
  stat: StatName | undefined;
  onStat: (stat: StatName) => void;
  disabled: boolean;
  /** Raison du bouton grisé quand le Pokémon est occupé. */
  busyTitle: string | undefined;
  onUse: () => void;
}) {
  const { itemId, quantity, options } = item;
  const { effect } = options;
  const needsStat = effect.type === 'ivCap' && !effect.all;
  const ready = options.usable && (!needsStat || !!stat);
  return (
    <li
      className={`flex flex-wrap items-center gap-3 rounded-md border-2 border-well-line p-2 ${
        options.usable ? 'bg-well' : 'border-dashed'
      }`}
    >
      <img
        src={itemIcon(ctx, itemId)}
        alt=""
        width={32}
        height={32}
        className={`shrink-0 [image-rendering:pixelated] ${options.usable ? '' : 'opacity-50 grayscale'}`}
      />
      <div className="min-w-0 flex-1 basis-48">
        <p className="font-semibold">
          {itemName(ctx, itemId)}{' '}
          <span className="font-mono text-sm font-normal text-slate-500">× {quantity}</span>
        </p>
        <p className="text-xs text-slate-500">
          {options.usable ? itemEffectText(item) : uselessReason(item)}
        </p>
        {options.usable && options.abilities.length > 0 && (
          <p className="text-xs text-emerald-700 dark:text-emerald-400">
            {options.abilities.length > 1 ? 'Au hasard : ' : 'Talent obtenu : '}
            {options.abilities.map(abilityLabel).join(' ou ')}
          </p>
        )}
      </div>
      {options.usable && (
        <button
          className="btn-primary ml-auto shrink-0 max-sm:w-full"
          disabled={!ready || disabled}
          title={busyTitle ?? (needsStat && !stat ? 'Choisis d’abord l’IV à monter' : undefined)}
          onClick={onUse}
        >
          Utiliser
        </button>
      )}
      {options.usable && needsStat && (
        <div className="w-full">
          <p className="mb-1 text-xs text-slate-500">IV à monter à {MAX_IV} :</p>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
            {STAT_NAMES.map((s) => {
              const maxed = p.ivs[s] >= MAX_IV;
              const selected = stat === s;
              return (
                <button
                  key={s}
                  type="button"
                  disabled={maxed}
                  aria-pressed={selected}
                  onClick={() => onStat(s)}
                  className={`flex flex-col items-center rounded-md border-2 px-1 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-45 ${
                    selected
                      ? SELECTED_CELL
                      : 'border-well-line bg-white hover:border-slate-400 dark:bg-slate-900'
                  }`}
                >
                  <span className="font-semibold">{STAT_LABELS[s]}</span>
                  <span
                    className={`font-mono ${maxed ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500'}`}
                  >
                    {p.ivs[s]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </li>
  );
}

/** Un Aromate : la nature qu'il donne et ses stats ; celui de la nature actuelle est surligné. */
function MintTile({
  ctx,
  item,
  disabled,
  busyTitle,
  onUse,
}: {
  ctx: GameContext;
  item: UsableItem;
  disabled: boolean;
  busyTitle: string | undefined;
  onUse: () => void;
}) {
  const { itemId, quantity, options } = item;
  const { effect } = options;
  if (effect.type !== 'mint') return null;
  return (
    <li
      className={`flex flex-col gap-1 rounded-md border-2 p-2 text-sm ${
        options.usable ? 'border-well-line bg-well' : SELECTED_CELL
      }`}
    >
      <div className="flex items-center gap-1.5">
        <img
          src={itemIcon(ctx, itemId)}
          alt=""
          width={24}
          height={24}
          className="shrink-0 [image-rendering:pixelated]"
        />
        <span className="min-w-0 truncate font-semibold">{natureLabel(effect.nature)}</span>
        <span className="ml-auto shrink-0 font-mono text-xs text-slate-500">× {quantity}</span>
      </div>
      <p className="text-xs">{natureStats(effect.nature)}</p>
      {options.usable ? (
        <button
          className="btn-primary mt-auto w-full py-1.5"
          disabled={disabled}
          title={busyTitle}
          onClick={onUse}
        >
          Utiliser
        </button>
      ) : (
        <p className="pixel-label mt-auto py-1.5 text-center text-[8px] text-amber-800 dark:text-[#f8d878]">
          ▶ Nature actuelle
        </p>
      )}
    </li>
  );
}
