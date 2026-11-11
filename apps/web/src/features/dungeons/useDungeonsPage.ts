/**
 * État de l'onglet des donjons : donjons découverts de l'onglet choisi, tentative en cours et sa
 * fenêtre, résultat à montrer.
 */
import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DUNGEON_DIFFICULTIES } from '@poke/content';
import type { Dungeon } from '@poke/content';
import { dungeonStatus } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type { DungeonRunDto } from '@poke/shared';
import { useNow } from '../../components/ui';
import {
  keys,
  markDungeonSeen,
  serverOffset,
  useDungeons,
  usePlayerProgress,
} from '../../lib/queries';
import { useCombatWindow } from '../common/CombatWindow';
import { currentRegionTab, useSavedRegionTab, visibleRegions } from '../common/RegionTabs';

/** Au-delà, le résultat d'une tentative réclamée en l'absence du joueur n'est plus montré. */
const RESULT_MAX_AGE_MS = 3 * 24 * 3600_000;

/** Onglet regroupant les donjons de toutes les régions débloquées, avant les onglets de région. */
export const ALL_TAB = { id: '__tous', label: 'Tous' };

/**
 * Donjons listés du plus facile au plus difficile (les cachés sont seulement comptés). Le résultat
 * d'une tentative réclamée en l'absence du joueur est montré jusqu'à ce qu'il le ferme.
 */
export function useDungeonsPage(ctx: GameContext) {
  const dungeons = useDungeons();
  const progress = usePlayerProgress();
  const now = useNow();
  const [selectedRegion, setSelectedRegion] = useSavedRegionTab('dungeons');
  const [launch, setLaunch] = useState<Dungeon | null>(null);
  const [result, setResult] = useState<{ run: DungeonRunDto; currency: number | null } | null>(
    null,
  );
  const queryClient = useQueryClient();
  // Résultat fermé à l'instant, en attendant que le serveur le marque comme vu.
  const [seen, setSeen] = useState<string | null>(null);
  // Tentative dont le combat est terminé, et celle dont le joueur a demandé le résultat.
  const [overRun, setOverRun] = useState<string | null>(null);
  const [claimRun, setClaimRun] = useState<string | null>(null);

  const offset = serverOffset(dungeons.data, dungeons.dataUpdatedAt);
  const serverNow = now + offset;
  const active = dungeons.data?.active ?? null;
  const last = dungeons.data?.last ?? null;
  const records = new Map(dungeons.data?.records.map((r) => [r.dungeonId, r]));
  const regionId = currentRegionTab(ctx, progress, selectedRegion, [ALL_TAB]);
  const isAllTab = regionId === ALL_TAB.id;
  const unlockedRegionIds = visibleRegions(ctx, progress).unlocked.map((r) => r.id);
  const inRegion = ctx.dungeons.filter((d) =>
    isAllTab ? unlockedRegionIds.includes(d.regionId) : d.regionId === regionId,
  );
  const listed = inRegion
    .map((d) => ({
      dungeon: d,
      status: dungeonStatus(ctx, d, progress, records.get(d.id), serverNow),
    }))
    .filter((d) => d.status.state !== 'hidden');
  // Du plus facile au plus difficile ; à difficulté égale, région par région puis l'ordre du Pokédex.
  const difficultyRank = (d: Dungeon) => DUNGEON_DIFFICULTIES.indexOf(d.difficulty);
  const regionRank = (d: Dungeon) => unlockedRegionIds.indexOf(d.regionId);
  listed.sort(
    ({ dungeon: a }, { dungeon: b }) =>
      difficultyRank(a) - difficultyRank(b) || regionRank(a) - regionRank(b) || a.order - b.order,
  );
  const hiddenCount = inRegion.length - listed.length;

  // Tentative réclamée en l'absence du joueur (ou dont la fenêtre n'a pas été fermée) : son
  // résultat s'affiche jusqu'à ce que le joueur le ferme, sur n'importe quel appareil.
  const unseen =
    !active &&
    !result &&
    last?.result &&
    !last.resultSeenAt &&
    last.id !== seen &&
    last.claimedAt &&
    serverNow - Date.parse(last.claimedAt) < RESULT_MAX_AGE_MS
      ? last
      : null;
  const shownResult = result ?? (unseen ? { run: unseen, currency: null } : null);

  // Fenêtre du combat : ouverte d'office pour une nouvelle tentative, sauf si le joueur l'a fermée.
  const activeId = active?.id ?? null;
  const { open: combatOpen, show: showCombat } = useCombatWindow('dungeon-combat-hidden', activeId);
  const markOver = useCallback(() => setOverRun(activeId), [activeId]);

  function closeResult() {
    if (shownResult) {
      const id = shownResult.run.id;
      setSeen(id);
      markDungeonSeen(id)
        .then(() => queryClient.invalidateQueries({ queryKey: keys.dungeons }))
        .catch(() => {
          // Échec : le résultat pourra s'afficher de nouveau au prochain passage.
        });
    }
    setResult(null);
  }

  return {
    progress,
    regionId,
    isAllTab,
    listed,
    hiddenCount,
    records,
    serverNow,
    active,
    offset,
    combatOpen,
    showCombat,
    markOver,
    overRun,
    claimRun,
    setClaimRun,
    launch,
    setLaunch,
    setResult,
    shownResult,
    closeResult,
    setSelectedRegion,
  };
}
