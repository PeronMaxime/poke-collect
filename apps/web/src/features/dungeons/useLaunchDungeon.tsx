/**
 * Départ d'une tentative de donjon : équipe choisie, règles, météo et gains attendus.
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Dungeon } from '@poke/content';
import { typeWeaknesses } from '@poke/data';
import {
  checkDungeonTeam,
  dungeonEnemies,
  dungeonEnv,
  dungeonMaxXp,
  dungeonWeather,
  imposedWeather,
  pokemonPower,
} from '@poke/game-core';
import type {
  AbilityEnv,
  DungeonMove,
  DungeonTeamError,
  ExpeditionSite,
  GameContext,
} from '@poke/game-core';
import type { StartDungeonInput } from '@poke/shared';
import { keys, refresh, startDungeon } from '../../lib/queries';
import { EnemyInfo, combatMove } from '../common/CombatTeamOrder';
import { useTeamPicker } from '../common/teamPicker/useTeamPicker';
import { TEAM_WEATHER_NOTE } from '../common/WeatherIcon';
import { usePlayerBonuses } from '../common/XpPreview';

/** Règle d'équipe non respectée, en clair. */
export function ruleText(e: DungeonTeamError): string {
  switch (e.code) {
    case 'TEAM_EMPTY':
      return 'Choisis au moins un Pokémon.';
    case 'TEAM_TOO_LARGE':
      return `Au plus ${e.max} Pokémon.`;
    case 'DUPLICATE_MEMBER':
      return 'Un Pokémon est sélectionné deux fois.';
    case 'TOO_MANY_MEGAS':
      return 'Un seul Pokémon Méga-Évolué par équipe.';
    case 'WRONG_REGION':
      return 'Seuls les Pokémon du Pokédex de la région peuvent entrer dans ce donjon.';
    case 'INVALID_MOVE':
      return 'Une attaque choisie n’est pas d’un type du Pokémon.';
  }
}

/** Fiche du boss au survol : statistiques, faiblesses et résistances, attaque. */
function BossInfo({ ctx, dungeon }: { ctx: GameContext; dungeon: Dungeon }) {
  const boss = dungeonEnemies(ctx, dungeon).at(-1);
  if (!boss) return null;
  return (
    <EnemyInfo
      fighter={boss}
      note={dungeon.bossHpMultiplier !== 1 ? `PV ×${dungeon.bossHpMultiplier} (boss)` : null}
    />
  );
}

/** Tout ce qu'affichent les pièces de la fenêtre de départ d'un donjon. */
export type LaunchDungeonModel = ReturnType<typeof useLaunchDungeon>;

/**
 * Équipe et attaques choisies pour un donjon ; les Pokémon dont un type est efficace contre le
 * boss sont mis en évidence dans le choix de l'équipe.
 */
export function useLaunchDungeon({
  ctx,
  dungeon,
  onClose,
}: {
  ctx: GameContext;
  dungeon: Dungeon;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const boss = ctx.species(dungeon.boss.speciesId, dungeon.boss.formId);
  const bossTypes = boss?.types ?? [];
  // Les Pokémon dont un type est efficace contre le boss sont mis en évidence.
  const site: ExpeditionSite = {
    regionId: dungeon.regionId,
    minPower: 0,
    requiredTypes: [],
    affinityTypes: typeWeaknesses(bossTypes),
  };
  const picker = useTeamPicker(ctx, site);
  const [moves, setMoves] = useState<Record<string, DungeonMove>>({});
  const maxTeamSize = ctx.balance.dungeons.maxTeamSize;
  const bonuses = usePlayerBonuses(ctx);
  const bossInfo = <BossInfo ctx={ctx} dungeon={dungeon} />;

  const start = useMutation({
    mutationFn: (input: StartDungeonInput) => startDungeon(input),
    onSuccess: () => {
      onClose();
      return refresh(queryClient, keys.dungeons, keys.pokemon);
    },
  });

  const members = picker.members;
  const hour = new Date().getHours();
  const maxXp = dungeonMaxXp(ctx, dungeon, bonuses, members, hour);
  const weather = dungeonWeather(ctx, dungeon, members, hour);
  // Talents de l'équipe : adversaires du donjon, heure actuelle (celle du départ) et météo du lieu.
  const env: AbilityEnv = {
    ...dungeonEnv({ enemies: dungeonEnemies(ctx, dungeon) }, members, hour),
    weather: dungeon.weather ?? null,
  };
  const weatherNote = imposedWeather(ctx, { activity: 'dungeon', team: members })
    ? TEAM_WEATHER_NOTE
    : weather !== (dungeon.weather ?? null)
      ? 'Imposée par le talent d’un adversaire.'
      : undefined;
  const withMoves = members.map((p) => ({ ...p, move: combatMove(ctx, p, moves) }));
  const errors = checkDungeonTeam(ctx, dungeon, withMoves);
  const power = members.reduce(
    (sum, p) => sum + pokemonPower(ctx.species(p.speciesId, p.formId)!, p),
    0,
  );

  return {
    ctx,
    dungeon,
    onClose,
    boss,
    bossTypes,
    site,
    picker,
    moves,
    setMoves,
    maxTeamSize,
    bossInfo,
    start,
    members,
    maxXp,
    weather,
    env,
    weatherNote,
    withMoves,
    errors,
    power,
  };
}
