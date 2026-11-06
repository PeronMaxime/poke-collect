import { useState } from 'react';
import type { ReactNode } from 'react';
import { ITEM_CATEGORIES } from '@poke/content';
import type { ItemCategory } from '@poke/content';
import type { GameContext } from '@poke/game-core';
import { Egg, PokemonSprite } from '../../components/ui';
import { useCandies, useDaycare, useInventory } from '../../lib/game';
import {
  RARITY_LABELS,
  RARITY_STYLES,
  candyName,
  effectText,
  itemIcon,
  lineageSpeciesId,
  speciesName,
} from '../../lib/labels';
import { ChestLootHover } from './ChestLootHover';
import { ChestOpenDialog } from './ChestOpenDialog';
import { groupBagEggs } from './DaycarePage';
import { HappinessDialog } from './HappinessDialog';
import { useSavedRegionTab } from './RegionTabs';
import { ReviveDialog } from './ReviveDialog';

const CATEGORY_LABELS: Record<ItemCategory, string> = {
  ball: 'Balls',
  berry: 'Baies',
  evolution: 'Objets d’évolution',
  breeding: 'Élevage',
  endgame: 'Objets rares',
  fossil: 'Fossiles',
  megaStone: 'Méga-Gemmes',
  quest: 'Objets de quête',
  chest: 'Coffres de guilde',
  misc: 'Divers',
};

/** Coffres ouverts d'un coup au plus (« Tout ouvrir »). */
const MAX_CHESTS = 50;

/** Onglet qui affiche tout le sac, rubrique par rubrique. */
const ALL_TAB = 'all';

/** Une rubrique du sac : son onglet, et sa section dans « Tout ». */
interface BagSection {
  id: string;
  label: string;
  /** Nombre d'objets de la rubrique (quantités cumulées), affiché dans l'onglet. */
  count: number;
  content: ReactNode;
}

export function InventoryPage({ ctx }: { ctx: GameContext }) {
  const inventory = useInventory();
  const candies = useCandies();
  const daycare = useDaycare();
  const stacks = inventory.data ?? [];
  const candyStacks = candies.data ?? [];
  const bagEggs = daycare.data?.bagEggs ?? [];
  const [reviving, setReviving] = useState<string | null>(null);
  const [cheering, setCheering] = useState<string | null>(null);
  const [opening, setOpening] = useState<{ itemId: string; count: number } | null>(null);
  const [savedTab, setTab] = useSavedRegionTab('bag');

  if (
    !inventory.isPending &&
    stacks.length === 0 &&
    candyStacks.length === 0 &&
    bagEggs.length === 0
  ) {
    return (
      <p className="text-sm text-slate-500">
        Ton sac est vide. Pars en expédition pour trouver des objets !
      </p>
    );
  }

  const categoryOf = (itemId: string): ItemCategory => ctx.item(itemId)?.category ?? 'misc';
  const sections: BagSection[] = [];

  for (const category of ITEM_CATEGORIES) {
    const inCategory = stacks.filter((s) => categoryOf(s.itemId) === category);
    if (inCategory.length === 0) continue;
    sections.push({
      id: category,
      label: CATEGORY_LABELS[category],
      count: inCategory.reduce((sum, s) => sum + s.quantity, 0),
      content: (
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
      ),
    });
  }

  if (bagEggs.length > 0) {
    sections.push({
      id: 'eggs',
      label: 'Œufs',
      count: bagEggs.length,
      content: (
        <>
          <p className="mb-2 text-xs text-slate-500">
            Ramassés à la pension. Pour les faire éclore, place-les dans la couveuse depuis la{' '}
            <a
              href="#daycare"
              className="font-medium text-brand-600 hover:underline dark:text-brand-500"
            >
              Pension
            </a>
            .
          </p>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {groupBagEggs(bagEggs).map((g) => (
              <li
                key={`${g.speciesId}:${g.formId}`}
                className="card flex items-center gap-2 p-2 text-sm"
              >
                <Egg size={32} />
                <span className="flex-1">{speciesName(ctx, g.speciesId, g.formId)} ?</span>
                <span className="font-mono">× {g.ids.length}</span>
              </li>
            ))}
          </ul>
        </>
      ),
    });
  }

  if (candyStacks.length > 0) {
    sections.push({
      id: 'candies',
      label: 'Bonbons de lignée',
      count: candyStacks.reduce((sum, c) => sum + c.quantity, 0),
      content: (
        <>
          <p className="mb-2 text-xs text-slate-500">
            Obtenus en transférant des Pokémon (PC). Donne-les à un Pokémon de la même lignée pour
            le faire monter de niveau : {ctx.balance.transfer.candiesPerLevelStart} Bonbons par
            niveau au début, jusqu’à {ctx.balance.transfer.candiesPerLevelEnd} pour les derniers.
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
        </>
      ),
    });
  }

  // Une rubrique vidée (dernier coffre ouvert…) renvoie sur « Tout ».
  const tab = sections.some((s) => s.id === savedTab) ? savedTab! : ALL_TAB;
  const tabs = [
    { id: ALL_TAB, label: 'Tout', count: null as number | null },
    ...sections.map((s) => ({ id: s.id, label: s.label, count: s.count as number | null })),
  ];
  const shown = tab === ALL_TAB ? sections : sections.filter((s) => s.id === tab);

  return (
    <div className="space-y-6">
      {sections.length > 1 && (
        <div className="flex flex-wrap gap-1" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={t.id === tab}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                t.id === tab
                  ? 'bg-brand-500 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              {t.label}
              {t.count !== null && (
                <span
                  className={`font-mono text-xs ${t.id === tab ? 'text-white/80' : 'text-slate-400'}`}
                >
                  {t.count.toLocaleString('fr-FR')}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {shown.map((s) => (
        <section key={s.id}>
          {tab === ALL_TAB && <h2 className="mb-2 font-semibold">{s.label}</h2>}
          {s.content}
        </section>
      ))}
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
    </div>
  );
}
