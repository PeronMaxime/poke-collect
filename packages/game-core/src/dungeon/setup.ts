import type { Dungeon, DungeonDifficultySettings, TrainerPokemon, Weather } from '@poke/content';
import { STAT_NAMES } from '@poke/data';
import type { Stats } from '@poke/data';
import type { GameContext } from '../context';
import { computeStats } from '../pokemon';
import type { PokemonInstance } from '../pokemon';
import { imposedWeather, weatherOrClear } from '../abilities';
import type { AbilityActivity } from '../abilities';
import { bestCategory, effectiveDungeonMove } from './moves';
import type { DungeonMove } from './moves';
import { fighter, withAbilities } from './traits';
import type { DungeonFighter, DungeonSetup } from './types';

/**
 * Mise en place d'un combat : adversaires (difficulté, boss), météo de l'arène, équipe du joueur.
 */

/** Niveau de difficulté d'un donjon (information pour le joueur, sans effet sur le combat). */
export function dungeonDifficulty(ctx: GameContext, dungeon: Dungeon): DungeonDifficultySettings {
  return ctx.balance.dungeons.difficulties[dungeon.difficulty];
}

/** Pokémon adverse (donjon, dresseur ou équipe type) : IV uniformes, nature neutre par défaut. */
export function dungeonOpponentInstance(member: TrainerPokemon, defaultIv: number) {
  const iv = member.iv ?? defaultIv;
  return {
    speciesId: member.speciesId,
    formId: member.formId ?? null,
    level: member.level,
    ivs: Object.fromEntries(STAT_NAMES.map((s) => [s, iv])) as Stats,
    nature: member.nature ?? 'hardy',
  };
}

/** Adversaires d'un combat, dans l'ordre ; PV du dernier multipliés par `lastHpMultiplier`. */
export function enemyFighters(
  ctx: GameContext,
  members: readonly TrainerPokemon[],
  defaultIv: number,
  lastHpMultiplier = 1,
): DungeonFighter[] {
  return members.flatMap((member, i) => {
    const species = ctx.species(member.speciesId, member.formId);
    if (!species) return [];
    const instance = dungeonOpponentInstance(member, defaultIv);
    const last = i === members.length - 1;
    return [
      fighter(
        species,
        instance,
        { type: null, category: bestCategory(computeStats(species, instance)) },
        last ? lastHpMultiplier : 1,
      ),
    ];
  });
}

/** Adversaires du donjon, boss compris (en dernier, PV multipliés). */
export function dungeonEnemies(ctx: GameContext, dungeon: Dungeon): DungeonFighter[] {
  return enemyFighters(
    ctx,
    [...dungeon.opponents, dungeon.boss],
    ctx.balance.dungeons.defaultOpponentIv,
    dungeon.bossHpMultiplier,
  );
}

/** Adversaires porteurs de talent : premier talent de leur espèce (ou forme). */
function enemyAbilityHolders(ctx: GameContext, enemies: readonly DungeonFighter[]) {
  return enemies.map((e) => ({
    speciesId: e.speciesId,
    formId: e.formId,
    ability: ctx.species(e.speciesId, e.formId)?.abilities[0]?.name ?? '',
  }));
}

/** Combat à mettre en place : activité (talents), adversaires, temps imparti et météo du lieu. */
export interface CombatArena {
  activity: Extract<AbilityActivity, 'battle' | 'dungeon'>;
  enemies: readonly DungeonFighter[];
  timeLimitMs: number;
  /** Météo du lieu (donjon, zone du dresseur) ; absente = temps clair. */
  weather?: Weather | null;
}

/**
 * Météo d'un combat : imposée par un talent de l'équipe, sinon des adversaires (si
 * l'équilibrage active leurs talents), sinon celle du lieu.
 */
export function combatWeather(
  ctx: GameContext,
  arena: Omit<CombatArena, 'timeLimitMs'>,
  team: readonly PokemonInstance[],
  hour: number | null = null,
): Weather | null {
  const { activity } = arena;
  return weatherOrClear(
    imposedWeather(ctx, { activity, team, hour }) ??
      (ctx.balance.combat.enemyAbilities
        ? imposedWeather(ctx, { activity, team: enemyAbilityHolders(ctx, arena.enemies), hour })
        : null) ??
      arena.weather,
  );
}

/** Météo d'une tentative de donjon (voir `combatWeather`). */
export function dungeonWeather(
  ctx: GameContext,
  dungeon: Dungeon,
  team: readonly PokemonInstance[],
  hour: number | null = null,
): Weather | null {
  return combatWeather(
    ctx,
    { activity: 'dungeon', enemies: dungeonEnemies(ctx, dungeon), weather: dungeon.weather },
    team,
    hour,
  );
}

/** Mise en place d'une tentative de donjon (voir `buildCombatSetup`). */
export function buildDungeonSetup(
  ctx: GameContext,
  dungeon: Dungeon,
  team: readonly (PokemonInstance & { move: DungeonMove | null })[],
  seed: number,
  hour: number | null = null,
): DungeonSetup {
  return buildCombatSetup(
    ctx,
    {
      activity: 'dungeon',
      enemies: dungeonEnemies(ctx, dungeon),
      timeLimitMs: dungeon.timeLimitSeconds * 1000,
      weather: dungeon.weather,
    },
    team,
    seed,
    hour,
  );
}

/** Mise en place d'un combat : équipe (avec ses attaques), adversaires et réglages figés. */
export function buildCombatSetup(
  ctx: GameContext,
  arena: CombatArena,
  team: readonly (PokemonInstance & { move: DungeonMove | null })[],
  seed: number,
  hour: number | null = null,
): DungeonSetup {
  const { attacks, ...rest } = ctx.balance.combat;
  const typesOf = (list: readonly DungeonFighter[]) => [...new Set(list.flatMap((f) => f.types))];
  const baseTeam = team.map((m) => {
    const species = ctx.species(m.speciesId, m.formId)!;
    return fighter(species, m, effectiveDungeonMove(species, m, m.move));
  });
  const baseEnemies = [...arena.enemies];
  // Adversaires : premier talent de leur espèce (ou forme), si l'équilibrage l'active.
  const enemyHolders = enemyAbilityHolders(ctx, baseEnemies);
  const weather = combatWeather(ctx, arena, team, hour);
  const env = { activity: arena.activity, hour, weather, weatherResolved: true } as const;
  const teamFighters = withAbilities(
    ctx,
    { ...env, team, opponentTypes: typesOf(baseEnemies) },
    baseTeam,
  );
  const enemies = rest.enemyAbilities
    ? withAbilities(
        ctx,
        { ...env, team: enemyHolders, opponentTypes: typesOf(baseTeam) },
        baseEnemies,
      )
    : baseEnemies;
  return {
    team: teamFighters,
    enemies,
    settings: {
      baseAttackIntervalMs: rest.baseAttackIntervalMs,
      referenceSpeed: rest.referenceSpeed,
      minAttackIntervalMs: rest.minAttackIntervalMs,
      maxAttackIntervalMs: rest.maxAttackIntervalMs,
      damageMultiplier: rest.damageMultiplier,
      stabMultiplier: rest.stabMultiplier,
      minDamageRoll: rest.minDamageRoll,
      critChance: rest.critChance,
      critMultiplier: rest.critMultiplier,
      recallCooldownMs: rest.recallCooldownSeconds * 1000,
      chipTickMs: rest.chipTickSeconds * 1000,
      attacks,
    },
    timeLimitMs: arena.timeLimitMs,
    seed,
    hour,
    weather,
    placeWeather: arena.weather ?? null,
  };
}

/**
 * Pokémon dont le talent impose la météo du combat (le premier de l'équipe, sinon des adversaires,
 * comme `combatWeather`), pour l'annoncer ; null = météo du lieu.
 */
export function combatWeatherSource(
  ctx: GameContext,
  setup: Pick<DungeonSetup, 'team' | 'enemies' | 'weather' | 'placeWeather'>,
): { side: 'player' | 'enemy'; fighter: DungeonFighter; ability: string } | null {
  const weather = setup.weather ?? null;
  if (setup.placeWeather === undefined || setup.placeWeather === weather) return null;
  for (const side of ['player', 'enemy'] as const) {
    for (const fighter of side === 'player' ? setup.team : setup.enemies) {
      const ability = fighter.ability;
      const imposes = ctx
        .ability(ability ?? '')
        ?.effects.some((e) => e.type === 'setWeather' && weatherOrClear(e.weather) === weather);
      if (ability && imposes) return { side, fighter, ability };
    }
  }
  return null;
}
