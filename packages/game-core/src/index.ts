/**
 * Surface publique de `@poke/game-core` : ce que l'API, le jeu, l'admin et `@poke/db` utilisent.
 *
 * La liste est explicite. Une fonction qui ne sert qu'à l'intérieur du paquet n'y figure pas : les
 * modules s'importent entre eux directement (`./pokemon`, `./expedition`…). Pour rendre une
 * fonction utilisable hors du paquet, l'ajouter ici, dans la ligne de son module.
 */

export { createRng, MAX_SEED } from './rng';
export { baseShinyProbability, createGameContext, playableContent } from './context';
export type { GameContext, GameSpecies } from './context';
export {
  computeStats,
  expeditionPower,
  generatePokemon,
  getNature,
  MAX_IV,
  MAX_LEVEL,
  NO_ABILITY,
  pokemonPower,
  xpForLevel,
} from './pokemon';
export type { Gender, PokemonInstance } from './pokemon';
export {
  applyTeamXp,
  BALL_CATEGORIES,
  captureProbability,
  captureSnapshot,
  checkTeam,
  createExpeditionRun,
  encounterMinutes,
  encounterProbabilities,
  expectedExpeditionXp,
  expeditionEnv,
  expeditionMinMinutes,
  expeditionPace,
  expeditionPlan,
  isNewToDex,
  IV_BALL_CATEGORIES,
  maxExpeditionBerries,
  MISSED_THROW,
  missingTypes,
  NO_THROW,
  planAfter,
  planBall,
  planHasBall,
  planThrows,
  resolveExpedition,
  specialEncountersFor,
  teamPower,
  THROW_CODES,
  zoneSpeciesIds,
} from './expedition';
export type {
  BallCategory,
  BallPlan,
  CaptureFilter,
  CaptureSnapshot,
  CaughtDex,
  ExpeditionError,
  ExpeditionInput,
  ExpeditionPace,
  ExpeditionResult,
  ExpeditionRoamer,
  ExpeditionRun,
  ExpeditionSite,
  IvBallCategory,
  TeamMember,
  TeamMemberResult,
} from './expedition';
export {
  earnedBadges,
  isRegionalSpecies,
  isRegionUnlocked,
  isTabUnlocked,
  isUnlocked,
  isUnlockedSoon,
  isZoneUnlocked,
  outOfRegionSpecies,
  regionDexProgress,
} from './progress';
export type { PlayerProgress } from './progress';
export {
  applyCandies,
  baseSpeciesId,
  breedingEnv,
  candiesForLevel,
  candiesToMaxLevel,
  checkBreedingPair,
  daycareXp,
  eggCycleMinutes,
  eggShinyProbability,
  eggsLaid,
  hatchMinutes,
  inheritanceRules,
  isBreedable,
  isTransferableSpecies,
  lineageId,
  resolveEgg,
  transferCandies,
} from './breeding';
export type { BreedingError, DaycareParent } from './breeding';
export {
  battleCooldownMinutes,
  battleEnv,
  battleMaxXp,
  battleWeather,
  buildBattleSetup,
  checkBattleTeam,
  isTrainerRevealed,
  resolveBattle,
  trainerEnemies,
  trainerMemberPower,
  trainerPower,
  trainerStatus,
} from './battle';
export type { BattleError, BattleResult, TrainerStatus } from './battle';
export { simulateZone } from './simulate';
export type { ZoneSimulation } from './simulate';
export {
  checkPurchase,
  farmPlotEffect,
  isOnSale,
  MAX_LOTS_PER_PURCHASE,
  maxPurchasableLots,
  purchaseGift,
  shopEntryStatus,
} from './shop';
export type { ShopEntryState, ShopPurchaseRecord } from './shop';
export {
  checkEvolution,
  evolutionOptions,
  evolvePokemon,
  localHour,
  pokeApiEvolutions,
  pokemonEvolutions,
} from './evolution';
export type { EvolutionCheck, EvolutionOption, EvolutionRequirement } from './evolution';
export {
  claimableRewardCount,
  collectionProgress,
  collectionState,
  dexForms,
  dexProgress,
  dexSpeciesIds,
  NO_BONUSES,
  NO_CLAIMS,
  playerBonuses,
  playerSlots,
  sortedCollections,
} from './progression';
export type {
  ClaimedRewards,
  DexCatches,
  PlayerBonuses,
  PlayerSlots,
  RewardKind,
  RewardState,
} from './progression';
export {
  claimableCompletionCount,
  completableZones,
  completionRewardId,
  completionState,
  completionTargetRegionId,
  completionTargets,
  expeditionCompletions,
  isCompletionReached,
  regionCompletion,
  zoneCompletion,
  zoneCompletionPokemon,
} from './completion';
export type { CompletionTarget } from './completion';
export {
  chainMultiplier,
  chainPerfectIvs,
  charmMultiplier,
  isMasudaPair,
  MAX_SHINY_CHAIN,
  nextChainPerfectIvThreshold,
  shinyProbability,
  zoneChainStatus,
} from './shiny';
export type { ZoneChainStatus } from './shiny';
export {
  advanceQuest,
  generateQuestPokemon,
  isActionCondition,
  NEW_QUEST,
  questItemsGained,
  questStatus,
  questStepsDone,
} from './quest';
export type { QuestEvent, QuestRecord, QuestStatus } from './quest';
export {
  buildLegendarySetup,
  checkLegendaryTeam,
  legendaryBattleLevel,
  legendaryBoss,
  legendaryCaptureChance,
  legendaryEnv,
  legendaryMaxXp,
  legendaryRetryAt,
  legendaryTarget,
  releasableQuest,
  resolveLegendaryBattle,
} from './legendary';
export type { LegendaryBattleResult } from './legendary';
export { applyItemToPokemon, itemUseOptions, MAX_HAPPINESS } from './endgame';
export { counterpartFormId, isEventForm } from './forms';
export { fossilEffect, restoreMinutes, reviveFossil } from './museum';
export { healMinutes, isHealing } from './center';
export {
  berryGrowthSpeed,
  berryPlantEffect,
  FARM_PLOTS,
  harvestBonus,
  rollBerryYield,
} from './farm';
export { facilityPlaces, facilityUnlocks } from './facilities';
export {
  attackIntervalMs,
  buildDungeonSetup,
  checkDungeonTeam,
  combatWeatherSource,
  dungeonAttack,
  dungeonCooldownMinutes,
  dungeonDifficulty,
  dungeonEnemies,
  dungeonEnv,
  dungeonMaxXp,
  dungeonOpponentInstance,
  dungeonStatChanges,
  dungeonStatus,
  dungeonTypeEffectiveness,
  dungeonWeather,
  effectiveDungeonMove,
  healCommand,
  healReadyAt,
  MOVE_CATEGORIES,
  resolveDungeonRun,
  simulateDungeon,
} from './dungeon';
export type {
  DungeonCommand,
  DungeonEvent,
  DungeonFighter,
  DungeonMove,
  DungeonOutcome,
  DungeonResult,
  DungeonSetup,
  DungeonStatus,
  DungeonTeamError,
} from './dungeon';
export { checkMegaEvolution, isMegaForm, MAX_MEGAS_PER_TEAM, megaCount, megaOptions } from './mega';
export {
  ABILITY_ACTIVITY_LABELS,
  ABILITY_CONDITION_LABELS,
  ABILITY_EFFECT_LABELS,
  ABILITY_PARAMS,
  abilityBonuses,
  abilityEffectSummary,
  abilityEffectText,
  abilityHolder,
  abilityMultiplier,
  activityAbilityEffects,
  ASSISTANT_POST_INFO,
  ASSISTANT_POST_PLACES,
  ASSISTANT_POSTS,
  assistantSlotCount,
  assistantSlotOf,
  attractedTypes,
  canAssist,
  DUNGEON_STAT_LABELS,
  effectActivities,
  effectiveAbility,
  helpsAsAssistant,
  imposedWeather,
  memberPower,
  possibleAbilityEffects,
  resolveWeather,
  STATE_CONDITION_TYPES,
  STATE_STAT_PARAMS,
  STATUS_LABELS,
  WEATHER_LABELS,
} from './abilities';
export type { AbilityActivity, AbilityEnv, AbilityHolder, AssistantPost } from './abilities';
export {
  hasVariableWeather,
  nextWeatherRoll,
  weatherHour,
  zoneWeather,
  zoneWeatherAtHour,
} from './weather';
export {
  roamerEncounterChance,
  roamerFleeZoneId,
  roamerMeetChance,
  roamerPositions,
  roamingTarget,
  roamingZones,
} from './roaming';
export type { RoamerPosition } from './roaming';
export {
  chestCandidates,
  drawGuildQuests,
  GUILD_DESCRIPTION_MAX,
  GUILD_MESSAGE_MAX,
  GUILD_NAME_MAX,
  GUILD_NAME_MIN,
  guildDay,
  guildObjectiveAmount,
  guildPeriod,
  guildQuestTarget,
  guildWeek,
  openGuildChests,
} from './guilds';
export type { GuildActivity, GuildJoinMode, GuildRole } from './guilds';
export { autoTransferIndexes, hiddenEscapeIndexes } from './auto-transfer';
export type { AutoTransferFilter } from './auto-transfer';
export { autoTeam, hasAffinity } from './auto-team';
export type { AutoTeamRules } from './auto-team';
