import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import type { PlayerProfileDto, PokemonDto } from '@poke/shared';
import { PokemonSprite, TypeBadge } from '../components/ui';
import { ApiError, api } from '../lib/api';
import { PLAYER_STATE_KEYS, useGameContext } from '../lib/game';
import { GAME_ERRORS } from '../lib/labels';

/** Choix du premier Pokémon parmi les starters de la région de départ (contenu publié). */
export function StarterPage({ profile }: { profile: PlayerProfileDto }) {
  const queryClient = useQueryClient();
  const ctx = useGameContext();
  const [selected, setSelected] = useState<number | null>(null);
  const region = ctx?.region(profile.regionUnlocked);

  const choose = useMutation({
    mutationFn: (speciesId: number) =>
      api<PokemonDto>('/api/starter', { method: 'POST', json: { speciesId } }),
    onSuccess: () =>
      Promise.all(
        [['me'], ...PLAYER_STATE_KEYS].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ),
  });

  if (!ctx)
    return <div className="grid min-h-screen place-items-center text-slate-500">Chargement…</div>;
  const starters = region?.starterSpeciesIds ?? [];

  return (
    <main className="mx-auto grid min-h-screen max-w-3xl content-center px-4 py-10">
      <h1 className="text-center text-2xl font-bold">
        Bienvenue à {region?.name}, {profile.trainerName} !
      </h1>
      <p className="mt-2 text-center text-slate-500">
        Choisis le Pokémon qui t’accompagnera dans tes premières expéditions.
      </p>

      {starters.length === 0 ? (
        <p className="card mt-8 text-center text-sm text-slate-500">
          Aucun starter n’est configuré pour cette région. Un administrateur doit en ajouter dans le
          panneau d’admin (Régions).
        </p>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {starters.map((id) => {
            const species = ctx.species(id);
            const active = selected === id;
            return (
              <motion.button
                key={id}
                type="button"
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setSelected(id)}
                className={`card flex cursor-pointer flex-col items-center gap-2 p-4 transition ${
                  active ? 'ring-4 ring-brand-500/60' : ''
                }`}
              >
                <PokemonSprite speciesId={id} kind="artwork" size={140} alt={species?.nameFr} />
                <span className="text-lg font-semibold">{species?.nameFr}</span>
                <span className="flex gap-1">
                  {species?.types.map((t) => (
                    <TypeBadge key={t} type={t} />
                  ))}
                </span>
              </motion.button>
            );
          })}
        </div>
      )}

      {choose.error && (
        <p className="mt-4 text-center text-sm text-red-600">
          {choose.error instanceof ApiError
            ? (GAME_ERRORS[choose.error.code] ?? choose.error.code)
            : 'Erreur inconnue'}
        </p>
      )}
      <button
        className="btn-primary mx-auto mt-8 px-8"
        disabled={selected === null || choose.isPending}
        onClick={() => selected !== null && choose.mutate(selected)}
      >
        {selected ? `Choisir ${ctx.species(selected)?.nameFr}` : 'Choisis un Pokémon'}
      </button>
    </main>
  );
}
