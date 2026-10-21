import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Trainer } from '@poke/content';
import {
  abilityBonuses,
  battleEnv,
  battleRealDurationMinutes,
  battleKoMinutes,
  battleXp,
  checkBattleTeam,
  estimateBattle,
  isRegionalSpecies,
  memberPower,
  resolveWeather,
} from '@poke/game-core';
import type { BattleError, GameContext } from '@poke/game-core';
import type { BattleDto, PokemonDto, StartBattleInput } from '@poke/shared';
import { PokemonTagBadges, TagFilterSelect, useTagFilter } from '../../components/tags';
import { Modal, PokemonSprite, ShinyStar, useNow } from '../../components/ui';
import { api } from '../../lib/api';
import {
  PLAYER_STATE_KEYS,
  isUsable,
  usePokemon,
  useTeams,
  utcOffsetMinutes,
} from '../../lib/game';
import { errorText, formatDuration, formatMoney, typeLabel } from '../../lib/labels';
import { TrainerSprite } from './BattlesPage';
import { TEAM_WEATHER_NOTE, WeatherIcon } from './WeatherIcon';
import { pillClass } from './LaunchExpeditionDialog';
import {
  MEGA_LOCKED_TITLE,
  NameSearch,
  SavedTeamsBar,
  TypeFilterSelect,
  megaLocked,
  nameMatcher,
  selectionRank,
  usePinnedSelection,
} from './TeamPicker';
import { XpPreview, formatXp, usePlayerBonuses } from './XpPreview';

const SORTS = {
  power: 'PE',
  level: 'Niveau',
  tag: 'Étiquette',
} as const;
type Sort = keyof typeof SORTS;

function ruleText(e: BattleError): string {
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
  }
}

function advantageText(advantage: number): { label: string; className: string } {
  if (advantage > 0.25) return { label: 'Avantage de types', className: 'text-emerald-600' };
  if (advantage < -0.25) return { label: 'Désavantage de types', className: 'text-red-600' };
  return { label: 'Types neutres', className: 'text-slate-500' };
}

/** Jauge de chances de victoire (rouge → vert). */
export function WinGauge({ probability }: { probability: number }) {
  const pct = Math.round(probability * 100);
  const color =
    probability >= 0.7 ? 'bg-emerald-500' : probability >= 0.4 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-semibold">Chances de victoire</span>
        <span className="font-mono text-lg font-bold">{pct} %</span>
      </div>
      <div className="mt-1 h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function LaunchBattleDialog({
  ctx,
  trainer,
  onClose,
}: {
  ctx: GameContext;
  trainer: Trainer;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const pokemon = usePokemon();
  const teams = useTeams();
  const now = useNow(10_000);
  const [team, setTeam] = useState<string[]>([]);
  const [sort, setSort] = useState<Sort>('power');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const tagFilter = useTagFilter();
  const pinned = usePinnedSelection(team, [sort, search, type, tagFilter.filter]);
  const bonuses = usePlayerBonuses(ctx);

  const start = useMutation({
    mutationFn: (input: StartBattleInput) =>
      api<BattleDto>('/api/battles', {
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

  const region = ctx.region(trainer.regionId);
  const matchesName = nameMatcher(search);
  const usablePokemon = (pokemon.data ?? []).filter(
    (p) => isUsable(p, now) && isRegionalSpecies(ctx, trainer.regionId, p.speciesId),
  );
  const available = usablePokemon
    .map((p) => {
      const species = ctx.species(p.speciesId, p.formId)!;
      return { p, species, power: memberPower(ctx, p) };
    })
    // Les membres déjà choisis restent visibles, quels que soient les filtres.
    .filter(
      ({ p, species }) =>
        (tagFilter.matches(p) &&
          matchesName(species.nameFr) &&
          (type === 'all' || species.types.includes(type))) ||
        team.includes(p.id),
    )
    // Les membres choisis passent en tête (dans l'ordre de sélection) au changement de filtre ou de tri.
    .sort(
      (a, b) =>
        selectionRank(pinned, a.p.id) - selectionRank(pinned, b.p.id) ||
        (sort === 'level' ? b.p.level - a.p.level : 0) ||
        (sort === 'tag' ? tagFilter.compare(a.p, b.p) : 0) ||
        b.power - a.power,
    );
  const members = team.flatMap((id) => available.find((a) => a.p.id === id)?.p ?? []);
  const maxSize = trainer.rules.teamSize ?? ctx.balance.battles.maxTeamSize;
  const hour = new Date().getHours();
  const errors = checkBattleTeam(ctx, trainer, members, hour);
  const estimate = estimateBattle(ctx, trainer, members, hour);
  const advantage = advantageText(estimate.advantage);
  const ko = battleKoMinutes(ctx, trainer);
  const duration = battleRealDurationMinutes(ctx, trainer, members, hour);
  const env = battleEnv(ctx, trainer, members, hour);
  const weather = resolveWeather(ctx, env);
  const zoneWeather = (trainer.zoneId && ctx.zone(trainer.zoneId)?.weather) || null;
  const xp = battleXp(ctx, trainer, abilityBonuses(ctx, env, bonuses));

  function toggle(p: PokemonDto) {
    if (megaLocked(p, members)) return;
    setTeam((t) =>
      t.includes(p.id) ? t.filter((id) => id !== p.id) : t.length < maxSize ? [...t, p.id] : t,
    );
  }

  return (
    <Modal open onClose={onClose} wide>
      <div className="flex items-center gap-3">
        <TrainerSprite trainer={trainer} size={80} />
        <div>
          <p className="text-sm text-slate-500">{trainer.trainerClass}</p>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            {trainer.name}
            {(weather || zoneWeather) && (
              <WeatherIcon
                weather={weather ?? 'clear'}
                activity="battle"
                note={weather !== zoneWeather ? TEAM_WEATHER_NOTE : undefined}
              />
            )}
          </h2>
          <p className="text-sm text-slate-500">
            PE {estimate.trainerPower} · {formatDuration(duration)} ·{' '}
            {trainer.money > 0 ? formatMoney(trainer.money) : 'Aucun argent'}
            {trainer.badge && ` · ${trainer.badge.name}`}
          </p>
        </div>
        <div className="ml-auto hidden gap-1 sm:flex">
          {trainer.team.map((m, i) => (
            <span key={i} className="flex flex-col items-center text-[10px] text-slate-500">
              <PokemonSprite speciesId={m.speciesId} formId={m.formId} size={48} />
              N.{m.level}
            </span>
          ))}
        </div>
      </div>

      <SavedTeamsBar
        ctx={ctx}
        teams={teams.data ?? []}
        pokemon={pokemon.data ?? []}
        usable={new Set(usablePokemon.map((p) => p.id))}
        maxSize={maxSize}
        current={team}
        onPick={setTeam}
      />
      <div className="mt-5 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">
          Ton équipe ({team.length} / {maxSize})
        </h3>
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <span className="text-slate-500">Trier par</span>
          {(Object.keys(SORTS) as Sort[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setSort(key)}
              className={pillClass(sort === key)}
            >
              {SORTS[key]}
            </button>
          ))}
          <TagFilterSelect
            tags={tagFilter.tags}
            value={tagFilter.filter}
            onChange={tagFilter.setFilter}
            className="ml-1 py-0.5 text-xs"
          />
          <TypeFilterSelect value={type} onChange={setType} />
          <NameSearch value={search} onChange={setSearch} />
        </div>
        <span className="text-sm text-slate-500">PE {estimate.playerPower}</span>
      </div>
      <div className="mt-2 grid max-h-64 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-5">
        {available.map(({ p, species, power }) => {
          const selected = team.includes(p.id);
          const locked = megaLocked(p, members);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(p)}
              disabled={locked}
              title={locked ? MEGA_LOCKED_TITLE : undefined}
              className={`flex flex-col items-center rounded-xl border p-1 text-xs transition disabled:cursor-not-allowed disabled:opacity-40 disabled:grayscale ${
                selected
                  ? 'border-brand-500 bg-brand-500/10'
                  : 'border-slate-200 hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800'
              }`}
            >
              <PokemonSprite
                speciesId={p.speciesId}
                formId={p.formId}
                shiny={p.isShiny}
                size={56}
              />
              <span className="truncate">
                {species.nameFr} {p.isShiny && <ShinyStar />}
              </span>
              <span className="text-slate-500">
                N.{p.level} · PE {power}
              </span>
              <PokemonTagBadges pokemon={p} tags={tagFilter.tags} />
            </button>
          );
        })}
        {available.length === 0 && (
          <p className="col-span-full text-sm text-slate-500">
            {tagFilter.filter === 'all' && type === 'all' && !search.trim()
              ? `Aucun Pokémon de ${region?.name} disponible : ils sont occupés, K.O., ou pas encore capturés.`
              : `Aucun Pokémon de ${region?.name} disponible avec ces filtres.`}
          </p>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Seuls les Pokémon du Pokédex de {region?.name} peuvent affronter les dresseurs de la région.
      </p>

      <div className="mt-5 grid gap-4 rounded-xl bg-slate-100 p-4 sm:grid-cols-[1fr_auto] dark:bg-slate-800/60">
        <WinGauge probability={estimate.winProbability} />
        <div className="text-sm sm:text-right">
          <p className={advantage.className}>{members.length > 0 ? advantage.label : '—'}</p>
          <p className="text-slate-500">
            PE effective {Math.round(estimate.effectivePower)} / {estimate.trainerPower}
          </p>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Estimation calculée par le serveur au moment du combat. En cas de défaite, l’équipe est K.O.
        pendant {formatDuration(ko)} et ne gagne
        {ctx.balance.battles.lossXpFraction > 0
          ? ` que ${Math.round(ctx.balance.battles.lossXpFraction * 100)} % de l’XP`
          : ' aucune XP'}
        .
      </p>
      <XpPreview ctx={ctx} members={members} xp={xp.win}>
        {formatXp(xp.win)} par Pokémon en cas de victoire
        {xp.loss > 0 && (
          <span className="text-slate-500"> ({formatXp(xp.loss)} en cas de défaite)</span>
        )}
      </XpPreview>

      {team.length > 0 && errors.length > 0 && (
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
          onClick={() => start.mutate({ trainerId: trainer.id, team })}
        >
          Combattre ({formatDuration(duration)})
        </button>
      </div>
    </Modal>
  );
}
