/**
 * Animation d'une évolution (ou d'une forme prise en tenant un objet : Méga-Évolution,
 * Primo-Résurgence…) : la silhouette alterne avec la nouvelle forme, puis la nouvelle espèce
 * apparaît.
 */
import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { getForm } from '@poke/data';
import type { GameContext } from '@poke/game-core';
import type { EvolveResponse } from '@poke/shared';
import { PokemonSprite, ShinyStar } from '../../components/ui';
import { newInDexTracker } from '../../lib/queries';
import { itemName, speciesName } from '../../lib/labels';

const MORPH_SECONDS = 2.4;

/**
 * Textes de l'animation : évolution, ou forme prise en tenant un objet (Méga-Évolution, autre
 * forme d'après le type de la nouvelle forme).
 */
function revealTexts(held: boolean, formId: number | null, from: string, to: string) {
  if (!held) return { during: `${from} évolue !`, after: `${from} a évolué en ${to} !` };
  if (formId !== null && getForm(formId)?.kind === 'mega') {
    return { during: `${from} méga-évolue !`, after: `${from} a méga-évolué en ${to} !` };
  }
  return { during: `${from} change de forme !`, after: `${from} est devenu ${to} !` };
}

/**
 * Évolution animée : l'ancien Pokémon pulse en silhouette lumineuse, alterne avec sa nouvelle
 * forme de plus en plus vite, puis la nouvelle espèce apparaît. Sert aussi aux formes tenues
 * (Méga-Évolution, objets de forme).
 */
export function EvolutionReveal({
  ctx,
  data,
  held = false,
  onDone,
}: {
  ctx: GameContext;
  data: EvolveResponse;
  /** Forme prise en tenant un objet (Méga-Gemme, objet de forme), qui n'est pas consommé. */
  held?: boolean;
  onDone: () => void;
}) {
  const reduced = useReducedMotion();
  const [done, setDone] = useState(!!reduced);
  const { pokemon } = data;
  const from = speciesName(ctx, data.fromSpeciesId, data.fromFormId);
  const to = speciesName(ctx, pokemon.speciesId, pokemon.formId);
  const texts = revealTexts(held, pokemon.formId, from, to);

  useEffect(() => {
    if (done) return;
    const timer = setTimeout(() => setDone(true), MORPH_SECONDS * 1000);
    return () => clearTimeout(timer);
  }, [done]);

  // Alternance ancienne / nouvelle forme qui accélère (silhouettes blanches).
  const flicker = [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1];
  const times = [0, 0.3, 0.45, 0.58, 0.68, 0.76, 0.82, 0.87, 0.91, 0.95, 1];

  return (
    <div className="flex flex-col items-center py-4 text-center">
      <p className="text-sm text-slate-500">
        {done ? 'Félicitations !' : `Quoi ? ${texts.during}`}
      </p>
      <div className="relative my-4 grid h-52 w-52 place-items-center">
        <motion.div
          className="absolute inset-0 rounded-full bg-sky-200/60 blur-2xl dark:bg-sky-500/20"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={done ? { scale: 1.3, opacity: [1, 0.4] } : { scale: [0.6, 1.1], opacity: 1 }}
          transition={{ duration: done ? 0.8 : MORPH_SECONDS }}
        />
        {!done ? (
          <>
            <motion.div
              className="absolute"
              animate={{ opacity: flicker.map((v) => 1 - v) }}
              transition={{ duration: MORPH_SECONDS, times, ease: 'linear' }}
            >
              <PokemonSprite
                priority
                speciesId={data.fromSpeciesId}
                formId={data.fromFormId}
                shiny={pokemon.isShiny}
                kind="artwork"
                size={180}
                className="brightness-0 invert"
              />
            </motion.div>
            <motion.div
              className="absolute"
              initial={{ opacity: 0 }}
              animate={{ opacity: flicker }}
              transition={{ duration: MORPH_SECONDS, times, ease: 'linear' }}
            >
              <PokemonSprite
                priority
                speciesId={pokemon.speciesId}
                formId={pokemon.formId}
                shiny={pokemon.isShiny}
                kind="artwork"
                size={180}
                className="brightness-0 invert"
              />
            </motion.div>
          </>
        ) : (
          <motion.div
            className="absolute"
            initial={reduced ? false : { scale: 0.6, opacity: 0, filter: 'brightness(4)' }}
            animate={{ scale: 1, opacity: 1, filter: 'brightness(1)' }}
            transition={{ type: 'spring', stiffness: 220, damping: 14 }}
          >
            <PokemonSprite
              priority
              speciesId={pokemon.speciesId}
              formId={pokemon.formId}
              shiny={pokemon.isShiny}
              kind="artwork"
              size={180}
            />
          </motion.div>
        )}
      </div>
      <motion.div
        initial={false}
        animate={{ opacity: done ? 1 : 0, y: done ? 0 : 8 }}
        className="space-y-1"
      >
        <h2 className="text-xl font-bold">
          {texts.after} {pokemon.isShiny && <ShinyStar />}
        </h2>
        {newInDexTracker(data)(pokemon) && (
          <p>
            <span className="rounded-full bg-brand-500 px-2 py-0.5 text-xs font-bold text-white">
              Nouveau au Pokédex !
            </span>
          </p>
        )}
        {data.consumedItemId && (
          <p className="text-xs text-slate-500">
            {held
              ? `${to} tient : ${itemName(ctx, data.consumedItemId)}.`
              : `${itemName(ctx, data.consumedItemId)} utilisé(e).`}
          </p>
        )}
      </motion.div>
      <div className="mt-6 flex gap-2">
        {!done && (
          <button className="btn-ghost" onClick={() => setDone(true)}>
            Passer
          </button>
        )}
        {done && (
          <button className="btn-primary" onClick={onDone}>
            Continuer
          </button>
        )}
      </div>
    </div>
  );
}
