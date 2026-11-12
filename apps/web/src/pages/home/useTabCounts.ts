/**
 * Avancement du joueur vu du menu : onglets verrouillés et, pour chaque onglet, ce qui l'attend.
 */
import { useMemo } from 'react';
import { useNow } from '../../components/ui';
import { getForm } from '@poke/data';
import { claimableRewardCount } from '@poke/game-core';
import {
  centerState,
  isUsable,
  useBattles,
  useClaimedRewards,
  useDaycare,
  useDexCatches,
  useDungeons,
  useExpeditions,
  useFarm,
  useMuseum,
  useNewEvolutionChecker,
  usePlayerProgress,
  usePokedex,
  usePokedexForms,
  usePokemon,
  useQuests,
  useShop,
} from '../../lib/queries';
import type { GameContext } from '@poke/game-core';
import { DEX_FORM_KINDS, daycareReadyCount, lockedTabsOf } from './menu';
import type { TabCounts } from './menu';

/**
 * Données des bâtiments et des activités, onglets verrouillés et compteurs des pastilles. Seul le
 * filtre « disponible » des évolutions suit l'horloge (toutes les 5 s).
 */
export function useTabCounts(ctx: GameContext | undefined) {
  const expeditions = useExpeditions();
  const daycare = useDaycare();
  const museum = useMuseum();
  const farm = useFarm();
  const battles = useBattles();
  const dungeons = useDungeons();
  const shop = useShop();
  const quests = useQuests();
  const pokemon = usePokemon();
  const claimed = useClaimedRewards();
  const hasNewEvolution = useNewEvolutionChecker(ctx);
  const pokedex = usePokedex();
  const progress = usePlayerProgress();

  const lockedTabs = useMemo(
    () =>
      lockedTabsOf(ctx, progress, {
        pokedex: pokedex.data,
        battles: battles.data,
        daycare: daycare.data,
        quests: quests.data,
        museum: museum.data,
        farm: farm.data,
        dungeons: dungeons.data,
      }),
    [
      ctx,
      progress,
      pokedex.data,
      battles.data,
      daycare.data,
      quests.data,
      museum.data,
      farm.data,
      dungeons.data,
    ],
  );

  const now = useNow(5000);
  // Les évolutions possibles ne se recalculent que si les Pokémon, le sac ou le Pokédex changent ;
  // seul le filtre « disponible » (ni occupé, ni K.O.) suit l'horloge.
  const evolvable = useMemo(
    () => pokemon.data?.filter(hasNewEvolution) ?? [],
    [pokemon.data, hasNewEvolution],
  );
  const finished = expeditions.data?.active.filter((e) => Date.parse(e.endsAt) <= now).length ?? 0;
  const dexCatches = useDexCatches();
  const dexForms = usePokedexForms();
  // Même décompte que la page Pokédex : espèces et formes de ses sections (régionales, Méga…).
  const caught =
    dexCatches.caughtSpeciesIds.size +
    (dexForms.data?.filter((f) => DEX_FORM_KINDS.has(getForm(f.formId)?.kind)).length ?? 0);
  // Collections et complétions à réclamer, Pokémon disponibles prêts à évoluer vers une espèce
  // ou forme qui manque encore au Pokédex (même règle que la pastille « Évol. » du PC).
  const rewardsReady = ctx ? claimableRewardCount(ctx, dexCatches, claimed) : 0;
  const evolutionsReady = evolvable.filter((p) => isUsable(p, now)).length;
  const questsReady = quests.data?.quests.filter((q) => q.status === 'completed').length ?? 0;
  // Articles débloqués pas encore vus (évalués par le serveur à chaque chargement de la boutique).
  const shopNew = shop.data?.entries.filter((e) => e.isNew).length ?? 0;
  const daycareReady = daycareReadyCount(ctx, daycare.data, now);
  const fossilsReady =
    museum.data?.revivals.filter((r) => Date.parse(r.readyAt) <= now).length ?? 0;
  const berriesReady =
    farm.data?.planted.filter((p) => p.readyAt && Date.parse(p.readyAt) <= now).length ?? 0;
  // Pokémon K.O. qui attendent leurs soins (comptés seulement s'il reste de la place).
  const center = ctx && pokemon.data ? centerState(ctx, pokemon.data, now, progress) : null;
  const koWaiting = center && center.free > 0 ? center.knockedOut.length : 0;
  const progressLoaded = !!(pokedex.data && battles.data && daycare.data && quests.data);

  const counts: TabCounts = {
    finished,
    battleActive: !!battles.data?.active,
    dungeonActive: !!dungeons.data?.active,
    daycareReady,
    koWaiting,
    fossilsReady,
    berriesReady,
    questsReady,
    shopNew,
    rewardsReady,
    evolutionsReady,
  };
  return { progress, expeditions, battles, dungeons, lockedTabs, progressLoaded, caught, counts };
}
