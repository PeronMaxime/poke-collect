/**
 * État de la fenêtre de dépôt à la pension : place visée, Pokémon et objet choisis, compatibilité
 * du couple et dépôt.
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { checkBreedingPair, inheritanceRules } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type {
  CollectEggsResponse,
  DaycareDto,
  PokemonDto,
  SetDaycareParentInput,
} from '@poke/shared';
import { useNow } from '../../../components/ui';
import {
  isUsable,
  keys,
  refresh,
  setDaycareParent,
  useInventory,
  usePokemon,
} from '../../../lib/queries';
import { speciesName } from '../../../lib/labels';
import type { StatusTone } from '../../common/dialogParts';
import { GENDER_LABELS, eggGroupName, heldOf } from './parts';
import { boxEntries, useBoxFilters } from './boxFilters';

/** Ce que reçoit la fenêtre de dépôt. */
export interface DepositDialogProps {
  ctx: GameContext;
  /** Pension choisie (son assistant agira sur le couple). */
  slotIndex: number;
  /**
   * Place du Pokémon dans la pension (0 ou 1). Si l'autre place est libre, la fenêtre passe
   * ensuite à celle-ci pour lui choisir un partenaire, parmi les compatibles.
   */
  side: 0 | 1;
  /** Pension telle qu'elle est (partenaire, Pokémon remplacé). */
  pension?: DaycareDto;
  /** Après le dépôt : XP du Pokémon remplacé, œufs couvés. */
  onDeposited?: (res: CollectEggsResponse) => void;
  onClose: () => void;
}

/** Tout ce qu'affichent les pièces de la fenêtre de dépôt. */
export type DepositModel = ReturnType<typeof useDepositDialog>;

/**
 * Fenêtre de dépôt : après le dépôt d'un Pokémon dans une pension vide, elle passe à l'autre place
 * (`pairing`) pour lui choisir un partenaire parmi les compatibles.
 */
export function useDepositDialog({
  ctx,
  slotIndex,
  side: initialSide,
  pension,
  onDeposited,
  onClose,
}: DepositDialogProps) {
  const queryClient = useQueryClient();
  const pokemon = usePokemon();
  const inventory = useInventory();
  const all = pokemon.data ?? [];
  const [side, setSide] = useState(initialSide);
  /** Pokémon qui vient d'entrer seul dans la pension : on lui choisit maintenant un partenaire. */
  const [pairing, setPairing] = useState<PokemonDto | null>(null);
  const sideId = (s: 0 | 1) => (pension ? (s === 0 ? pension.parentAId : pension.parentBId) : null);
  const currentId = sideId(side);
  const partnerId = sideId(side === 0 ? 1 : 0);
  const current = all.find((p) => p.id === currentId);
  const partner = all.find((p) => p.id === partnerId);
  const partnerItem = heldOf(pension, side === 0 ? 1 : 0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [item, setItem] = useState<string | null>(heldOf(pension, side));
  const [view, setView] = useState<'box' | 'pension'>('box');
  const filters = useBoxFilters(chosen);
  const { resetFilters, setOnlyCompatible } = filters;

  const deposit = useMutation({
    mutationFn: (input: SetDaycareParentInput) => setDaycareParent(slotIndex, side, input),
    onSuccess: async (res, input) => {
      const deposited = all.find((p) => p.id === input.pokemonId) ?? null;
      // L'autre place était libre : on enchaîne sur le choix de son partenaire.
      const choosePartner = !partnerId && deposited !== null;
      await refresh(queryClient, keys.daycare, keys.pokemon, keys.inventory);
      onDeposited?.(res);
      if (!choosePartner) {
        onClose();
        return;
      }
      setSide(side === 0 ? 1 : 0);
      setPairing(deposited);
      setChosen(null);
      setItem(null);
      resetFilters();
      setOnlyCompatible(true);
      setView('box');
    },
  });

  const now = useNow(10_000);
  // Un Pokémon Méga-Évolué n'entre pas en pension (il transmettrait sa forme Méga). Les Pokémon
  // qui ne peuvent pas avoir d'œuf y entrent quand même, pour gagner de l'XP.
  const usable = all.filter(
    (p) => isUsable(p, now) && !p.megaStone && p.id !== partnerId && p.id !== currentId,
  );
  const picked = usable.find((p) => p.id === chosen);
  const groupsInPc = [
    ...new Set(usable.flatMap((p) => ctx.species(p.speciesId, p.formId)!.eggGroups)),
  ].sort((x, y) => eggGroupName(x).localeCompare(eggGroupName(y)));
  const available = boxEntries(ctx, usable, partner, chosen, filters);

  // Le couple dans l'ordre de la pension (parent A, parent B).
  const couple = side === 0 ? [picked, partner] : [partner, picked];
  const check = picked && partner ? checkBreedingPair(ctx, couple[0]!, couple[1]!) : null;
  const owned = new Map(inventory.data?.map((i) => [i.itemId, i.quantity]));
  // Objet tenu par le Pokémon remplacé : rendu au changement, donc utilisable.
  const oldItem = heldOf(pension, side);
  if (oldItem) owned.set(oldItem, (owned.get(oldItem) ?? 0) + 1);
  const breedingItems = ctx.content.items.filter(
    (i) =>
      (ctx.itemEffect(i.id, 'breedingIvs') || ctx.itemEffect(i.id, 'breedingNature')) &&
      (owned.get(i.id) ?? 0) > 0,
  );
  const rules = inheritanceRules(ctx, side === 0 ? [item, partnerItem] : [partnerItem, item]);

  function pick(p: PokemonDto) {
    setChosen((id) => (id === p.id ? null : p.id));
  }

  const name = (p: PokemonDto) => speciesName(ctx, p.speciesId, p.formId);
  const partnerLabel = partner ? `${name(partner)} ${GENDER_LABELS[partner.gender]}`.trim() : '';
  const status: { tone: StatusTone; text: string } = !picked
    ? { tone: 'idle', text: 'Choisis un Pokémon' }
    : check?.ok
      ? { tone: 'ok', text: `Œufs de ${speciesName(ctx, check.eggSpeciesId)}` }
      : check
        ? { tone: 'idle', text: 'Pas d’œuf : XP seulement' }
        : { tone: 'ok', text: 'Gagnera de l’XP' };
  const actionLabel = current ? 'Changer' : 'Déposer';

  return {
    ctx,
    slotIndex,
    onClose,
    pairing,
    current,
    partner,
    partnerItem,
    chosen,
    item,
    setItem,
    view,
    setView,
    deposit,
    ...filters,
    usable,
    picked,
    groupsInPc,
    available,
    check,
    owned,
    breedingItems,
    rules,
    pick,
    name,
    partnerLabel,
    status,
    actionLabel,
  };
}
