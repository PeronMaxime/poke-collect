import type { GameContext } from '@poke/game-core';
import type { BattleDto, ClaimBattleResponse } from '@poke/shared';
import { COMBAT_API, keys } from '../../lib/queries';
import { BattleResult } from './BattleResult';
import { BuildingSection, EMPTY_PLACE, Notice } from '../buildings/BuildingParts';
import { CombatWindow, OngoingCombatBanner } from '../common/CombatWindow';
import { DungeonCombat } from '../common/DungeonCombat';
import { LaunchBattleDialog } from './LaunchBattleDialog';
import { RegionTabs } from '../common/RegionTabs';
import { leagueRank } from './trainerLists';
import { TrainerSprite } from './trainerParts';
import { BadgeCase, FeaturedTrainerCard, TrainerCard } from './TrainerCards';
import { useBattlesPage } from './useBattlesPage';

/**
 * Grille des dresseurs : jusqu'à 3 tuiles par ligne, selon la largeur réellement disponible
 * (celle-ci dépend de la colonne des widgets, d'où une requête de conteneur plutôt que d'écran).
 */
const TRAINER_GRID = 'grid grid-cols-1 gap-3 @xl:grid-cols-2 @4xl:grid-cols-3';

/**
 * Onglet « Combats » : les dresseurs de la région (ceux de l'histoire, puis ceux des quêtes), le
 * combat en cours, le départ d'un combat et son résultat.
 */
export function BattlesPage({ ctx }: { ctx: GameContext }) {
  const b = useBattlesPage(ctx);
  const {
    progress,
    regionId,
    region,
    trainers,
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
  } = b;
  return (
    <div className="space-y-4">
      {active && !combatOpen && (
        <OngoingCombatBanner
          title={activeTitle}
          portrait={activeTrainer && <TrainerSprite trainer={activeTrainer} size={72} />}
          over={overBattle === active.id}
          claiming={claimBattle === active.id}
          onShow={() => {
            if (overBattle === active.id) setClaimBattle(active.id);
            else showCombat(true);
          }}
        />
      )}

      {notice && (
        <Notice tone="warn" onClose={() => setNotice(null)}>
          {notice}
        </Notice>
      )}

      <BuildingSection
        id="battles.trainers"
        title={`Dresseurs${region ? ` de ${region.name}` : ''}`}
        label="les dresseurs de la région"
        count={shown.length > 0 ? `${shown.filter(beaten).length} / ${shown.length}` : undefined}
        countTitle="Dresseurs déjà battus"
        actions={
          <RegionTabs
            ctx={ctx}
            progress={progress}
            selected={regionId}
            onSelect={setSelectedRegion}
          />
        }
        intro="Les Pokémon du dresseur entrent en combat un par un : bats-les tous avant la fin du temps imparti. Un dresseur répétable se repose après chaque combat ; un Champion d’arène ne se bat qu’une fois, mais se retente aussitôt après une défaite."
        className="space-y-3 @container"
      >
        {gyms.length > 0 && (
          <BadgeCase gyms={gyms} revealed={new Set(shown.map((t) => t.id))} won={beaten} />
        )}
        {trainers.length === 0 ? (
          <div
            className={`grid min-h-24 place-items-center p-4 text-center text-sm ${EMPTY_PLACE}`}
          >
            Aucun dresseur dans cette région pour le moment.
          </div>
        ) : (
          <div className={TRAINER_GRID}>
            {shown.map((trainer) => {
              const card = trainerCard(trainer);
              const rank = leagueRank(trainer);
              return rank ? (
                <FeaturedTrainerCard
                  key={trainer.id}
                  {...card}
                  rank={rank}
                  eliteIndex={elites.indexOf(trainer)}
                  eliteCount={elites.length}
                />
              ) : (
                <TrainerCard key={trainer.id} {...card} />
              );
            })}
          </div>
        )}
        {hiddenCount > 0 && (
          <div className={`grid place-items-center px-4 py-3 text-center text-sm ${EMPTY_PLACE}`}>
            🔒 Bats {shown[shown.length - 1]!.name} pour découvrir la suite.
          </div>
        )}
      </BuildingSection>

      <QuestTrainers b={b} />

      {active && (
        <CombatWindow open={combatOpen} onClose={() => showCombat(false)}>
          <DungeonCombat<BattleDto, ClaimBattleResponse>
            key={active.id}
            ctx={ctx}
            title={activeTitle}
            apiBase={COMBAT_API.battles}
            queryKey={keys.battles}
            run={active}
            offsetMs={offset}
            visible={combatOpen}
            onHide={() => showCombat(false)}
            claimRequested={claimBattle === active.id}
            onOver={markOver}
            onClaimError={() => {
              setClaimBattle(null);
              showCombat(true);
            }}
            onFinished={(data) => setResult({ battle: data.battle, currency: data.currency })}
          />
        </CombatWindow>
      )}
      {launch && <LaunchBattleDialog ctx={ctx} trainer={launch} onClose={() => setLaunch(null)} />}
      <BattleResult
        ctx={ctx}
        battle={shownResult?.battle ?? null}
        currency={shownResult?.currency ?? null}
        onClose={closeResult}
      />
    </div>
  );
}

/** Dresseurs de quêtes : à part, une fois leur étape atteinte. */
function QuestTrainers({ b }: { b: ReturnType<typeof useBattlesPage> }) {
  const { questTrainers, trainerCard } = b;
  if (questTrainers.length === 0) return null;
  return (
    <BuildingSection
      id="battles.quests"
      title="Dresseurs de quêtes"
      label="les dresseurs de quêtes"
      count={questTrainers.length}
      countTitle="Dresseurs de quêtes apparus"
      intro="Ils n’apparaissent qu’à l’étape de quête qui demande de les battre, et ne se battent qu’une fois (une défaite se retente aussitôt)."
      className="@container"
    >
      <div className={TRAINER_GRID}>
        {questTrainers.map((trainer) => (
          <TrainerCard key={trainer.id} {...trainerCard(trainer)} />
        ))}
      </div>
    </BuildingSection>
  );
}
