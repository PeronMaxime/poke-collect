import { QueryClient } from '@tanstack/react-query';
import type { CandyDto, InventoryEntryDto, PokemonDto } from '@poke/shared';
import { describe, expect, it } from 'vitest';
import {
  PLAYER_STATE_KEYS,
  addCandies,
  applyTransfer,
  keys,
  patchPokemon,
  refresh,
  setItemQuantity,
} from './game';

const mon = (id: string, extra: Partial<PokemonDto> = {}) =>
  ({ id, speciesId: 1, level: 5, megaStone: null, ...extra }) as PokemonDto;

function clientWith(pokemon: PokemonDto[]) {
  const client = new QueryClient();
  client.setQueryData(keys.pokemon, pokemon);
  client.setQueryData<CandyDto[]>(keys.candies, [{ lineageId: 1, quantity: 10 }]);
  client.setQueryData<InventoryEntryDto[]>(keys.inventory, [{ itemId: 'potion', quantity: 3 }]);
  return client;
}

/** Données marquées périmées (rechargées au prochain affichage ou tout de suite si affichées). */
const invalidated = (client: QueryClient) =>
  [...PLAYER_STATE_KEYS, keys.teams]
    .filter((key) => client.getQueryState(key)?.isInvalidated)
    .map((key) => key[0]);

describe('mises à jour du cache après une action', () => {
  it('remplace un Pokémon sans relire la collection', () => {
    const client = clientWith([mon('a'), mon('b')]);
    patchPokemon(client, mon('b', { level: 9 }));
    expect(client.getQueryData<PokemonDto[]>(keys.pokemon)?.map((p) => p.level)).toEqual([5, 9]);
    expect(invalidated(client)).toEqual([]);
  });

  it('un transfert retire les Pokémon, ajoute les Bonbons et ne recharge ni le sac ni le profil', async () => {
    const client = clientWith([mon('a'), mon('b'), mon('c')]);
    await applyTransfer(
      client,
      [mon('a'), mon('c')],
      [
        { lineageId: 1, quantity: 4 },
        { lineageId: 2, quantity: 1 },
      ],
    );
    expect(client.getQueryData<PokemonDto[]>(keys.pokemon)?.map((p) => p.id)).toEqual(['b']);
    expect(client.getQueryData<CandyDto[]>(keys.candies)).toEqual([
      { lineageId: 1, quantity: 14 },
      { lineageId: 2, quantity: 1 },
    ]);
    expect(client.getQueryState(keys.inventory)?.isInvalidated).toBe(false);
    expect(client.getQueryState(keys.me)?.isInvalidated).not.toBe(true);
    expect(client.getQueryState(keys.pokemon)?.isInvalidated).toBe(false);
  });

  it('un transfert relit le sac quand une Méga-Gemme y revient', async () => {
    const client = clientWith([mon('a', { megaStone: 'mega-stone' }), mon('b')]);
    await applyTransfer(client, [mon('a', { megaStone: 'mega-stone' })], []);
    expect(client.getQueryState(keys.inventory)?.isInvalidated).toBe(true);
  });

  it('fixe la quantité d’un objet, créé s’il manquait', () => {
    const client = clientWith([]);
    setItemQuantity(client, 'potion', 1);
    setItemQuantity(client, 'ether', 2);
    expect(client.getQueryData(keys.inventory)).toEqual([
      { itemId: 'potion', quantity: 1 },
      { itemId: 'ether', quantity: 2 },
    ]);
  });

  it('ne crée pas de totaux de Bonbons tant qu’ils n’ont pas été chargés', () => {
    const client = new QueryClient();
    addCandies(client, [{ lineageId: 1, quantity: 4 }]);
    expect(client.getQueryData(keys.candies)).toBeUndefined();
  });

  it('refresh ne marque périmées que les données demandées', async () => {
    const client = clientWith([mon('a')]);
    await refresh(client, keys.pokemon, keys.candies);
    expect(invalidated(client)).toEqual(['pokemon', 'candies']);
  });
});
