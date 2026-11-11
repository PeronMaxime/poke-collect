import type { Dungeon, DungeonDifficulty } from '@poke/content';
import { dungeonDifficulty } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';

const STYLES: Record<DungeonDifficulty, { className: string; stars: number }> = {
  easy: {
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
    stars: 1,
  },
  hard: {
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
    stars: 2,
  },
  veryHard: {
    className: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200',
    stars: 3,
  },
  extreme: {
    className: 'bg-purple-700 text-white dark:bg-purple-600',
    stars: 4,
  },
};

/** Difficulté d'un donjon (nom réglé dans l'admin), avec une couleur et une jauge par niveau. */
export function DungeonDifficultyBadge({ ctx, dungeon }: { ctx: GameContext; dungeon: Dungeon }) {
  const style = STYLES[dungeon.difficulty];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${style.className}`}
    >
      <span aria-hidden className="tracking-tighter">
        {'★'.repeat(style.stars)}
      </span>
      {dungeonDifficulty(ctx, dungeon).name}
    </span>
  );
}
