import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { GameContext } from '@poke/game-core';
import type { ClaimExpeditionResponse } from '@poke/shared';
import { IvHover, Modal, PokemonSprite, ShinySparkles, ShinyStar } from '../../components/ui';
import { usePokemon } from '../../lib/game';
import { formatShinyRate, itemIcon, itemName, speciesName } from '../../lib/labels';

// Secondes entre deux rencontres : on accélère quand il y en a beaucoup, pour que
// l'apparition dure au plus ~REVEAL_BUDGET secondes (sans descendre sous MIN_STEP).
const MAX_STEP = 0.45;
const MIN_STEP = 0.06;
const REVEAL_BUDGET = 6;

function revealStep(count: number): number {
  return Math.max(MIN_STEP, Math.min(MAX_STEP, REVEAL_BUDGET / Math.max(1, count)));
}

const OUTCOME_LABELS = {
  captured: 'Capturé !',
  escaped: 'S’est échappé…',
  noBall: 'Observé',
  ignored: 'Ignoré',
} as const;

/** Ouverture animée du résultat d'une expédition : rencontres une à une, puis butin et XP. */
export function LootReveal({
  ctx,
  data,
  onClose,
}: {
  ctx: GameContext;
  data: ClaimExpeditionResponse | null;
  onClose: () => void;
}) {
  return (
    <Modal open={!!data} onClose={onClose} wide>
      {data && <RevealContent key={data.expedition.id} ctx={ctx} data={data} onClose={onClose} />}
    </Modal>
  );
}

function RevealContent({
  ctx,
  data,
  onClose,
}: {
  ctx: GameContext;
  data: ClaimExpeditionResponse;
  onClose: () => void;
}) {
  const reduced = useReducedMotion();
  const pokemon = usePokemon();
  const pokemonById = new Map(pokemon.data?.map((p) => [p.id, p]));
  const capturedById = new Map(data.captured.map((p) => [p.id, p]));
  const [skipped, setSkipped] = useState(false);
  const instant = reduced || skipped;
  const result = data.expedition.result!;
  const zone = ctx.zone(data.expedition.zoneId);
  const captured = result.encounters.filter((e) => e.outcome === 'captured').length;
  const shinies = result.encounters.filter((e) => e.isShiny).length;
  const firstShiny = result.encounters.findIndex((e) => e.isShiny);
  // « Nouveau ! » sur la première capture de chaque nouvelle espèce seulement.
  const newSpecies = new Set(result.newSpeciesIds);
  const firstNew = new Set<number>();
  result.encounters.forEach((e, i) => {
    if (e.outcome === 'captured' && newSpecies.delete(e.speciesId)) firstNew.add(i);
  });
  const step = revealStep(result.encounters.length);
  const delay = (i: number) => (instant ? 0 : 0.3 + i * step);
  const after = delay(result.encounters.length);

  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">Retour de {zone?.name ?? 'l’expédition'}</h2>
          <p className="text-sm text-slate-500">
            {result.encounters.length} rencontre{result.encounters.length > 1 ? 's' : ''},{' '}
            {captured} capture{captured > 1 ? 's' : ''}
            {result.shinyChance !== undefined && (
              <>
                {' '}
                · taux shiny {formatShinyRate(result.shinyChance)}
                {data.expedition.shinyChain > 0 && ` (chaîne ${data.expedition.shinyChain})`}
              </>
            )}
          </p>
        </div>
        {!instant && (
          <button
            className="text-sm text-slate-500 hover:underline"
            onClick={() => setSkipped(true)}
          >
            Tout afficher
          </button>
        )}
      </div>

      {shinies > 0 && (
        <motion.p
          className="mt-3 rounded-xl bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-200 px-3 py-2 text-center font-bold text-amber-900 dark:from-amber-900 dark:via-amber-800 dark:to-amber-900 dark:text-amber-100"
          initial={instant ? false : { opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: [0.8, 1.08, 1] }}
          transition={{ delay: delay(firstShiny) + 0.2, duration: 0.5 }}
        >
          ✨ {shinies > 1 ? `${shinies} Pokémon shiny !` : 'Un Pokémon shiny !'} ✨
        </motion.p>
      )}

      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
        {result.encounters.map((e, i) => {
          const isNew = firstNew.has(i);
          return (
            <motion.div
              key={i}
              className={`relative flex flex-col items-center rounded-xl border p-2 text-center text-xs ${
                e.isShiny
                  ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/40'
                  : e.outcome === 'captured'
                    ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40'
                    : 'border-slate-200 dark:border-slate-800'
              }`}
              initial={instant ? false : { opacity: 0, scale: 0.6, rotate: -8 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ delay: delay(i), type: 'spring', stiffness: 260, damping: 18 }}
            >
              {isNew && (
                <span className="absolute -top-2 rounded-full bg-brand-500 px-1.5 text-[10px] font-bold text-white">
                  Nouveau !
                </span>
              )}
              <motion.div
                initial={instant ? false : { y: -6 }}
                animate={
                  e.isShiny && !instant
                    ? { y: 0, filter: ['brightness(1)', 'brightness(1.8)', 'brightness(1)'] }
                    : { y: 0 }
                }
                transition={{ delay: delay(i) + 0.15, duration: 0.6 }}
                className="relative"
              >
                {e.isShiny && <ShinySparkles delay={delay(i) + 0.15} loop />}
                <IvHover
                  ivs={
                    (e.pokemonId ? capturedById.get(e.pokemonId)?.ivs : undefined) ?? e.pokemon?.ivs
                  }
                >
                  <PokemonSprite
                    speciesId={e.speciesId}
                    formId={e.formId}
                    shiny={e.isShiny}
                    size={64}
                    className={
                      e.outcome === 'escaped' || e.outcome === 'ignored'
                        ? 'opacity-50 grayscale'
                        : ''
                    }
                  />
                </IvHover>
              </motion.div>
              <span className="font-medium">
                {speciesName(ctx, e.speciesId, e.formId)} {e.isShiny && <ShinyStar />}
              </span>
              <span className="text-slate-500">N.{e.level}</span>
              <span
                className={
                  e.outcome === 'captured'
                    ? 'font-semibold text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-500'
                }
              >
                {OUTCOME_LABELS[e.outcome]}
              </span>
            </motion.div>
          );
        })}
      </div>

      <motion.div
        initial={instant ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: after }}
        className="mt-5 grid gap-4 sm:grid-cols-2"
      >
        <div>
          <h3 className="text-sm font-semibold">Butin</h3>
          {result.loot.length === 0 ? (
            <p className="mt-1 text-sm text-slate-500">Rien cette fois-ci.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {result.loot.map((l, i) => (
                <motion.li
                  key={l.itemId}
                  className="flex items-center gap-2 text-sm"
                  initial={instant ? false : { opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: after + 0.1 * (i + 1) }}
                >
                  <img src={itemIcon(ctx, l.itemId)} alt="" className="h-7 w-7" />
                  {itemName(ctx, l.itemId)}
                  <span className="font-semibold">× {l.quantity}</span>
                </motion.li>
              ))}
            </ul>
          )}
          {result.ballsUsed > 0 && (
            <p className="mt-2 text-xs text-slate-500">
              {result.ballsUsed} Ball{result.ballsUsed > 1 ? 's' : ''} utilisée
              {result.ballsUsed > 1 ? 's' : ''}
              {result.berriesUsed > 0 && `, ${result.berriesUsed} baie(s)`}.
            </p>
          )}
        </div>
        <div>
          <h3 className="text-sm font-semibold">Équipe</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {result.team.map((m) => {
              const p = pokemonById.get(m.id);
              return (
                p && (
                  <li key={m.id} className="flex items-center gap-2">
                    <PokemonSprite
                      speciesId={p.speciesId}
                      formId={p.formId}
                      shiny={p.isShiny}
                      size={32}
                    />
                    <span className="flex-1 truncate">
                      {speciesName(ctx, p.speciesId, p.formId)}
                    </span>
                    <span className="text-slate-500">+{m.xpGained} XP</span>
                    {m.levelAfter > m.levelBefore && (
                      <motion.span
                        className="rounded-full bg-emerald-100 px-2 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        initial={instant ? false : { scale: 0 }}
                        animate={{ scale: [0, 1.3, 1] }}
                        transition={{ delay: after + 0.3 }}
                      >
                        Niveau {m.levelAfter} !
                      </motion.span>
                    )}
                  </li>
                )
              );
            })}
          </ul>
        </div>
      </motion.div>

      <div className="mt-6 text-right">
        <button className="btn-primary" onClick={onClose}>
          Continuer
        </button>
      </div>
    </div>
  );
}
