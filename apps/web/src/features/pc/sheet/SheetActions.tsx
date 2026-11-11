/**
 * Barre d'actions de la fiche d'un Pokémon du PC : objets, Pokédex, transfert ou remise en liberté.
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  isTransferableSpecies,
  lineageId,
  releasableQuest,
  transferCandies,
} from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type { PokemonDto, TransferPokemonResponse } from '@poke/shared';
import {
  applyTransfer,
  keys,
  refresh,
  releaseLegendary,
  transferPokemon,
  useQuests,
} from '../../../lib/queries';
import { candyName, errorText, itemIcon } from '../../../lib/labels';
import type { UsableItem } from './ItemUseDialog';

/**
 * Se séparer d'un Pokémon depuis sa fiche : le transférer contre des Bonbons ou, pour un
 * légendaire (jamais transférable), relâcher le dernier capturé d'une quête, qui le propose alors
 * de nouveau. `blocked` dit pourquoi le bouton est grisé ; `confirmTransfer` : confirmation en cours.
 */
export function useSheetDisposal({
  ctx,
  pokemon: p,
  locked,
  onTransferred,
  onReleased,
}: {
  ctx: GameContext;
  pokemon: PokemonDto;
  /** Favori (affichage optimiste compris) : ni transfert ni remise en liberté. */
  locked: boolean;
  onTransferred: (data: TransferPokemonResponse) => void;
  /** Légendaire relâché (message à afficher dans le PC). */
  onReleased: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const species = ctx.species(p.speciesId, p.formId)!;
  const [confirmTransfer, setConfirmTransfer] = useState(false);
  const transfer = useMutation({
    mutationFn: () => transferPokemon([p.id]),
    onSuccess: async (data) => {
      onTransferred(data);
      await applyTransfer(queryClient, [p], data.gained);
    },
  });

  // Légendaire : pas de transfert, mais le dernier capturé d'une quête peut être relâché.
  const transferable = isTransferableSpecies(ctx, p.speciesId);
  const quests = useQuests();
  const releaseFrom = transferable
    ? undefined
    : releasableQuest(
        ctx,
        (quests.data?.quests ?? []).filter((q) => q.status === 'claimed'),
        p,
      );
  const releaseQuest = releaseFrom ? ctx.quest(releaseFrom.questId) : undefined;
  const releaseRoams = releaseQuest?.rewards.pokemon[releaseFrom!.pokemonIndex]?.roaming != null;
  // Capturé avant la réécriture des quêtes : le relâcher fait recommencer toute la quête.
  const releaseRestarts =
    releaseFrom !== undefined &&
    quests.data?.quests.find((q) => q.questId === releaseFrom.questId)?.restartOnRelease === true;
  const release = useMutation({
    mutationFn: () => releaseLegendary(p.id),
    onSuccess: async (data) => {
      onReleased(
        data.restarted
          ? `${species.nameFr} a été relâché : la quête « ${releaseQuest?.name ?? ''} » recommence depuis le début.`
          : releaseRoams
            ? `${species.nameFr} a été relâché : il erre de nouveau, à recroiser en expédition.`
            : `${species.nameFr} a été relâché : affronte-le de nouveau depuis l’onglet Quêtes.`,
      );
      await applyTransfer(queryClient, [p], []);
      await refresh(queryClient, keys.quests, keys.legendaryBattles, keys.expeditions);
    },
  });

  // Raison affichée à côté du bouton Transférer / Relâcher quand il est grisé.
  const verb = releaseQuest ? 'relâcher' : 'transférer';
  const blocked =
    !transferable && !releaseQuest
      ? 'Les légendaires et les fabuleux ne se transfèrent pas'
      : locked
        ? `Favori : retire-le des favoris pour le ${verb}`
        : p.busy
          ? 'Le Pokémon doit être disponible (ni en activité)'
          : undefined;
  const gain = transferCandies(ctx, p);
  const lineage = lineageId(ctx, p.speciesId);
  const candyLabel = lineage !== undefined ? candyName(ctx, lineage) : 'Bonbon';
  return {
    confirmTransfer,
    setConfirmTransfer,
    transfer,
    release,
    transferable,
    releaseQuest,
    releaseRoams,
    releaseRestarts,
    blocked,
    gain,
    candyLabel,
  };
}

/** Transfert ou remise en liberté d'un Pokémon, et leur état. */
type SheetDisposal = ReturnType<typeof useSheetDisposal>;

/**
 * Boutons de la fiche : « Objet », « Pokédex » et « Transférer » (ou « Relâcher »), à confirmer.
 */
export function SheetActions({
  ctx,
  pokemon,
  disposal,
  usable,
  onOpenItems,
  onOpenDex,
}: {
  ctx: GameContext;
  pokemon: PokemonDto;
  disposal: SheetDisposal;
  /** Objets du sac utilisables sur ce Pokémon. */
  usable: UsableItem[];
  onOpenItems: () => void;
  onOpenDex: () => void;
}) {
  const {
    setConfirmTransfer,
    transfer,
    release,
    transferable,
    releaseQuest,
    releaseRestarts,
    blocked,
    gain,
  } = disposal;
  if (disposal.confirmTransfer) {
    return <ConfirmDisposal ctx={ctx} pokemon={pokemon} disposal={disposal} />;
  }
  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      <button
        className="btn-ghost max-sm:flex-1"
        disabled={usable.length === 0}
        title={usable.length === 0 ? 'Aucun objet utilisable sur ce Pokémon' : undefined}
        onClick={onOpenItems}
      >
        {usable[0] && (
          <img
            src={itemIcon(ctx, usable[0].itemId)}
            alt=""
            width={20}
            height={20}
            className="-my-1 [image-rendering:pixelated]"
          />
        )}
        Objet{usable.length > 0 && ` (${usable.length})`}
      </button>
      <button
        className="btn-ghost max-sm:flex-1"
        onClick={onOpenDex}
        title="Fiche de l’espèce dans le Pokédex"
      >
        <img
          src={itemIcon(ctx, 'poke-ball')}
          alt=""
          width={20}
          height={20}
          className="-my-1 [image-rendering:pixelated]"
        />
        Pokédex
      </button>
      <span className="flex-1 max-sm:hidden" />
      {blocked && (
        <span className="text-xs text-slate-500 max-sm:order-last max-sm:w-full max-sm:text-center">
          {blocked}
        </span>
      )}
      <button
        className="btn-danger max-sm:w-full"
        disabled={!!blocked}
        title={
          releaseQuest
            ? releaseRestarts
              ? 'Aucun Bonbon : sa quête recommence depuis le début'
              : 'Aucun Bonbon : sa quête le propose de nouveau'
            : undefined
        }
        onClick={() => setConfirmTransfer(true)}
      >
        {releaseQuest
          ? 'Relâcher'
          : transferable
            ? `Transférer · ${gain} Bonbon${gain > 1 ? 's' : ''}`
            : 'Transférer'}
      </button>
      {(transfer.error ?? release.error) && (
        <p className="w-full text-xs text-red-600">{errorText(transfer.error ?? release.error)}</p>
      )}
    </div>
  );
}

/** Confirmation du transfert ou de la remise en liberté : ce que le joueur perd et gagne. */
function ConfirmDisposal({
  ctx,
  pokemon: p,
  disposal,
}: {
  ctx: GameContext;
  pokemon: PokemonDto;
  disposal: SheetDisposal;
}) {
  const {
    setConfirmTransfer,
    transfer,
    release,
    releaseQuest,
    releaseRoams,
    releaseRestarts,
    gain,
    candyLabel,
  } = disposal;
  const species = ctx.species(p.speciesId, p.formId)!;
  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      <p className="min-w-0 flex-1 basis-64 text-sm">
        {releaseQuest ? (
          <>
            <strong>Relâcher {species.nameFr} ?</strong> Aucun Bonbon :{' '}
            {releaseRestarts
              ? `capturé avant la nouvelle version de la quête « ${releaseQuest.name} », il ne reviendra qu’en la refaisant entièrement, depuis la première étape.`
              : releaseRoams
                ? `il recommence à errer (quête « ${releaseQuest.name} »), à recroiser et capturer en expédition.`
                : `il retourne à la quête « ${releaseQuest.name} », où tu pourras de nouveau l’affronter et tenter de le capturer.`}{' '}
            Ce Pokémon-ci (niveau, IV, chromatique) est perdu.
          </>
        ) : (
          <>
            <strong>Transférer {species.nameFr}</strong> contre {gain} × {candyLabel} ? C’est
            définitif.
          </>
        )}
      </p>
      <div className="flex gap-2 max-sm:w-full">
        <button className="btn-ghost max-sm:flex-1" onClick={() => setConfirmTransfer(false)}>
          Annuler
        </button>
        {releaseQuest ? (
          <button
            className="btn-danger max-sm:flex-1"
            disabled={release.isPending}
            onClick={() => release.mutate()}
          >
            Relâcher
          </button>
        ) : (
          <button
            className="btn-danger max-sm:flex-1"
            disabled={transfer.isPending}
            onClick={() => transfer.mutate()}
          >
            Transférer
          </button>
        )}
      </div>
    </div>
  );
}
