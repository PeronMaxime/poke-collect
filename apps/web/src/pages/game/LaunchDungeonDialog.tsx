import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Dungeon } from '@poke/content';
import { typeWeaknesses } from '@poke/data';
import {
  checkDungeonTeam,
  dungeonCooldownMinutes,
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
import type { DungeonRunDto, StartDungeonInput } from '@poke/shared';
import { HoverBubble, Modal, PokemonSprite, TypeBadge } from '../../components/ui';
import { api } from '../../lib/api';
import { PLAYER_STATE_KEYS, utcOffsetMinutes } from '../../lib/game';
import {
  errorText,
  formatDuration,
  formatMoney,
  itemIcon,
  itemName,
  typeLabel,
} from '../../lib/labels';
import { CombatTeamOrder, EnemyInfo, combatMove } from './CombatTeamOrder';
import { DungeonDifficultyBadge } from './DungeonDifficultyBadge';
import { TeamPicker, useTeamPicker } from './TeamPicker';
import { TEAM_WEATHER_NOTE, WeatherIcon } from './WeatherIcon';
import { XpPreview, formatXp, usePlayerBonuses } from './XpPreview';

function ruleText(e: DungeonTeamError): string {
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

export function LaunchDungeonDialog({
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
    durationsMinutes: [],
  };
  const picker = useTeamPicker(ctx, site);
  const [moves, setMoves] = useState<Record<string, DungeonMove>>({});
  const maxTeamSize = ctx.balance.dungeons.maxTeamSize;
  const bonuses = usePlayerBonuses(ctx);
  const bossInfo = <BossInfo ctx={ctx} dungeon={dungeon} />;

  const start = useMutation({
    mutationFn: (input: StartDungeonInput) =>
      api<DungeonRunDto>('/api/dungeons', {
        method: 'POST',
        json: { ...input, utcOffsetMinutes: utcOffsetMinutes() },
      }),
    onSuccess: () => {
      onClose();
      return Promise.all(
        PLAYER_STATE_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
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

  return (
    <Modal open onClose={onClose} wide>
      <div className="flex flex-wrap items-center gap-3">
        <HoverBubble width={232} height={420} content={bossInfo}>
          <PokemonSprite
            speciesId={dungeon.boss.speciesId}
            formId={dungeon.boss.formId}
            size={88}
            kind="artwork"
          />
        </HoverBubble>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-slate-500">Donjon</p>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            {dungeon.name}
            {(weather || weatherNote) && (
              <WeatherIcon weather={weather ?? 'clear'} activity="dungeon" note={weatherNote} />
            )}
          </h2>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
            <DungeonDifficultyBadge ctx={ctx} dungeon={dungeon} />
            {dungeon.opponents.length + 1} combats ·{' '}
            {formatDuration(Math.ceil(dungeon.timeLimitSeconds / 60))} pour vaincre le boss
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {bossTypes.map((t) => (
              <TypeBadge key={t} type={t} />
            ))}
          </div>
        </div>
        <div className="hidden gap-0.5 sm:flex">
          {dungeon.opponents.map((m, i) => (
            <span key={i} className="flex flex-col items-center text-[10px] text-slate-500">
              <PokemonSprite speciesId={m.speciesId} formId={m.formId} size={40} />
              N.{m.level}
            </span>
          ))}
          <HoverBubble
            className="flex flex-col items-center text-[10px] font-semibold text-amber-600"
            width={232}
            height={420}
            content={bossInfo}
          >
            <PokemonSprite
              speciesId={dungeon.boss.speciesId}
              formId={dungeon.boss.formId}
              size={40}
            />
            👑 N.{dungeon.boss.level}
          </HoverBubble>
        </div>
      </div>

      <TeamPicker
        ctx={ctx}
        zone={site}
        picker={picker}
        power={power}
        maxTeamSize={maxTeamSize}
        statSort
        abilityEnv={env}
      />
      <p className="mt-1 text-xs text-slate-500">
        Encadrés en vert : un de leurs types est efficace contre {boss?.nameFr ?? 'le boss'}.
      </p>

      {members.length > 0 && (
        <CombatTeamOrder
          ctx={ctx}
          members={members}
          moves={moves}
          setMoves={setMoves}
          setTeam={picker.setTeam}
          targets={[{ name: boss?.nameFr ?? 'le boss', types: bossTypes }]}
        />
      )}

      <div className="mt-5 grid gap-1 rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-800/60">
        <p>
          <span className="font-semibold">Victoire :</span>{' '}
          {dungeon.money > 0 ? formatMoney(dungeon.money) : 'aucun argent'}
          {dungeon.gemItemId && (
            <span className="ml-1 inline-flex items-center gap-1">
              · <img src={itemIcon(ctx, dungeon.gemItemId)} alt="" className="h-5 w-5" />
              {itemName(ctx, dungeon.gemItemId)} ({Math.round(dungeon.gemChance * 100)} % de
              chances)
            </span>
          )}
        </p>
        <XpPreview ctx={ctx} members={members} xp={maxXp}>
          jusqu’à {formatXp(maxXp)} par Pokémon si tous les adversaires sont vaincus
        </XpPreview>
        <p className="mt-2 text-xs text-slate-500">
          Chaque adversaire vaincu rapporte de l’XP à toute l’équipe, même en cas de défaite (pas en
          cas de fuite). Les Pokémon mis K.O. le restent jusqu’à leurs soins au Centre Pokémon.
          Après chaque tentative, le donjon se referme pendant{' '}
          {formatDuration(dungeonCooldownMinutes(ctx, dungeon))}.{' '}
          {bossTypes.length > 0 &&
            `Le boss est faible contre : ${typeWeaknesses(bossTypes).map(typeLabel).join(', ') || 'rien'}.`}
        </p>
      </div>

      {members.length > 0 && errors.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm text-red-600">
          {errors.map((e) => (
            <li key={e.code}>{ruleText(e)}</li>
          ))}
        </ul>
      )}
      {start.error && <p className="mt-4 text-sm text-red-600">{errorText(start.error)}</p>}

      <div className="mt-6 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>
          Annuler
        </button>
        <button
          className="btn-primary"
          disabled={errors.length > 0 || start.isPending}
          onClick={() =>
            start.mutate({
              dungeonId: dungeon.id,
              team: members.map((p) => p.id),
              moves: withMoves.map((m) => m.move),
            })
          }
        >
          Entrer dans le donjon
        </button>
      </div>
    </Modal>
  );
}
