import { useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'motion/react';
import { STAT_NAMES } from '@poke/data';
import { MAX_IV } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type { HatchEggsResponse, PokemonDto } from '@poke/shared';
import { Egg, Modal, PokemonSprite, ShinySparkles, ShinyStar } from '../../components/ui';
import { TagPicker } from '../../components/tags';
import { api } from '../../lib/api';
import { keys, usePokemon } from '../../lib/game';
import { errorText, natureLabel, speciesName } from '../../lib/labels';

const STEP = 0.5; // secondes entre deux éclosions

interface RevealOptions {
  /** Titre selon le nombre de Pokémon ; par défaut « N œufs éclos ! ». */
  title?: (count: number) => string;
  /** Ce qui tremble puis disparaît avant chaque Pokémon ; par défaut un œuf. */
  cover?: ReactNode;
}

/**
 * Éclosion animée : chaque œuf tremble, se brise, puis révèle son Pokémon. Sert aussi au Musée
 * (fossiles restaurés), avec un autre titre et une autre image.
 */
export function HatchReveal({
  ctx,
  data,
  onClose,
  ...options
}: {
  ctx: GameContext;
  data: HatchEggsResponse | null;
  onClose: () => void;
} & RevealOptions) {
  return (
    <Modal open={!!data} onClose={onClose} wide>
      {data && <HatchContent ctx={ctx} data={data} onClose={onClose} {...options} />}
    </Modal>
  );
}

const eggTitle = (n: number) => `${n} œuf${n > 1 ? 's' : ''} éclo${n > 1 ? 's' : ''} !`;

function HatchContent({
  ctx,
  data,
  onClose,
  title = eggTitle,
  cover = <Egg size={64} />,
}: {
  ctx: GameContext;
  data: HatchEggsResponse;
  onClose: () => void;
} & RevealOptions) {
  const reduced = useReducedMotion();
  const [skipped, setSkipped] = useState(false);
  const instant = reduced || skipped;
  // « Nouveau ! » sur le premier Pokémon de chaque nouvelle espèce seulement.
  const newSpecies = new Set(data.newSpeciesIds);
  const firstNew = new Set(
    data.hatched.filter((p) => newSpecies.delete(p.speciesId)).map((p) => p.id),
  );
  const delay = (i: number) => (instant ? 0 : 0.6 + i * STEP);
  // État à jour (favori, étiquettes) une fois le PC rechargé ; sinon celui de l'éclosion.
  const pokemon = usePokemon();
  const current = new Map(pokemon.data?.map((p) => [p.id, p]));

  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-xl font-bold">{title(data.hatched.length)}</h2>
        {!instant && (
          <button
            className="text-sm text-slate-500 hover:underline"
            onClick={() => setSkipped(true)}
          >
            Tout afficher
          </button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {data.hatched.map((p, i) => {
          const perfect = STAT_NAMES.filter((s) => p.ivs[s] === MAX_IV).length;
          const total = STAT_NAMES.reduce((sum, s) => sum + p.ivs[s], 0);
          return (
            <div
              key={p.id}
              className={`relative flex min-h-36 flex-col items-center justify-center rounded-xl border p-2 text-center text-xs ${
                p.isShiny
                  ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/40'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              {!instant && (
                <motion.div
                  className="absolute"
                  initial={{ opacity: 1, rotate: 0 }}
                  animate={{ rotate: [0, -12, 12, -8, 8, 0], opacity: [1, 1, 1, 1, 1, 0] }}
                  transition={{ delay: delay(i) - 0.6, duration: 0.6 }}
                >
                  {cover}
                </motion.div>
              )}
              <motion.div
                className="flex flex-col items-center"
                initial={instant ? false : { opacity: 0, scale: 0.4 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: delay(i), type: 'spring', stiffness: 260, damping: 16 }}
              >
                {firstNew.has(p.id) && (
                  <span className="rounded-full bg-brand-500 px-1.5 text-[10px] font-bold text-white">
                    Nouveau !
                  </span>
                )}
                <span className="relative">
                  {p.isShiny && <ShinySparkles delay={delay(i)} loop />}
                  <PokemonSprite
                    speciesId={p.speciesId}
                    formId={p.formId}
                    shiny={p.isShiny}
                    size={72}
                  />
                </span>
                <span className="font-medium">
                  {speciesName(ctx, p.speciesId, p.formId)} {p.isShiny && <ShinyStar />}
                </span>
                <span className="text-slate-500">{natureLabel(p.nature)}</span>
                <span className={perfect >= 3 ? 'font-semibold text-amber-600' : 'text-slate-500'}>
                  IV {total} / {MAX_IV * 6}
                  {perfect > 0 && ` · ${perfect} × 31`}
                </span>
                <NewbornActions pokemon={current.get(p.id) ?? p} />
              </motion.div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 text-right">
        <button className="btn-primary" onClick={onClose}>
          Continuer
        </button>
      </div>
    </div>
  );
}

/** Favori et étiquettes directement depuis l'éclosion, sans passer par le PC. */
function NewbornActions({ pokemon: p }: { pokemon: PokemonDto }) {
  const queryClient = useQueryClient();
  const toggleLock = useMutation({
    mutationFn: () =>
      api<PokemonDto>(`/api/pokemon/${p.id}`, { method: 'PATCH', json: { locked: !p.locked } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.pokemon }),
  });
  return (
    <>
      <button
        type="button"
        className={`mt-1 rounded-full px-2 py-0.5 transition hover:bg-slate-100 dark:hover:bg-slate-800 ${
          p.locked ? 'text-amber-500' : 'text-slate-500'
        }`}
        disabled={toggleLock.isPending}
        onClick={() => toggleLock.mutate()}
        title={p.locked ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      >
        {p.locked ? '♥ Favori' : '♡ Favori'}
      </button>
      {toggleLock.error && <p className="text-red-600">{errorText(toggleLock.error)}</p>}
      <TagPicker pokemon={p} compact />
    </>
  );
}
