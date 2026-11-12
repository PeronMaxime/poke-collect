/**
 * Départ d'un combat de dresseur : équipe choisie, règles du dresseur, météo et gains attendus.
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Trainer } from '@poke/content';
import { typeWeaknesses } from '@poke/data';
import {
  battleEnv,
  battleMaxXp,
  battleWeather,
  checkBattleTeam,
  imposedWeather,
  pokemonPower,
  trainerEnemies,
  zoneWeather,
} from '@poke/game-core';
import type { BattleError, DungeonMove, ExpeditionSite, GameContext } from '@poke/game-core';
import type { StartBattleInput } from '@poke/shared';
import { useNow } from '../../../components/ui';
import { keys, refresh, startBattle } from '../../../lib/queries';
import { typeLabel } from '../../../lib/labels';
import type { StatusTone } from '../../common/dialogParts';
import { combatMove } from '../../common/CombatTeamOrder';
import { useTeamPicker } from '../../common/teamPicker/useTeamPicker';
import { TEAM_WEATHER_NOTE, zoneWeatherForecast } from '../../common/WeatherIcon';
import { usePlayerBonuses } from '../../common/XpPreview';

/** Règle d'équipe non respectée, en clair. */
export function ruleText(e: BattleError): string {
  switch (e.code) {
    case 'TEAM_EMPTY':
      return 'Choisis au moins un Pokémon.';
    case 'TEAM_TOO_LARGE':
      return `Au plus ${e.max} Pokémon.`;
    case 'TEAM_SIZE':
      return `Ce dresseur exige exactement ${e.required} Pokémon.`;
    case 'DUPLICATE_MEMBER':
      return 'Un Pokémon est sélectionné deux fois.';
    case 'TOO_MANY_MEGAS':
      return 'Un seul Pokémon Méga-Évolué par équipe.';
    case 'WRONG_REGION':
      return 'Seuls les Pokémon du Pokédex de la région peuvent affronter ce dresseur.';
    case 'LEVEL_TOO_HIGH':
      return `Niveau ${e.maxLevel} maximum.`;
    case 'FORBIDDEN_TYPES':
      return `Types interdits : ${e.types.map(typeLabel).join(', ')}.`;
    case 'MISSING_TYPES':
      return `Il manque : ${e.missing.map((m) => `${m.count} × ${typeLabel(m.type)}`).join(', ')}.`;
    case 'POWER_TOO_LOW':
      return `PE de l’équipe insuffisante pour lancer le combat (${e.power} / ${e.minPower}).`;
    case 'INVALID_MOVE':
      return 'Une attaque choisie n’est pas d’un type du Pokémon.';
  }
}

/** Tout ce qu'affichent les pièces de la fenêtre de départ d'un combat. */
export type LaunchBattleModel = ReturnType<typeof useLaunchBattle>;

/**
 * Équipe et attaques choisies contre un dresseur ; talents, météo et conditions sont évalués à
 * l'instant présent (celui du départ).
 */
export function useLaunchBattle({
  ctx,
  trainer,
  onClose,
}: {
  ctx: GameContext;
  trainer: Trainer;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const enemies = trainerEnemies(ctx, trainer);
  // Les Pokémon dont un type est efficace contre un Pokémon du dresseur sont mis en évidence.
  const site: ExpeditionSite = {
    regionId: trainer.regionId,
    minPower: trainer.rules.minPower,
    requiredTypes: trainer.rules.requiredTypes,
    affinityTypes: [...new Set(enemies.flatMap((e) => typeWeaknesses(e.types)))],
  };
  const picker = useTeamPicker(ctx, site, undefined, {
    forbiddenTypes: trainer.rules.forbiddenTypes,
    maxLevel: trainer.rules.maxLevel,
  });
  const [moves, setMoves] = useState<Record<string, DungeonMove>>({});
  const maxTeamSize = trainer.rules.teamSize ?? ctx.balance.battles.maxTeamSize;
  const bonuses = usePlayerBonuses(ctx);

  const start = useMutation({
    mutationFn: (input: StartBattleInput) => startBattle(input),
    onSuccess: () => {
      onClose();
      return refresh(queryClient, keys.battles, keys.pokemon);
    },
  });

  const members = picker.members;
  // Talents, météo et conditions : évalués à l'instant présent (celui du départ).
  const now = useNow(10_000);
  const hour = new Date(now).getHours();
  const withMoves = members.map((p) => ({ ...p, move: combatMove(ctx, p, moves) }));
  const errors = checkBattleTeam(ctx, trainer, withMoves, hour, now);
  const env = battleEnv(ctx, trainer, members, hour, now);
  const power = members.reduce(
    (sum, p) => sum + pokemonPower(ctx.species(p.speciesId, p.formId)!, p),
    0,
  );
  const maxXp = battleMaxXp(ctx, trainer, bonuses, members, hour);
  const zone = trainer.zoneId ? ctx.zone(trainer.zoneId) : undefined;
  const weather = battleWeather(ctx, trainer, members, hour, now);
  const placeWeather = zone ? zoneWeather(zone, now) : null;
  const forecast = zone && zoneWeatherForecast(zone, now);
  const weatherNote = imposedWeather(ctx, { activity: 'battle', team: members })
    ? TEAM_WEATHER_NOTE
    : weather !== placeWeather
      ? 'Imposée par le talent d’un adversaire.'
      : undefined;
  const targets = enemies.map((e) => ({
    name: ctx.species(e.speciesId, e.formId)?.nameFr ?? `#${e.speciesId}`,
    types: e.types,
  }));

  const status: { tone: StatusTone; text: string } =
    members.length === 0
      ? { tone: 'idle', text: 'Aucun Pokémon choisi' }
      : errors.length > 0
        ? { tone: 'bad', text: ruleText(errors[0]!) }
        : { tone: 'ok', text: 'Équipe prête' };

  return {
    ctx,
    trainer,
    onClose,
    enemies,
    site,
    picker,
    moves,
    setMoves,
    maxTeamSize,
    start,
    members,
    withMoves,
    errors,
    env,
    power,
    maxXp,
    weather,
    placeWeather,
    forecast,
    weatherNote,
    targets,
    status,
  };
}
