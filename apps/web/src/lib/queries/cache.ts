import type { QueryClient } from '@tanstack/react-query';
import type { CandyDto, InventoryEntryDto, PokemonDto } from '@poke/shared';
import { keys, refresh } from './keys';

/**
 * Retouches du cache après une action dont la réponse suffit : la liste des Pokémon, les Bonbons
 * et le Sac sont corrigés sur place au lieu d'être relus (la collection peut être longue).
 */

/** Remplace un Pokémon dans la liste en cache (la réponse de l'action le renvoie à jour). */
export function patchPokemon(queryClient: QueryClient, updated: PokemonDto) {
  queryClient.setQueryData<PokemonDto[]>(keys.pokemon, (list) =>
    list?.map((p) => (p.id === updated.id ? updated : p)),
  );
}

/** Retire des Pokémon de la liste en cache (transférés). */
function removePokemon(queryClient: QueryClient, ids: Iterable<string>) {
  const gone = new Set(ids);
  queryClient.setQueryData<PokemonDto[]>(keys.pokemon, (list) =>
    list?.filter((p) => !gone.has(p.id)),
  );
}

/** Ajoute des Bonbons gagnés aux totaux en cache. */
export function addCandies(queryClient: QueryClient, gained: readonly CandyDto[]) {
  queryClient.setQueryData<CandyDto[]>(keys.candies, (list) => {
    if (!list) return list;
    const next = new Map(list.map((c) => [c.lineageId, c.quantity]));
    for (const g of gained) next.set(g.lineageId, (next.get(g.lineageId) ?? 0) + g.quantity);
    return [...next].map(([lineageId, quantity]) => ({ lineageId, quantity }));
  });
}

/** Fixe la quantité d'un objet du sac (le serveur renvoie ce qu'il reste). */
export function setItemQuantity(queryClient: QueryClient, itemId: string, quantity: number) {
  queryClient.setQueryData<InventoryEntryDto[]>(keys.inventory, (list) => {
    if (!list) return list;
    return list.some((i) => i.itemId === itemId)
      ? list.map((i) => (i.itemId === itemId ? { ...i, quantity } : i))
      : [...list, { itemId, quantity }];
  });
}

/**
 * Après un transfert : retire les Pokémon et ajoute les Bonbons sans relire la collection. Le
 * sac n'est relu que si une Méga-Gemme tenue y est revenue ; les équipes enregistrées filtrent
 * elles-mêmes les Pokémon disparus.
 */
export function applyTransfer(
  queryClient: QueryClient,
  transferred: readonly PokemonDto[],
  gained: readonly CandyDto[],
) {
  removePokemon(
    queryClient,
    transferred.map((p) => p.id),
  );
  addCandies(queryClient, gained);
  return refresh(
    queryClient,
    keys.teams,
    keys.trainerCard,
    ...(transferred.some((p) => p.megaStone) ? [keys.inventory] : []),
  );
}
