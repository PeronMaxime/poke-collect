import { useEffect, useState } from 'react';
import { animate, motion, useReducedMotion } from 'motion/react';
import type { GameContext } from '@poke/game-core';
import type { ClaimBattleResponse } from '@poke/shared';
import { Modal, PokemonSprite, ShinyStar } from '../../components/ui';
import { usePokemon } from '../../lib/game';
import { formatDuration, formatMoney, itemIcon, itemName, speciesName } from '../../lib/labels';
import { BadgeIcon, TrainerSprite } from './BattlesPage';

const SWEEP = 1.6; // secondes : le curseur balaie la jauge avant de s'arrêter sur le tirage

/**
 * Résultat animé d'un combat : la jauge des chances, puis le curseur du tirage (seed) qui
 * s'arrête dans la zone de victoire ou de défaite, puis les récompenses.
 */
export function BattleReveal({
  ctx,
  data,
  onClose,
}: {
  ctx: GameContext;
  data: ClaimBattleResponse | null;
  onClose: () => void;
}) {
  return (
    <Modal open={!!data} onClose={onClose} wide>
      {data && <RevealContent key={data.battle.id} ctx={ctx} data={data} onClose={onClose} />}
    </Modal>
  );
}

/** Nombre qui défile de 0 à `value`. */
function CountUp({ value, delay, instant }: { value: number; delay: number; instant: boolean }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (instant) return;
    const controls = animate(0, value, {
      delay,
      duration: 0.8,
      onUpdate: (v) => setShown(Math.round(v)),
    });
    return () => controls.stop();
  }, [value, delay, instant]);
  return <>{formatMoney(instant ? value : shown)}</>;
}

function RevealContent({
  ctx,
  data,
  onClose,
}: {
  ctx: GameContext;
  data: ClaimBattleResponse;
  onClose: () => void;
}) {
  const reduced = useReducedMotion();
  const pokemon = usePokemon();
  const pokemonById = new Map(pokemon.data?.map((p) => [p.id, p]));
  const [skipped, setSkipped] = useState(false);
  const instant = reduced || skipped;
  const result = data.battle.result!;
  const trainer = ctx.trainer(data.battle.trainerId);
  const win = result.outcome === 'win';
  const chance = result.estimate.winProbability;
  const after = instant ? 0 : SWEEP + 0.4;

  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-xl font-bold">
          Combat contre {trainer ? `${trainer.trainerClass} ${trainer.name}` : 'un dresseur'}
        </h2>
        {!instant && (
          <button
            className="text-sm text-slate-500 hover:underline"
            onClick={() => setSkipped(true)}
          >
            Tout afficher
          </button>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-4">
        <div className="flex -space-x-4">
          {data.battle.team.map((id) => {
            const p = pokemonById.get(id);
            return p ? (
              <motion.div
                key={id}
                initial={instant ? false : { x: -30, opacity: 0 }}
                animate={
                  !win && !instant
                    ? {
                        x: 0,
                        opacity: [0, 1, 1, 0.4],
                        filter: ['grayscale(0)', 'grayscale(0)', 'grayscale(0)', 'grayscale(1)'],
                      }
                    : { x: 0, opacity: win || instant ? 1 : 0.4 }
                }
                transition={{ duration: after || 0.01, times: [0, 0.2, 0.85, 1] }}
                className={!win && instant ? 'opacity-40 grayscale' : ''}
              >
                <PokemonSprite speciesId={p.speciesId} shiny={p.isShiny} size={72} />
              </motion.div>
            ) : null;
          })}
        </div>
        <span className="text-lg font-black text-slate-400">VS</span>
        {trainer && (
          <motion.div
            initial={instant ? false : { x: 30, opacity: 0 }}
            animate={{ x: 0, opacity: win ? [1, 1, 0.4] : 1 }}
            transition={{ duration: after || 0.01 }}
          >
            <TrainerSprite trainer={trainer} size={80} />
          </motion.div>
        )}
      </div>

      <div className="mt-5">
        <div className="flex justify-between text-xs text-slate-500">
          <span>Victoire ({Math.round(chance * 100)} %)</span>
          <span>Défaite</span>
        </div>
        <div className="relative mt-1 h-4 rounded-full bg-red-200 dark:bg-red-950">
          <div
            className="h-full rounded-full bg-emerald-400 dark:bg-emerald-700"
            style={{ width: `${chance * 100}%` }}
          />
          <motion.div
            className="absolute -top-1 h-6 w-1.5 -translate-x-1/2 rounded bg-slate-900 shadow dark:bg-white"
            initial={instant ? false : { left: '0%' }}
            animate={
              instant
                ? { left: `${result.roll * 100}%` }
                : { left: ['0%', '100%', '0%', `${result.roll * 100}%`] }
            }
            transition={{ duration: SWEEP, ease: 'easeInOut', times: [0, 0.35, 0.7, 1] }}
          />
        </div>
      </div>

      <motion.p
        className={`mt-4 text-center text-3xl font-black ${win ? 'text-emerald-600' : 'text-red-600'}`}
        initial={instant ? false : { scale: 0, opacity: 0 }}
        animate={{ scale: [0, 1.3, 1], opacity: 1 }}
        transition={{ delay: after, duration: 0.5 }}
      >
        {win ? 'Victoire !' : 'Défaite…'}
      </motion.p>

      <motion.div
        initial={instant ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: after + 0.3 }}
        className="mt-4 grid gap-4 sm:grid-cols-2"
      >
        <div>
          <h3 className="text-sm font-semibold">Récompenses</h3>
          {win ? (
            <ul className="mt-2 space-y-1 text-sm">
              {result.money > 0 && (
                <li className="text-lg font-bold">
                  +<CountUp value={result.money} delay={after + 0.4} instant={instant} />
                </li>
              )}
              {result.badgeEarned && trainer?.badge && (
                <motion.li
                  className="flex items-center gap-2 font-semibold text-amber-600"
                  initial={instant ? false : { scale: 0, rotate: -30 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ delay: after + 0.8, type: 'spring' }}
                >
                  <BadgeIcon badge={trainer.badge} size={36} /> {trainer.badge.name} obtenu !
                </motion.li>
              )}
              {result.loot.map((l) => (
                <li key={l.itemId} className="flex items-center gap-2">
                  <img src={itemIcon(ctx, l.itemId)} alt="" className="h-7 w-7" />
                  {itemName(ctx, l.itemId)} <span className="font-semibold">× {l.quantity}</span>
                </li>
              ))}
              {result.money === 0 && result.loot.length === 0 && !result.badgeEarned && (
                <li className="text-slate-500">Rien cette fois-ci.</li>
              )}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-red-600">
              Aucune récompense. Ton équipe est K.O. pendant {formatDuration(result.koMinutes)} et
              doit se reposer.
            </p>
          )}
          <p className="mt-2 text-xs text-slate-500">Argent : {formatMoney(data.currency)}</p>
        </div>
        <div>
          <h3 className="text-sm font-semibold">Équipe</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {result.team.map((m) => {
              const p = pokemonById.get(m.id);
              return (
                p && (
                  <li key={m.id} className="flex items-center gap-2">
                    <PokemonSprite speciesId={p.speciesId} shiny={p.isShiny} size={32} />
                    <span className="flex-1 truncate">
                      {speciesName(ctx, p.speciesId)} {p.isShiny && <ShinyStar />}
                    </span>
                    <span className="text-slate-500">+{m.xpGained} XP</span>
                    {m.levelAfter > m.levelBefore && (
                      <span className="rounded-full bg-emerald-100 px-2 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        Niveau {m.levelAfter} !
                      </span>
                    )}
                    {!win && (
                      <span className="rounded bg-red-100 px-1 text-[10px] text-red-700 dark:bg-red-950 dark:text-red-300">
                        K.O.
                      </span>
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
