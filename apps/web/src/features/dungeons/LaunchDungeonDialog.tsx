import type { Dungeon } from '@poke/content';
import { typeWeaknesses } from '@poke/data';
import { dungeonCooldownMinutes } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import { HoverBubble, Modal, PokemonSprite, TypeBadge } from '../../components/ui';
import {
  errorText,
  formatDuration,
  formatMoney,
  itemIcon,
  itemName,
  typeLabel,
} from '../../lib/labels';
import { CombatFoes } from '../common/CombatTeamOrder';
import { DungeonDifficultyBadge } from './DungeonDifficultyBadge';
import { TeamPicker } from '../common/TeamPicker';
import { WeatherIcon } from '../common/WeatherIcon';
import { TeamSection } from '../common/TeamSection';
import { formatXp } from '../common/XpPreview';
import { ruleText, useLaunchDungeon } from './useLaunchDungeon';
import type { LaunchDungeonModel } from './useLaunchDungeon';

/** Fenêtre de départ d'un donjon : le boss et ses adversaires, l'équipe, les gains, puis l'entrée. */
export function LaunchDungeonDialog(props: {
  ctx: GameContext;
  dungeon: Dungeon;
  onClose: () => void;
}) {
  const d = useLaunchDungeon(props);
  const { dungeon, onClose, start, members, withMoves, errors } = d;
  return (
    <Modal open onClose={onClose} wide>
      <DungeonHeader d={d} />
      <TeamBlock d={d} />
      <DungeonRewards d={d} />
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

/** Le boss (fiche au survol), le donjon, sa difficulté et ses adversaires. */
function DungeonHeader({ d }: { d: LaunchDungeonModel }) {
  const { ctx, dungeon, bossTypes, bossInfo, weather, weatherNote } = d;
  return (
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
  );
}

/** Équipe du joueur et fenêtre de son choix. */
function TeamBlock({ d }: { d: LaunchDungeonModel }) {
  const {
    ctx,
    dungeon,
    boss,
    bossTypes,
    site,
    picker,
    moves,
    setMoves,
    maxTeamSize,
    bossInfo,
    members,
    maxXp,
    env,
    errors,
    power,
  } = d;
  return (
    <TeamSection
      ctx={ctx}
      title={`Équipe · ${dungeon.name}`}
      env={env}
      members={members}
      xp={maxXp}
      maxTeamSize={maxTeamSize}
      power={power}
      header={
        <CombatFoes
          ctx={ctx}
          foes={[
            ...dungeon.opponents.map((m) => ({
              speciesId: m.speciesId,
              formId: m.formId,
              level: m.level,
              types: ctx.species(m.speciesId, m.formId)?.types ?? [],
            })),
            {
              speciesId: dungeon.boss.speciesId,
              formId: dungeon.boss.formId,
              level: dungeon.boss.level,
              types: bossTypes,
              info: bossInfo,
              boss: true,
            },
          ]}
        />
      }
      onAutoSelect={() => picker.autoSelect(maxTeamSize)}
    >
      {(close) => (
        <TeamPicker
          ctx={ctx}
          zone={site}
          picker={picker}
          power={power}
          maxTeamSize={maxTeamSize}
          statSort
          abilityEnv={env}
          errors={errors.map(ruleText)}
          onDone={close}
          combat={{
            moves,
            setMoves,
            targets: [{ name: boss?.nameFr ?? 'le boss', types: bossTypes }],
          }}
          affinityHint={`Efficace contre ${boss?.nameFr ?? 'le boss'}`}
        />
      )}
    </TeamSection>
  );
}

/** Gains d'une victoire et rappel des règles d'XP, de K.O. et de fermeture du donjon. */
function DungeonRewards({ d }: { d: LaunchDungeonModel }) {
  const { ctx, dungeon, bossTypes, maxXp } = d;
  return (
    <div className="mt-5 grid gap-1 rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-800/60">
      <p>
        <span className="font-semibold">Victoire :</span>{' '}
        {dungeon.money > 0 ? formatMoney(dungeon.money) : 'aucun argent'}
        {dungeon.gemItemId && (
          <span className="ml-1 inline-flex items-center gap-1">
            · <img src={itemIcon(ctx, dungeon.gemItemId)} alt="" className="h-5 w-5" />
            {itemName(ctx, dungeon.gemItemId)} ({Math.round(dungeon.gemChance * 100)} % de chances)
          </span>
        )}
      </p>
      <p>
        <span className="font-semibold">XP gagnée :</span> jusqu’à {formatXp(maxXp)} par Pokémon si
        tous les adversaires sont vaincus
      </p>
      <p className="mt-2 text-xs text-slate-500">
        Chaque adversaire vaincu rapporte de l’XP à toute l’équipe, même en cas de défaite (pas en
        cas de fuite). Les Pokémon mis K.O. le restent jusqu’à leurs soins au Centre Pokémon. Après
        chaque tentative, le donjon se referme pendant{' '}
        {formatDuration(dungeonCooldownMinutes(ctx, dungeon))}.{' '}
        {bossTypes.length > 0 &&
          `Le boss est faible contre : ${typeWeaknesses(bossTypes).map(typeLabel).join(', ') || 'rien'}.`}
      </p>
    </div>
  );
}
