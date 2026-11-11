/**
 * Onglet « Sac » : objets rangés en onglets et rubriques (réglés dans l'admin), œufs et Bonbons ;
 * les boutons ouvrent les fenêtres d'usage (Rappel, baie, Super Bonbon, coffre).
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { ITEM_CATEGORIES, normalizeBag } from '@poke/content';
import type { BagSectionId, ItemCategory } from '@poke/content';
import type { GameContext } from '@poke/game-core';
import type { InventoryEntryDto } from '@poke/shared';
import { CollapseBody, CollapseButton, useCollapsedSection } from '../../components/Collapsible';
import { Egg, PokemonSprite, ViewTabs } from '../../components/ui';
import { useCandies, useDaycare, useInventory } from '../../lib/queries';
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
import { groupBagEggs } from '../daycare/DaycarePage';
import { HappinessDialog } from './HappinessDialog';
import { useSavedRegionTab } from '../common/RegionTabs';
import { ReviveDialog } from './ReviveDialog';

/** Coffres ouverts d'un coup au plus (« Tout ouvrir »). */
const MAX_CHESTS = 50;

/** Onglet qui affiche tout le sac, rubrique par rubrique. */
const ALL_TAB = 'all';

/** Une rubrique du sac : sa section dans son onglet et dans « Tout ». */
interface BagSection {
  id: BagSectionId;
  label: string;
  content: ReactNode;
}

/** Onglet « Sac » (voir l'en-tête du fichier). */
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
  // Rangement en onglets et titres des rubriques : réglés dans l'admin (Sac).
  const layout = normalizeBag(ctx.content.balance.bag);
  const sections: BagSection[] = [];

  for (const category of ITEM_CATEGORIES) {
    const inCategory = stacks.filter((s) => categoryOf(s.itemId) === category);
    if (inCategory.length === 0) continue;
    sections.push({
      id: category,
      label: layout.sectionTitles[category],
      content: (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {inCategory.map((s) => (
            <ItemCard
              key={s.itemId}
              ctx={ctx}
              s={s}
              setReviving={setReviving}
              setCheering={setCheering}
              setOpening={setOpening}
            />
          ))}
        </ul>
      ),
    });
  }

  if (bagEggs.length > 0) {
    sections.push({
      id: 'eggs',
      label: layout.sectionTitles.eggs,
      content: (
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
      ),
    });
  }

  if (candyStacks.length > 0) {
    sections.push({
      id: 'candies',
      label: layout.sectionTitles.candies,
      content: (
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
      ),
    });
  }

  // Un onglet a pour identifiant sa première rubrique (stable si on renomme l'onglet).
  const groups = layout.tabs
    .map((t) => ({
      id: t.sections[0]!,
      label: t.title,
      sections: t.sections,
      shown: t.sections.flatMap((id) => sections.filter((s) => s.id === id)),
    }))
    .filter((g) => g.shown.length > 0);
  // Onglet enregistré : celui qui contient cette rubrique (même si l'admin a réordonné).
  // Un onglet vidé (dernier coffre ouvert…) renvoie sur « Tout ».
  const group = groups.find((g) => g.sections.some((id) => id === savedTab));
  const tab = group?.id ?? ALL_TAB;
  const tabs = [
    { id: ALL_TAB, label: 'Tout' },
    ...groups.map((g) => ({ id: g.id, label: g.label })),
  ];
  const shown = group?.shown ?? groups.flatMap((g) => g.shown);

  return (
    <div className="space-y-6">
      {groups.length > 1 && <ViewTabs tabs={tabs} selected={tab} onSelect={setTab} />}
      {shown.map((s) =>
        shown.length > 1 ? (
          <BagSectionView key={s.id} section={s} />
        ) : (
          <section key={s.id}>{s.content}</section>
        ),
      )}
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

/** Rubrique repliable en accordéon, comme les widgets, fermée par défaut ; l'état est gardé dans le navigateur. */
function BagSectionView({ section }: { section: BagSection }) {
  const [collapsed, toggle] = useCollapsedSection(`bag.${section.id}`, true);
  return (
    <section>
      <div className="flex items-center gap-2">
        <CollapseButton
          collapsed={collapsed}
          onToggle={toggle}
          label={`la rubrique ${section.label}`}
        />
        <h2 className="cursor-pointer font-semibold select-none" onClick={toggle}>
          {section.label}
        </h2>
      </div>
      <CollapseBody open={!collapsed} className="mt-2">
        {section.content}
      </CollapseBody>
    </section>
  );
}

/** Carte d'un objet du sac : icône, rareté, effets, et son bouton (utiliser, ouvrir). */
function ItemCard({
  ctx,
  s,
  setReviving,
  setCheering,
  setOpening,
}: {
  ctx: GameContext;
  s: InventoryEntryDto;
  setReviving: (itemId: string) => void;
  setCheering: (itemId: string) => void;
  setOpening: (opening: { itemId: string; count: number }) => void;
}) {
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
        (ctx.itemEffect(s.itemId, 'happiness') || ctx.itemEffect(s.itemId, 'levelUp')) && (
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
}
