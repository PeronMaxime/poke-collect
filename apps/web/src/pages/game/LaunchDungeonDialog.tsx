import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Dungeon } from '@poke/content';
import { STAT_NAMES, typeWeaknesses, types } from '@poke/data';
import {
  checkDungeonTeam,
  computeStats,
  dungeonAttack,
  dungeonCooldownMinutes,
  dungeonEnemies,
  dungeonKoMinutes,
  dungeonMaxXp,
  dungeonTypeEffectiveness,
  effectiveDungeonMove,
  pokemonPower,
} from '@poke/game-core';
import type { DungeonMove, DungeonTeamError, ExpeditionSite, GameContext } from '@poke/game-core';
import type { DungeonRunDto, PokemonDto, StartDungeonInput } from '@poke/shared';
import {
  HoverBubble,
  Modal,
  PokemonSprite,
  ShinyStar,
  StatLines,
  TypeBadge,
} from '../../components/ui';
import { api } from '../../lib/api';
import { PLAYER_STATE_KEYS } from '../../lib/game';
import {
  STAT_LABELS,
  errorText,
  formatDuration,
  formatMoney,
  itemIcon,
  itemName,
  typeLabel,
} from '../../lib/labels';
import { DungeonDifficultyBadge } from './DungeonDifficultyBadge';
import { TeamPicker, pillClass, useTeamPicker } from './TeamPicker';
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

/** Multiplicateur lisible (×2, ×½, ×¼, ×⅛…). */
function effectivenessLabel(e: number): string {
  if (e === 0.5) return '×½';
  if (e === 0.25) return '×¼';
  if (e === 0.125) return '×⅛';
  if (e < 0.125) return `×1/${Math.round(1 / e)}`;
  return `×${e}`;
}

const effectivenessClass = (e: number) =>
  e > 1 ? 'text-emerald-600' : e < 1 ? 'text-red-600' : 'text-slate-500';

/** Types techniques des données, qui ne sont pas des types d'attaque. */
const NON_POKEMON_TYPES = new Set(['stellar', 'unknown', 'shadow']);

/** Types d'attaque regroupés par efficacité contre le boss (×4, ×2, ×½, ×¼…, une immunité comptant ×¼). */
function matchups(bossTypes: readonly string[]) {
  const byFactor = new Map<number, string[]>();
  for (const { name } of types) {
    const e = dungeonTypeEffectiveness(name, bossTypes);
    if (e !== 1 && !NON_POKEMON_TYPES.has(name)) {
      byFactor.set(e, [...(byFactor.get(e) ?? []), name]);
    }
  }
  return [...byFactor.entries()].sort(([a], [b]) => b - a);
}

/** Fiche du boss au survol : statistiques, faiblesses et résistances, attaque. */
function BossInfo({ ctx, dungeon }: { ctx: GameContext; dungeon: Dungeon }) {
  const boss = dungeonEnemies(ctx, dungeon).at(-1);
  if (!boss) return null;
  const stats = { ...boss.stats, hp: boss.maxHp };
  const total = STAT_NAMES.reduce((sum, s) => sum + stats[s], 0);
  const special = boss.category === 'special';
  return (
    <span className="grid gap-2">
      <span>
        <span className="mb-0.5 block font-semibold">Statistiques</span>
        <StatLines values={stats} total={total} />
        {dungeon.bossHpMultiplier !== 1 && (
          <span className="block text-[10px] text-slate-500">
            PV ×{dungeon.bossHpMultiplier} (boss)
          </span>
        )}
      </span>
      <span>
        <span className="mb-0.5 block font-semibold">Faiblesses et résistances</span>
        {matchups(boss.types).map(([e, list]) => (
          <span key={e} className="mb-0.5 flex items-start gap-1">
            <span className={`w-6 shrink-0 font-semibold ${effectivenessClass(e)}`}>
              {effectivenessLabel(e)}
            </span>
            <span className="flex flex-wrap gap-0.5">
              {list.map((t) => (
                <TypeBadge key={t} type={t} />
              ))}
            </span>
          </span>
        ))}
      </span>
      <span>
        <span className="mb-0.5 block font-semibold">Attaque</span>
        <span className="block">
          {special ? 'Spéciale' : 'Physique'} ({STAT_LABELS[special ? 'special-attack' : 'attack']}{' '}
          {stats[special ? 'special-attack' : 'attack']})
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-0.5">
          {boss.types.map((t) => (
            <TypeBadge key={t} type={t} />
          ))}
        </span>
        <span className="block text-[10px] text-slate-500">
          {boss.types.length > 1
            ? 'Choisit le plus efficace de ses types contre le Pokémon en face.'
            : 'Attaque toujours de son type.'}
        </span>
      </span>
    </span>
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
  const maxXp = dungeonMaxXp(ctx, dungeon, usePlayerBonuses(ctx));
  const bossInfo = <BossInfo ctx={ctx} dungeon={dungeon} />;

  const start = useMutation({
    mutationFn: (input: StartDungeonInput) =>
      api<DungeonRunDto>('/api/dungeons', { method: 'POST', json: input }),
    onSuccess: () => {
      onClose();
      return Promise.all(
        PLAYER_STATE_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
  });

  const members = picker.members;
  const moveOf = (p: PokemonDto): DungeonMove => {
    const species = ctx.species(p.speciesId, p.formId)!;
    return effectiveDungeonMove(species, p, moves[p.id] ?? p.dungeonMove);
  };
  const withMoves = members.map((p) => ({ ...p, move: moveOf(p) }));
  const errors = checkDungeonTeam(ctx, dungeon, withMoves);
  const power = members.reduce(
    (sum, p) => sum + pokemonPower(ctx.species(p.speciesId, p.formId)!, p),
    0,
  );

  function move(index: number, delta: number) {
    picker.setTeam((t) => {
      const next = [...t];
      const target = index + delta;
      if (target < 0 || target >= next.length) return t;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

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
          <h2 className="text-xl font-bold">{dungeon.name}</h2>
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
      />
      <p className="mt-1 text-xs text-slate-500">
        Encadrés en vert : un de leurs types est efficace contre {boss?.nameFr ?? 'le boss'}.
      </p>

      {members.length > 0 && (
        <section className="mt-5">
          <h3 className="text-sm font-semibold">Ordre d’entrée et attaques</h3>
          <p className="text-xs text-slate-500">
            Le premier entre en combat ; quand un Pokémon est K.O., le suivant prend le relais.
            Chaque Pokémon attaque avec un de ses types, en physique (Attaque) ou en spécial (Atq.
            Spé.).
          </p>
          <ol className="mt-2 space-y-2">
            {members.map((p, i) => {
              const species = ctx.species(p.speciesId, p.formId)!;
              const stats = computeStats(species, p);
              const current = moveOf(p);
              const setMove = (patch: Partial<DungeonMove>) =>
                setMoves((m) => ({ ...m, [p.id]: { ...current, ...patch } }));
              return (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-2 dark:border-slate-800"
                >
                  <span className="w-5 text-center font-mono text-sm text-slate-400">{i + 1}</span>
                  <PokemonSprite
                    speciesId={p.speciesId}
                    formId={p.formId}
                    shiny={p.isShiny}
                    size={40}
                  />
                  <span className="w-28 min-w-0 text-sm">
                    <span className="block truncate font-medium">
                      {species.nameFr} {p.isShiny && <ShinyStar />}
                    </span>
                    <span className="text-xs text-slate-500">N.{p.level}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-1">
                    {species.types.map((t) => {
                      const e = bossTypes.length ? dungeonTypeEffectiveness(t, bossTypes) : 1;
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setMove({ type: t })}
                          title={`${dungeonAttack(ctx.balance.dungeons, t).name} : ${effectivenessLabel(e)} contre ${boss?.nameFr ?? 'le boss'}`}
                          className={`flex items-center gap-1 rounded-full p-0.5 pr-1.5 text-[11px] transition ${
                            current.type === t
                              ? 'ring-2 ring-brand-500 ring-offset-1 dark:ring-offset-slate-900'
                              : 'opacity-50 hover:opacity-100'
                          }`}
                        >
                          <TypeBadge type={t} />
                          <span className={`font-semibold ${effectivenessClass(e)}`}>
                            {effectivenessLabel(e)}
                          </span>
                        </button>
                      );
                    })}
                  </span>
                  <span className="flex items-center gap-1 text-xs">
                    <button
                      type="button"
                      className={pillClass(current.category === 'physical')}
                      onClick={() => setMove({ category: 'physical' })}
                      title={`${STAT_LABELS.attack} ${stats.attack}`}
                    >
                      Physique {stats.attack}
                    </button>
                    <button
                      type="button"
                      className={pillClass(current.category === 'special')}
                      onClick={() => setMove({ category: 'special' })}
                      title={`${STAT_LABELS['special-attack']} ${stats['special-attack']}`}
                    >
                      Spécial {stats['special-attack']}
                    </button>
                  </span>
                  <span className="ml-auto flex gap-1">
                    <button
                      type="button"
                      className="btn-ghost px-2 py-0.5"
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                      aria-label="Monter"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn-ghost px-2 py-0.5"
                      disabled={i === members.length - 1}
                      onClick={() => move(i, 1)}
                      aria-label="Descendre"
                    >
                      ↓
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
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
          cas de fuite). Les Pokémon mis K.O. se reposent{' '}
          {formatDuration(dungeonKoMinutes(ctx, dungeon))}. Après chaque tentative, le donjon se
          referme pendant {formatDuration(dungeonCooldownMinutes(ctx, dungeon))}.{' '}
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
