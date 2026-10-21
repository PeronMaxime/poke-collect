import { motion, useReducedMotion } from 'motion/react';
import type { GameContext } from '@poke/game-core';
import type { BattleDto } from '@poke/shared';
import { Modal } from '../../components/ui';
import { BadgeIcon, TrainerSprite } from './BattlesPage';
import { CombatResultDetails, OUTCOME_TITLES } from './DungeonResult';

/** Résultat d'un combat de dresseur : issue, badge, argent, butin, XP et K.O. */
export function BattleResult({
  ctx,
  battle,
  currency,
  onClose,
}: {
  ctx: GameContext;
  battle: BattleDto | null;
  /** Poké Dollars après le combat (inconnu pour un combat réclamé en ton absence). */
  currency: number | null;
  onClose: () => void;
}) {
  return (
    <Modal open={!!battle?.result} onClose={onClose} wide>
      {battle?.result && (
        <ResultContent ctx={ctx} battle={battle} currency={currency} onClose={onClose} />
      )}
    </Modal>
  );
}

function ResultContent({
  ctx,
  battle,
  currency,
  onClose,
}: {
  ctx: GameContext;
  battle: BattleDto;
  currency: number | null;
  onClose: () => void;
}) {
  const reduced = useReducedMotion();
  const result = battle.result!;
  const trainer = ctx.trainer(battle.trainerId);
  const title = OUTCOME_TITLES[result.outcome];
  const win = result.outcome === 'win';
  const badge = result.badgeEarned && trainer?.badge;

  return (
    <div>
      <h2 className="text-xl font-bold">
        Combat contre {trainer ? `${trainer.trainerClass} ${trainer.name}` : 'un dresseur'}
      </h2>
      <div className="mt-3 flex items-center justify-center gap-4">
        {trainer && (
          <span className={win ? 'opacity-40 grayscale' : ''}>
            <TrainerSprite trainer={trainer} size={96} />
          </span>
        )}
        <div className="text-center">
          <motion.p
            className={`text-3xl font-black ${title.className}`}
            initial={reduced ? false : { scale: 0, opacity: 0 }}
            animate={{ scale: [0, 1.3, 1], opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            {title.text}
          </motion.p>
          <p className="text-sm text-slate-500">
            {result.defeated} / {battle.setup.enemies.length} Pokémon adverses vaincus
          </p>
        </div>
      </div>

      <CombatResultDetails
        ctx={ctx}
        result={result}
        currency={currency}
        extraRewards={
          badge && (
            <motion.li
              className="flex items-center gap-2 font-semibold text-amber-600"
              initial={reduced ? false : { scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.6, type: 'spring' }}
            >
              <BadgeIcon badge={badge} size={36} /> {badge.name} obtenu !
            </motion.li>
          )
        }
      />

      <div className="mt-6 text-right">
        <button className="btn-primary" onClick={onClose}>
          Continuer
        </button>
      </div>
    </div>
  );
}
