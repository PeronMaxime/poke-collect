import { motion, useReducedMotion } from 'motion/react';
import type { GameContext } from '@poke/game-core';
import type { BattleDto } from '@poke/shared';
import { Modal } from '../../components/ui';
import { trainerName } from '../../lib/labels';
import { BadgeIcon, TrainerSprite } from './BattlesPage';
import { LAUNCH_DIALOG_CLASS, ResultFrame } from '../common/dialogParts';
import { CombatOutcome, CombatResultDetails } from '../dungeons/DungeonResult';

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
    <Modal open={!!battle?.result} onClose={onClose} wide className={LAUNCH_DIALOG_CLASS}>
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
  const badge = result.badgeEarned && trainer?.badge;

  return (
    <ResultFrame
      title={`Combat contre ${trainer ? `${trainer.trainerClass} ${trainerName(trainer)}` : 'un dresseur'}`}
      onClose={onClose}
    >
      <CombatOutcome
        outcome={result.outcome}
        portrait={trainer && <TrainerSprite trainer={trainer} size={88} />}
        subtitle={`${result.defeated} / ${battle.setup.enemies.length} Pokémon adverses vaincus`}
      />

      <CombatResultDetails
        ctx={ctx}
        result={result}
        currency={currency}
        extraRewards={
          badge && (
            <motion.li
              className="flex items-center gap-2 font-semibold text-amber-700 dark:text-[#f8d878]"
              initial={reduced ? false : { scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.6, type: 'spring' }}
            >
              <BadgeIcon badge={badge} size={36} /> {badge.name} obtenu !
            </motion.li>
          )
        }
      />
    </ResultFrame>
  );
}
