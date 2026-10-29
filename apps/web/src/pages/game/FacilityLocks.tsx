import { FACILITIES } from '@poke/content';
import type { FacilityId } from '@poke/content';
import { lockedFacilityUnlocks } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import { usePlayerProgress } from '../../lib/game';
import { unlockConditionText } from '../../lib/labels';

/**
 * Paliers de places pas encore débloqués d'un bâtiment (expéditions, pensions, Musée, ferme, Centres), avec
 * leur condition.
 */
export function FacilityLocks({ ctx, facility }: { ctx: GameContext; facility: FacilityId }) {
  const progress = usePlayerProgress();
  const locked = lockedFacilityUnlocks(ctx, facility, progress);
  if (locked.length === 0) return null;
  const { unit, units } = FACILITIES.find((f) => f.id === facility)!;
  return (
    <ul className="mt-3 grid gap-2 sm:grid-cols-2">
      {locked.map((step, i) => (
        <li
          key={i}
          className="flex items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 dark:border-slate-700"
        >
          <span aria-hidden>🔒</span>
          <span>
            <span className="font-medium">
              +{step.amount} {step.amount > 1 ? units : unit}
            </span>{' '}
            : {unlockConditionText(ctx, step.unlock) ?? 'bientôt'}
          </span>
        </li>
      ))}
    </ul>
  );
}
