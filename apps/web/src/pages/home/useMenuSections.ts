/**
 * Sections du menu (réglées dans l'admin, « Menu du jeu »), repliables une à une.
 */
import { useMemo, useState } from 'react';
import { normalizeMenu } from '@poke/content';
import type { GameContext } from '@poke/game-core';
import { readClosedSections, saveClosedSections } from './menu';
import type { PageId } from './menu';

/**
 * Sections du menu et leur état. La section de l'onglet affiché est dépliée, même repliée
 * auparavant ; le joueur peut la replier tant qu'il reste sur cet onglet. Les sections repliées
 * sont gardées d'une visite à l'autre.
 */
export function useMenuSections(ctx: GameContext | undefined, tab: PageId) {
  const menuSections = useMemo(() => normalizeMenu(ctx?.content.balance.menu), [ctx]);
  const [closedSections, setClosedSections] = useState(readClosedSections);
  // Onglet sur lequel le joueur a replié la section de l'onglet affiché (sinon elle reste ouverte).
  const [collapsedOn, setCollapsedOn] = useState<PageId | null>(null);

  const tabSection = menuSections.find((s) => (s.tabs as PageId[]).includes(tab))?.title;
  const sectionOpen = (title: string) =>
    !closedSections.has(title) || (title === tabSection && collapsedOn !== tab);
  function toggleSection(title: string) {
    const open = sectionOpen(title);
    const next = new Set(closedSections);
    if (open) next.add(title);
    else next.delete(title);
    setClosedSections(next);
    saveClosedSections(next);
    if (title === tabSection) setCollapsedOn(open ? tab : null);
  }

  return { menuSections, sectionOpen, toggleSection };
}
