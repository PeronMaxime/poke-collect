/**
 * État de l'onglet des combats de dresseurs : dresseurs de la région choisie, combat en cours et sa
 * fenêtre, résultat à montrer, et arrivée par le lien d'un dresseur.
 */
import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Trainer } from '@poke/content';
import { trainerStatus } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type { BattleDto } from '@poke/shared';
import { useNow } from '../../components/ui';
import {
  keys,
  markBattleSeen,
  serverOffset,
  useBattles,
  usePlayerProgress,
  useQuests,
} from '../../lib/queries';
import { formatCountdown, trainerName } from '../../lib/labels';
import { useCombatWindow } from '../common/CombatWindow';
import { currentRegionTab, useSavedRegionTab } from '../common/RegionTabs';
import { useTrainerLink } from './trainerLink';
import { trainerLists } from './trainerLists';
import { unlockText } from './trainerParts';
import type { TrainerCardProps } from './trainerParts';

/** Au-delà, le résultat d'un combat réclamé en l'absence du joueur n'est plus montré. */
const RESULT_MAX_AGE_MS = 3 * 24 * 3600_000;

/** Ce qui empêche de défier le dresseur d'un lien (rien s'il peut l'être ou s'il est en cours). */
function linkNotice(
  ctx: GameContext,
  trainer: Trainer,
  {
    status,
    fighting,
    busy,
    serverNow,
  }: Pick<TrainerCardProps, 'status' | 'fighting' | 'busy' | 'serverNow'>,
): string | null {
  const name = trainerName(trainer);
  if (fighting) return null;
  switch (status.state) {
    case 'locked':
      return trainer.questId
        ? `${name} n’est pas encore apparu : avance dans sa quête.`
        : `${name} est verrouillé : ${unlockText(ctx, trainer)}.`;
    case 'defeated':
      return `${name} est déjà battu.`;
    case 'cooldown':
      return `${name} se repose encore ${formatCountdown(status.until.getTime() - serverNow)}.`;
    case 'available':
      return busy ? `Tu affrontes déjà un dresseur : termine ce combat pour défier ${name}.` : null;
  }
}

/**
 * Tout ce qu'affiche l'onglet. Le résultat d'un combat réclamé en l'absence du joueur est montré
 * jusqu'à ce qu'il le ferme (`closeResult` le marque comme vu sur le serveur).
 */
export function useBattlesPage(ctx: GameContext) {
  const queryClient = useQueryClient();
  const battles = useBattles();
  const progress = usePlayerProgress();
  const quests = useQuests();
  const now = useNow();
  const [selectedRegion, setSelectedRegion] = useSavedRegionTab('battles');
  const [launch, setLaunch] = useState<Trainer | null>(null);
  const [result, setResult] = useState<{ battle: BattleDto; currency: number | null } | null>(null);
  // Résultat fermé à l'instant, en attendant que le serveur le marque comme vu.
  const [seen, setSeen] = useState<string | null>(null);
  // Combat terminé, et celui dont le joueur a demandé le résultat.
  const [overBattle, setOverBattle] = useState<string | null>(null);
  const [claimBattle, setClaimBattle] = useState<string | null>(null);
  // Arrivée par le lien d'un dresseur (étape de quête), et ce qui empêche de le défier.
  const [linkedTrainerId, setLinkedTrainerId] = useTrainerLink();
  const [notice, setNotice] = useState<string | null>(null);

  const offset = serverOffset(battles.data, battles.dataUpdatedAt);
  const serverNow = now + offset;
  const active = battles.data?.active ?? null;
  const last = battles.data?.last ?? null;
  const records = new Map(battles.data?.records.map((r) => [r.trainerId, r]));
  const regionId = currentRegionTab(ctx, progress, selectedRegion);
  const region = ctx.regions.find((r) => r.id === regionId);
  const { trainers, questTrainers, elites, shown, hiddenCount, gyms } = trainerLists(
    ctx,
    regionId,
    progress,
    records,
  );
  const beaten = (t: Trainer) => (records.get(t.id)?.wins ?? 0) > 0;

  // Combat réclamé en l'absence du joueur (ou dont la fenêtre n'a pas été fermée) : son
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
  const shownResult = result ?? (unseen ? { battle: unseen, currency: null } : null);

  const activeId = active?.id ?? null;
  const { open: combatOpen, show: showCombat } = useCombatWindow('battle-combat-hidden', activeId);
  const markOver = useCallback(() => setOverBattle(activeId), [activeId]);
  const activeTrainer = active ? ctx.trainer(active.trainerId) : undefined;
  const activeTitle = activeTrainer
    ? `Combat contre ${activeTrainer.trainerClass} ${trainerName(activeTrainer)}`
    : 'Combat de dresseur';

  const trainerCard = (trainer: Trainer) => ({
    ctx,
    trainer,
    status: trainerStatus(ctx, trainer, progress, records.get(trainer.id), serverNow),
    record: records.get(trainer.id),
    fighting: active?.trainerId === trainer.id,
    busy: !!active,
    serverNow,
    onLaunch: () => setLaunch(trainer),
  });

  // Lien d'un dresseur : une fois les combats et les quêtes connus, sa région s'affiche et le
  // départ s'ouvre s'il peut être défié (sinon, ce qui l'en empêche).
  if (linkedTrainerId && battles.data && quests.data) {
    setLinkedTrainerId(null);
    const trainer = ctx.trainer(linkedTrainerId);
    if (trainer) {
      const card = trainerCard(trainer);
      setSelectedRegion(trainer.regionId);
      setNotice(linkNotice(ctx, trainer, card));
      if (card.fighting) showCombat(true);
      else if (!card.busy && card.status.state === 'available') setLaunch(trainer);
    }
  }

  function closeResult() {
    if (shownResult) {
      const id = shownResult.battle.id;
      setSeen(id);
      markBattleSeen(id)
        .then(() => queryClient.invalidateQueries({ queryKey: keys.battles }))
        .catch(() => {
          // Échec : le résultat pourra s'afficher de nouveau au prochain passage.
        });
    }
    setResult(null);
  }

  return {
    progress,
    regionId,
    region,
    trainers,
    questTrainers,
    elites,
    shown,
    hiddenCount,
    beaten,
    gyms,
    active,
    combatOpen,
    showCombat,
    markOver,
    activeTrainer,
    activeTitle,
    trainerCard,
    overBattle,
    claimBattle,
    setClaimBattle,
    notice,
    setNotice,
    setSelectedRegion,
    launch,
    setLaunch,
    setResult,
    shownResult,
    closeResult,
    offset,
  };
}
