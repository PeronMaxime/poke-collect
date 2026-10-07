import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createProfileInputSchema } from '@poke/shared';
import type { PlayerProfileDto } from '@poke/shared';
import { ApiError, api } from '../lib/api';

const ERRORS: Record<string, string> = {
  TRAINER_NAME_TAKEN: 'Ce nom de dresseur est déjà pris.',
  PROFILE_EXISTS: 'Ton profil existe déjà.',
};

export function CreateProfilePage() {
  const queryClient = useQueryClient();
  const [trainerName, setTrainerName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (name: string) =>
      api<PlayerProfileDto>('/api/profile', { method: 'POST', json: { trainerName: name } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
    onError: (err) =>
      setError(err instanceof ApiError ? (ERRORS[err.code] ?? err.code) : 'Erreur inconnue'),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = createProfileInputSchema.safeParse({ trainerName });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Nom invalide');
      return;
    }
    setError(null);
    create.mutate(parsed.data.trainerName);
  }

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <form onSubmit={onSubmit} className="card w-full max-w-sm space-y-4">
        <div>
          <h1 className="text-xl font-bold">Bienvenue, nouveau dresseur !</h1>
          <p className="mt-1 text-sm text-slate-500">Choisis le nom qui apparaîtra dans le jeu.</p>
        </div>
        <label className="block text-sm">
          Nom de dresseur
          <input
            className="input mt-1"
            value={trainerName}
            maxLength={16}
            autoFocus
            onChange={(e) => setTrainerName(e.target.value)}
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={create.isPending}>
          Commencer l’aventure
        </button>
      </form>
    </main>
  );
}
