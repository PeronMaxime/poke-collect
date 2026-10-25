import type { ReactNode } from 'react';
import type { ChestRarity } from '@poke/content';
import { chestCandidates } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import { HoverBubble } from '../../components/ui';
import { usePlayerProgress } from '../../lib/game';
import { itemIcon } from '../../lib/labels';

const percent = (chance: number) =>
  `${(chance * 100).toLocaleString('fr-FR', { maximumFractionDigits: chance < 0.01 ? 2 : 1 })} %`;

/** Lots débloqués d'un coffre de guilde et leur chance de sortir, au survol de son contenu. */
export function ChestLootHover({
  ctx,
  rarity,
  children,
}: {
  ctx: GameContext;
  rarity: ChestRarity;
  children: ReactNode;
}) {
  const progress = usePlayerProgress();
  const candidates = chestCandidates(ctx, rarity, progress);
  const total = candidates.reduce((sum, e) => sum + e.weight, 0);
  const lots = candidates
    .map((e) => ({ entry: e, chance: e.weight / total }))
    .sort((a, b) => b.chance - a.chance);
  const rolls = ctx.balance.guilds.chestRolls[rarity];

  return (
    <HoverBubble
      width={232}
      height={40 + lots.length * 20}
      className="inline-block shrink-0"
      content={
        lots.length === 0 ? (
          <span className="text-slate-500">
            Rien à gagner pour l’instant : progresse dans le jeu.
          </span>
        ) : (
          <>
            <span className="mb-1 block text-slate-500">
              {rolls} tirage{rolls > 1 ? 's' : ''} par coffre, chance de chaque lot :
            </span>
            {lots.map(({ entry, chance }) => (
              <span key={entry.id} className="flex items-center gap-1.5">
                <img
                  src={itemIcon(ctx, entry.itemId)}
                  alt=""
                  className="h-5 w-5 shrink-0 [image-rendering:pixelated]"
                />
                <span className="min-w-0 flex-1 truncate">
                  {entry.lotSize > 1 && `${entry.lotSize} × `}
                  {ctx.item(entry.itemId)?.name ?? entry.itemId}
                </span>
                <span className="font-mono">{percent(chance)}</span>
              </span>
            ))}
          </>
        )
      }
    >
      {children}
    </HoverBubble>
  );
}
