import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Region } from '@poke/content';
import type { GameContext } from '@poke/game-core';
import { PokemonSprite, TypeBadge } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { PLAYER_STATE_KEYS, chooseRegionStarter, refresh } from '../../lib/queries';
import { errorMessage } from '../../lib/labels';

/**
 * Choix du starter d'une région suivante, dès qu'elle est débloquée : seuls les Pokémon de son
 * Pokédex y partent en expédition, ce premier compagnon ouvre donc la région.
 */
export function RegionStarterCard({ ctx, region }: { ctx: GameContext; region: Region }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<number | null>(null);
  const choose = useMutation({
    mutationFn: (speciesId: number) => chooseRegionStarter(region.id, speciesId),
    onSuccess: () => refresh(queryClient, ...PLAYER_STATE_KEYS),
  });

  return (
    <div className="card mb-3 p-4 ring-2 ring-brand-500/40">
      <h3 className="font-semibold">Bienvenue à {region.name} !</h3>
      <p className="mt-1 text-sm text-slate-500">
        Seuls les Pokémon du Pokédex de {region.name} peuvent explorer ses zones et affronter ses
        dresseurs. Choisis ton premier compagnon de la région.
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {region.starterSpeciesIds.map((id) => {
          const species = ctx.species(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => setSelected(id)}
              className={`flex flex-col items-center gap-1 rounded-xl border p-2 text-sm transition ${
                selected === id
                  ? 'border-brand-500 bg-brand-500/10'
                  : 'border-slate-200 hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800'
              }`}
            >
              <PokemonSprite
                priority
                speciesId={id}
                kind="artwork"
                size={80}
                alt={species?.nameFr}
              />
              <span className="font-medium">{species?.nameFr}</span>
              <span className="flex gap-1">
                {species?.types.map((t) => (
                  <TypeBadge key={t} type={t} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
      {choose.error && (
        <p className="mt-2 text-sm text-red-600">
          {choose.error instanceof ApiError ? errorMessage(choose.error.code) : 'Erreur inconnue'}
        </p>
      )}
      <button
        className="btn-primary mt-3"
        disabled={selected === null || choose.isPending}
        onClick={() => selected !== null && choose.mutate(selected)}
      >
        {selected ? `Choisir ${ctx.species(selected)?.nameFr}` : 'Choisis un Pokémon'}
      </button>
    </div>
  );
}
