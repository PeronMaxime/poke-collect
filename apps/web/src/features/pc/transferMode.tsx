/**
 * Mode transfert du PC : choisir plusieurs Pokémon dans la grille et les échanger contre des
 * Bonbons de lignée.
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isTransferableSpecies, transferCandies } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type { PokemonDto, TransferPokemonResponse } from '@poke/shared';
import { TRANSFER_BATCH_MAX } from '@poke/shared';
import { applyTransfer, keys, refresh, transferPokemon } from '../../lib/queries';
import { errorText, speciesName } from '../../lib/labels';
import { duplicates, loadDuplicateSettings } from './DuplicateSettings';
import type { PcEntry } from './PcBrowser';
import type { UseQueryResult } from '@tanstack/react-query';

/** Un Pokémon se transfère s'il n'est ni favori, ni occupé, ni légendaire ou fabuleux. */
export const canTransfer = (ctx: GameContext, p: PokemonDto) =>
  !p.locked && !p.busy && isTransferableSpecies(ctx, p.speciesId);

/**
 * Mode transfert : sélection dans la grille, doublons, confirmation quand le transfert retirerait
 * le dernier exemplaire d'une espèce, et le transfert lui-même, par lots. `pokemon` est tout le PC,
 * `filtered` ce que la grille affiche (les doublons ne sont cherchés que là).
 */
export function useTransferMode(
  ctx: GameContext,
  pokemon: Pick<UseQueryResult<PokemonDto[]>, 'data'>,
  filtered: readonly PcEntry[],
) {
  const [transferMode, setTransferMode] = useState(false);
  const [toTransfer, setToTransfer] = useState<Set<string>>(new Set());
  const [duplicateSettings, setDuplicateSettings] = useState(loadDuplicateSettings);
  const [duplicateSettingsOpen, setDuplicateSettingsOpen] = useState(false);
  // Transfert demandé alors qu'il retirerait le dernier exemplaire d'une espèce : à confirmer.
  const [confirmingLast, setConfirmingLast] = useState(false);
  const [transferResult, setTransferResult] = useState<TransferPokemonResponse | null>(null);
  const queryClient = useQueryClient();
  const transfer = useMutation({
    mutationFn: async (ids: string[]) => {
      // Par lots : l'API plafonne le nombre de Pokémon par requête.
      let transferred = 0;
      const gained = new Map<number, number>();
      for (let i = 0; i < ids.length; i += TRANSFER_BATCH_MAX) {
        const res = await transferPokemon(ids.slice(i, i + TRANSFER_BATCH_MAX));
        transferred += res.transferred;
        for (const g of res.gained)
          gained.set(g.lineageId, (gained.get(g.lineageId) ?? 0) + g.quantity);
      }
      return {
        transferred,
        gained: [...gained].map(([lineageId, quantity]) => ({ lineageId, quantity })),
      } satisfies TransferPokemonResponse;
    },
    onSuccess: (data, ids) => {
      setTransferResult(data);
      setToTransfer(new Set());
      setConfirmingLast(false);
      setTransferMode(false);
      // Collection et Bonbons mis à jour sur place : pas de relecture de tout le PC.
      const gone = new Set(ids);
      const list = queryClient.getQueryData<PokemonDto[]>(keys.pokemon) ?? [];
      return applyTransfer(
        queryClient,
        list.filter((p) => gone.has(p.id)),
        data.gained,
      );
    },
    // Les lots déjà passés sont transférés : on resynchronise le PC.
    onError: () => {
      setToTransfer(new Set());
      setConfirmingLast(false);
      return refresh(queryClient, keys.pokemon, keys.candies, keys.inventory, keys.teams);
    },
  });
  const transferList = (pokemon.data ?? []).filter((p) => toTransfer.has(p.id));
  const candiesGained = transferList.reduce((sum, p) => sum + transferCandies(ctx, p), 0);
  // Derniers exemplaires : espèces (et formes) dont tous les Pokémon possédés seraient transférés.
  const speciesKey = (p: PokemonDto) => `${p.speciesId}:${p.formId ?? ''}`;
  const keptKeys = new Set(
    (pokemon.data ?? []).filter((p) => !toTransfer.has(p.id)).map(speciesKey),
  );
  const lastCopies = transferList.filter(
    (p, i) =>
      !keptKeys.has(speciesKey(p)) &&
      transferList.findIndex((q) => speciesKey(q) === speciesKey(p)) === i,
  );

  function requestTransfer() {
    if (lastCopies.length > 0) setConfirmingLast(true);
    else transfer.mutate([...toTransfer]);
  }

  function selectDuplicates() {
    // Seulement parmi les Pokémon affichés (onglet, recherche et filtres en cours).
    const shown = filtered.map(({ p }) => p);
    setConfirmingLast(false);
    setToTransfer(new Set(duplicates(ctx, shown, duplicateSettings)));
  }

  function exitTransferMode() {
    setTransferMode(false);
    setToTransfer(new Set());
    setConfirmingLast(false);
  }

  function toggleTransfer(p: PokemonDto) {
    if (!canTransfer(ctx, p)) return;
    setConfirmingLast(false);
    setToTransfer((cur) => {
      const next = new Set(cur);
      if (next.has(p.id)) next.delete(p.id);
      else next.add(p.id);
      return next;
    });
  }

  return {
    transferMode,
    setTransferMode,
    toTransfer,
    setToTransfer,
    duplicateSettings,
    setDuplicateSettings,
    duplicateSettingsOpen,
    setDuplicateSettingsOpen,
    confirmingLast,
    setConfirmingLast,
    transferResult,
    setTransferResult,
    transfer,
    candiesGained,
    lastCopies,
    requestTransfer,
    selectDuplicates,
    exitTransferMode,
    toggleTransfer,
  };
}

/** État du mode transfert et ses actions. */
export type TransferMode = ReturnType<typeof useTransferMode>;

/**
 * Barre du mode transfert, collée au bas de l'écran pendant qu'on fait défiler la grille : la
 * sélection reste en vue. Fond rosé et liseré rouge (index.css, `.action-bar`) : elle se détache
 * des cartes en dessous.
 */
export function TransferBar({ ctx, mode }: { ctx: GameContext; mode: TransferMode }) {
  const {
    toTransfer,
    setToTransfer,
    setDuplicateSettingsOpen,
    confirmingLast,
    setConfirmingLast,
    transfer,
    candiesGained,
    lastCopies,
    requestTransfer,
    selectDuplicates,
    exitTransferMode,
  } = mode;
  return (
    <div className="card action-bar sticky bottom-2 z-10 mt-4 flex flex-col gap-2 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1">
          <strong>{toTransfer.size}</strong> sélectionné(s) · +{candiesGained} Bonbon
          {candiesGained > 1 ? 's' : ''} de lignée
          <span className="block text-xs text-slate-500">
            Favoris, légendaires, fabuleux et Pokémon occupés exclus.
          </span>
        </span>
        <div className="flex items-center">
          <button
            className="btn-ghost rounded-r-none"
            onClick={selectDuplicates}
            title="Parmi les Pokémon affichés (onglet, recherche et filtres en cours)"
          >
            Sélectionner les doublons
          </button>
          <button
            className="btn-ghost rounded-l-none border-l-0 px-2.5"
            onClick={() => setDuplicateSettingsOpen(true)}
            title="Régler le filtre des doublons"
            aria-label="Régler le filtre des doublons"
          >
            ⚙
          </button>
        </div>
        {toTransfer.size > 0 && (
          <button
            className="btn-ghost"
            onClick={() => {
              setToTransfer(new Set());
              setConfirmingLast(false);
            }}
          >
            Tout désélectionner
          </button>
        )}
        <span className="flex gap-2 sm:ml-2">
          <button className="btn-ghost" onClick={exitTransferMode}>
            Annuler
          </button>
          <button
            className="btn-danger"
            disabled={toTransfer.size === 0 || transfer.isPending}
            onClick={requestTransfer}
          >
            Transférer ({toTransfer.size})
          </button>
        </span>
      </div>
      {confirmingLast && lastCopies.length > 0 && (
        <div className="flex w-full flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          <span className="flex-1">
            ⚠ Tu transfères ton dernier exemplaire de :{' '}
            {lastCopies
              .slice(0, 5)
              .map((p) => speciesName(ctx, p.speciesId, p.formId))
              .join(', ')}
            {lastCopies.length > 5 && ` et ${lastCopies.length - 5} autre(s)`}. Ils resteront au
            Pokédex mais tu n'en auras plus aucun.
          </span>
          <button
            className="btn-danger py-1"
            disabled={transfer.isPending}
            onClick={() => transfer.mutate([...toTransfer])}
          >
            Transférer quand même
          </button>
          <button className="btn-ghost py-1" onClick={() => setConfirmingLast(false)}>
            Annuler
          </button>
        </div>
      )}
      {transfer.error && <p className="w-full text-red-600">{errorText(transfer.error)}</p>}
    </div>
  );
}
