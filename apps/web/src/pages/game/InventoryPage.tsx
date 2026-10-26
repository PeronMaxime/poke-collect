import { useState } from 'react';
import { ITEM_CATEGORIES } from '@poke/content';
import type { ItemCategory } from '@poke/content';
import type { GameContext } from '@poke/game-core';
import { PokemonSprite } from '../../components/ui';
import { useCandies, useInventory } from '../../lib/game';
import {
  RARITY_LABELS,
  RARITY_STYLES,
  candyName,
  effectText,
  itemIcon,
  lineageSpeciesId,
} from '../../lib/labels';
import { ChestLootHover } from './ChestLootHover';
import { ChestOpenDialog } from './ChestOpenDialog';
import { HappinessDialog } from './HappinessDialog';
import { ReviveDialog } from './ReviveDialog';

const CATEGORY_LABELS: Record<ItemCategory, string> = {
  ball: 'Balls',
  berry: 'Baies',
  evolution: 'Objets d’évolution',
  breeding: 'Élevage',
  endgame: 'Objets rares',
  fossil: 'Fossiles',
  megaStone: 'Méga-Gemmes',
  chest: 'Coffres de guilde',
  misc: 'Divers',
};

/** Coffres ouverts d'un coup au plus (« Tout ouvrir »). */
const MAX_CHESTS = 50;

export function InventoryPage({ ctx }: { ctx: GameContext }) {
  const inventory = useInventory();
  const candies = useCandies();
  const stacks = inventory.data ?? [];
  const candyStacks = candies.data ?? [];
  const [reviving, setReviving] = useState<string | null>(null);
  const [cheering, setCheering] = useState<string | null>(null);
  const [opening, setOpening] = useState<{ itemId: string; count: number } | null>(null);

  if (!inventory.isPending && stacks.length === 0 && candyStacks.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Ton sac est vide. Pars en expédition pour trouver des objets !
      </p>
    );
  }

  const categoryOf = (itemId: string): ItemCategory => ctx.item(itemId)?.category ?? 'misc';
  return (
    <div className="space-y-6">
      {ITEM_CATEGORIES.map((category) => {
        const inCategory = stacks.filter((s) => categoryOf(s.itemId) === category);
        if (inCategory.length === 0) return null;
        return (
          <section key={category}>
            <h2 className="mb-2 font-semibold">{CATEGORY_LABELS[category]}</h2>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {inCategory.map((s) => {
                const item = ctx.item(s.itemId);
                const chest = ctx.itemEffect(s.itemId, 'guildChest');
                const icon = (
                  <img
                    src={itemIcon(ctx, s.itemId)}
                    alt=""
                    className="h-10 w-10 shrink-0 [image-rendering:pixelated]"
                  />
                );
                return (
                  <li key={s.itemId} className="card flex items-center gap-3 p-3">
                    {chest ? (
                      <ChestLootHover ctx={ctx} rarity={chest.rarity}>
                        {icon}
                      </ChestLootHover>
                    ) : (
                      icon
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="flex items-baseline justify-between gap-2">
                        <span className="font-medium">{item?.name ?? s.itemId}</span>
                        <span className="font-mono text-sm">× {s.quantity}</span>
                      </p>
                      {item && (
                        <>
                          <p className={`text-xs ${RARITY_STYLES[item.rarity]}`}>
                            {RARITY_LABELS[item.rarity]}
                            {item.effects.map((e) => ` · ${effectText(e)}`).join('')}
                          </p>
                          <p className="truncate text-xs text-slate-500" title={item.description}>
                            {item.description}
                          </p>
                        </>
                      )}
                    </div>
                    {s.quantity > 0 && ctx.itemEffect(s.itemId, 'revive') && (
                      <button className="btn-primary" onClick={() => setReviving(s.itemId)}>
                        Utiliser
                      </button>
                    )}
                    {s.quantity > 0 &&
                      (ctx.itemEffect(s.itemId, 'happiness') ||
                        ctx.itemEffect(s.itemId, 'levelUp')) && (
                        <button className="btn-primary" onClick={() => setCheering(s.itemId)}>
                          Utiliser
                        </button>
                      )}
                    {s.quantity > 0 && chest && (
                      <span className="flex shrink-0 flex-col gap-1">
                        <button
                          className="btn-primary"
                          onClick={() => setOpening({ itemId: s.itemId, count: 1 })}
                        >
                          Ouvrir
                        </button>
                        {s.quantity > 1 && (
                          <button
                            className="btn-ghost px-2 py-1 text-xs"
                            onClick={() =>
                              setOpening({
                                itemId: s.itemId,
                                count: Math.min(s.quantity, MAX_CHESTS),
                              })
                            }
                          >
                            Tout ouvrir
                          </button>
                        )}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {reviving && <ReviveDialog ctx={ctx} itemId={reviving} onClose={() => setReviving(null)} />}
      {cheering && (
        <HappinessDialog ctx={ctx} itemId={cheering} onClose={() => setCheering(null)} />
      )}
      {opening && (
        <ChestOpenDialog
          ctx={ctx}
          itemId={opening.itemId}
          count={opening.count}
          onClose={() => setOpening(null)}
        />
      )}
      {candyStacks.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Bonbons de lignée</h2>
          <p className="mb-2 text-xs text-slate-500">
            Obtenus en transférant des Pokémon (PC). Donne-les à un Pokémon de la même lignée pour
            lui faire gagner {ctx.balance.transfer.xpPerCandy} XP chacun.
          </p>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {candyStacks.map((c) => {
              const speciesId = lineageSpeciesId(c.lineageId);
              return (
                <li key={c.lineageId} className="card flex items-center gap-2 p-2 text-sm">
                  {speciesId && <PokemonSprite speciesId={speciesId} size={40} />}
                  <span className="flex-1">{candyName(ctx, c.lineageId)}</span>
                  <span className="font-mono">× {c.quantity}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
