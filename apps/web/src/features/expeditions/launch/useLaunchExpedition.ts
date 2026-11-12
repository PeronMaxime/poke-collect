/**
 * État et estimations du formulaire de départ en expédition : choix du joueur (Balls, baies,
 * transfert automatique), contrôle de l'équipe, et tout ce que l'aperçu annonce. L'affichage est
 * dans les composants voisins, qui reçoivent tous le même résultat (`LaunchModel`).
 */
import type { Weather, Zone } from '@poke/content';
import {
  NO_BONUSES,
  abilityBonuses,
  abilityMultiplier,
  activityAbilityEffects,
  attractedTypes,
  checkTeam,
  expectedExpeditionXp,
  expeditionEnv,
  expeditionMinMinutes,
  expeditionPlan,
  maxExpeditionBerries,
  resolveWeather,
  shinyProbability,
  zoneWeather,
} from '@poke/game-core';
import type { CaughtDex, GameContext, PlayerBonuses } from '@poke/game-core';
import type { PokemonDto, RoamerDto } from '@poke/shared';
import { useNow } from '../../../components/ui';
import { formatDuration, formatPercentBonus, formatShinyRate } from '../../../lib/labels';
import { useShinyBonus } from '../../../lib/queries';
import { zoneWeatherForecast } from '../../common/WeatherIcon';
import { zoneSpecies, zoneTint } from '../../common/zoneBanner';
import {
  ballUsage,
  ballUsageText,
  chainSummary,
  encounterPreview,
  encounterRhythm,
  expectedCaptures,
  launchItems,
  launchStatus,
  resolveBallPlan,
  zoneLoot,
} from './preview';
import { useLaunchSettings } from './zoneSettings';

/** Ce que le formulaire de départ sait du joueur et de la zone. */
export interface LaunchInputs {
  ctx: GameContext;
  zone: Zone;
  /** Maillon de la chaîne de zone qu'aurait cette expédition. */
  chain: number;
  /** Multiplicateur du Charme Chroma (1 = aucun). */
  charm: number;
  /** Quantité possédée d'un objet. */
  owned: (itemId: string) => number;
  /** Stock illimité (simulateur) : les quantités ne sont pas affichées. */
  unlimitedItems: boolean;
  /** Bonus permanents du joueur (aucun si absent). */
  bonuses?: PlayerBonuses;
  /** Météo de la zone imposée (simulateur) ; `undefined` : celle du moment. */
  weather?: Weather | null;
  /** Pokémon fuyards cachés dans la zone en ce moment. */
  roamers: RoamerDto[];
  /** Captures du Pokédex ; absent = tout est nouveau. */
  caught?: CaughtDex;
  team: string[];
  members: PokemonDto[];
  /** Temps d'expédition des estimations (XP, butin, fuyards), en minutes. */
  duration: number;
  /** Retient les réglages pour la zone, à chaque changement (jeu). */
  rememberSettings: boolean;
}

/** Tout ce qu'affichent les pièces du formulaire de départ. */
export type LaunchModel = ReturnType<typeof useLaunchExpedition>;

/**
 * Formulaire de départ : choix retenus et estimations à l'instant présent (celui du départ), avec
 * les talents de l'équipe et la météo de la zone, recalculées à chaque changement.
 */
export function useLaunchExpedition(inputs: LaunchInputs) {
  const { ctx, zone, chain, charm, owned, unlimitedItems, bonuses, members, duration } = inputs;
  const shinyBonus = useShinyBonus();
  const { maxDurationMinutes, maxTeamSize, lootIntervalMinutes, berryDurationMinutes } =
    ctx.balance.expeditions;
  // Période des estimations : « par heure » par défaut.
  const per = duration === 60 ? 'par heure' : `en ${formatDuration(duration)}`;
  const { balls, captureBerries, encounterBerries } = launchItems(ctx, owned, unlimitedItems);
  const settings = useLaunchSettings(zone.id, inputs.rememberSettings);
  const { ballCategories, ballPlan } = resolveBallPlan(
    ctx,
    balls,
    settings.ballChoice,
    settings.showIvBalls,
  );
  // Une baie retenue qui n'est plus dans le sac n'est pas emportée.
  const berryId =
    settings.berryChoice && captureBerries.includes(settings.berryChoice)
      ? settings.berryChoice
      : null;
  const encounterBerryId =
    settings.encounterBerryChoice && encounterBerries.includes(settings.encounterBerryChoice)
      ? settings.encounterBerryChoice
      : null;

  const now = useNow(30_000);
  const placeWeather = inputs.weather !== undefined ? inputs.weather : zoneWeather(zone, now);
  const forecast = inputs.weather !== undefined ? undefined : zoneWeatherForecast(zone, now);
  const site = { ...zone, weather: placeWeather };
  const env = expeditionEnv(site, members, new Date().getHours());
  const check = checkTeam(ctx, site, members, env.hour);

  const berryLimit = maxExpeditionBerries(ctx);
  const maxBerries = (itemId: string | null) =>
    itemId ? (unlimitedItems ? berryLimit : Math.min(berryLimit, owned(itemId))) : 0;
  const berriesTaken = Math.min(settings.berryCount, maxBerries(berryId));
  const encounterBerriesTaken = Math.min(
    settings.encounterBerryCount,
    maxBerries(encounterBerryId),
  );
  const encounterBerry = encounterBerryId
    ? { itemId: encounterBerryId, quantity: encounterBerriesTaken }
    : null;
  const { encounters } = expeditionPlan(ctx, duration, env, encounterBerry);

  const preview = encounterPreview({
    ctx,
    zone,
    members,
    roamers: inputs.roamers,
    attracted: attractedTypes(ctx, env),
    caught: inputs.caught,
    ballPlan,
    boost: berryId ? ctx.itemEffect(berryId, 'captureBoost')?.multiplier : undefined,
    affinityCount: check.affinityCount,
    // Bonus permanents et talents de l'équipe, comme au serveur.
    captureBonus: abilityBonuses(ctx, env, bonuses ?? NO_BONUSES).capture,
    encounters,
    per,
  });
  // La baie de capture n'agit que le temps couvert par les baies envoyées.
  const berryShare = berryId ? Math.min(1, (berriesTaken * berryDurationMinutes) / duration) : 0;
  const captures = expectedCaptures(preview.rows, encounters, berryShare);
  const loot = zoneLoot(ctx, zone);

  return {
    ctx,
    zone,
    team: inputs.team,
    members,
    owned,
    unlimitedItems,
    rememberSettings: inputs.rememberSettings,
    duration,
    per,
    maxDurationMinutes,
    maxTeamSize,
    lootIntervalMinutes,
    berryDurationMinutes,
    balls,
    captureBerries,
    encounterBerries,
    ballChoice: settings.ballChoice,
    setBallChoice: settings.setBallChoice,
    showIvBalls: settings.showIvBalls,
    setShowIvBalls: settings.setShowIvBalls,
    ballCategories,
    ballPlan,
    berryId,
    setBerryId: settings.setBerryId,
    berriesTaken,
    setBerryCount: settings.setBerryCount,
    encounterBerryId,
    setEncounterBerryId: settings.setEncounterBerryId,
    encounterBerriesTaken,
    setEncounterBerryCount: settings.setEncounterBerryCount,
    maxBerries,
    berriesChosen: [
      ...(berryId ? [{ itemId: berryId, count: berriesTaken }] : []),
      ...(encounterBerryId ? [{ itemId: encounterBerryId, count: encounterBerriesTaken }] : []),
    ],
    zoneAutoTransfer: settings.zoneAutoTransfer,
    setZoneAutoTransfer: settings.setZoneAutoTransfer,
    globalAutoTransfer: settings.globalAutoTransfer,
    autoTransfer: settings.autoTransfer,
    /** Météo effective, talents de l'équipe compris ; `placeWeather` est celle de la zone. */
    weather: resolveWeather(ctx, env),
    placeWeather,
    forecast,
    env,
    check,
    powerOk: check.power >= zone.minPower,
    minMinutes: expeditionMinMinutes(ctx, zone.minDurationMinutes, env),
    ...encounterRhythm(ctx, env),
    encounters,
    xp: expectedExpeditionXp(ctx, zone, duration, bonuses, env),
    activeAbilities: activityAbilityEffects(ctx, env),
    roamers: preview.roamers,
    specials: preview.specials,
    encounterRows: preview.rows,
    maxShare: Math.max(0.0001, ...preview.rows.map((r) => r.share)),
    captureText: `≈ ${captures} capture${captures > 1 ? 's' : ''} ${per}`,
    usageText: ballUsageText({
      ctx,
      usage: ballUsage(preview.rows, encounters),
      encounters,
      owned,
      unlimitedItems,
      env,
      encounterBerry,
    }),
    loot,
    maxLoot: Math.max(0.0001, ...loot.map((l) => l.probability)),
    shinyRate: formatShinyRate(
      Math.min(
        1,
        shinyProbability(ctx, { chain, charm, bonus: shinyBonus }) *
          abilityMultiplier(ctx, env, 'shinyChance'),
      ),
    ),
    shinyDetails: [
      chain > 0 && `chaîne ${chain}`,
      charm > 1 && 'Charme Chroma',
      shinyBonus > 1 && `bonus +${formatPercentBonus(shinyBonus)}`,
    ]
      .filter(Boolean)
      .join(', '),
    chainText: chainSummary(ctx, chain),
    tint: zoneTint(zoneSpecies(ctx, zone)),
    status: launchStatus(inputs.team, check.errors),
  };
}
