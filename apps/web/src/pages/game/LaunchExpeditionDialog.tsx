import { useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Weather, Zone } from '@poke/content';
import {
  NO_BONUSES,
  abilityBonuses,
  abilityMultiplier,
  attractedTypes,
  captureProbability,
  chainPerfectIvs,
  checkTeam,
  encounterProbabilities,
  expectedExpeditionXp,
  expeditionEnv,
  expeditionPlan,
  lootProbabilities,
  resolveWeather,
  roamerMeetChance,
  zoneWeather,
  nextChainPerfectIvThreshold,
  shinyProbability,
} from '@poke/game-core';
import type {
  AbilityEnv,
  CaptureFilter,
  ExpeditionError,
  GameContext,
  PlayerBonuses,
} from '@poke/game-core';
import type { ExpeditionDto, PokemonDto, RoamerDto, StartExpeditionInput } from '@poke/shared';
import { Modal, PokemonSprite, TypeBadge, useNow } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import {
  PLAYER_STATE_KEYS,
  useExpeditions,
  useInventory,
  useShinyCharm,
  utcOffsetMinutes,
} from '../../lib/game';
import {
  GAME_ERRORS,
  formatDuration,
  formatShinyRate,
  itemIcon,
  itemName,
  speciesName,
  typeLabel,
} from '../../lib/labels';
import { ActiveAbilities } from './ActiveAbilities';
import { TeamPicker, pillClass, useTeamPicker } from './TeamPicker';
import { TEAM_WEATHER_NOTE, WeatherIcon, zoneWeatherForecast } from './WeatherIcon';
import { XpPreview, formatXp, usePlayerBonuses } from './XpPreview';

export { pillClass };

/** Les objets rares (1 %, menthes…) ne doivent pas s'afficher « 0 % ». */
function formatChance(p: number): string {
  const pct = p * 100;
  return pct < 1 ? '< 1 %' : `${Math.round(pct)} %`;
}

const SHINY_MODES = {
  any: 'Indifférent',
  always: 'Toujours tenter',
  only: 'Uniquement',
} as const;

// Les shiny restent tentés par défaut : un filtre ne doit pas en faire manquer un par mégarde.
const NO_FILTER: CaptureFilter = { speciesIds: [], minPerfectIvs: 0, shiny: 'always' };

export function teamErrorText(e: ExpeditionError): string {
  switch (e.code) {
    case 'DURATION_NOT_ALLOWED':
      return 'Durée non disponible pour cette zone.';
    case 'TEAM_EMPTY':
      return 'Choisis au moins un Pokémon.';
    case 'TEAM_TOO_LARGE':
      return `Au plus ${e.max} Pokémon.`;
    case 'DUPLICATE_MEMBER':
      return 'Un Pokémon est sélectionné deux fois.';
    case 'TOO_MANY_MEGAS':
      return 'Un seul Pokémon Méga-Évolué par équipe.';
    case 'WRONG_REGION':
      return 'Seuls les Pokémon du Pokédex de la région peuvent explorer cette zone.';
    case 'POWER_TOO_LOW':
      return `PE de l’équipe insuffisante (${e.power} / ${e.minPower}).`;
    case 'MISSING_TYPES':
      return `Il manque : ${e.missing.map((m) => `${m.count} × ${typeLabel(m.type)}`).join(', ')}.`;
  }
}

export function LaunchExpeditionDialog({
  ctx,
  zone,
  chain,
  onClose,
}: {
  ctx: GameContext;
  zone: Zone;
  /** Maillon de la chaîne de zone qu'aurait cette expédition. */
  chain: number;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const charm = useShinyCharm(ctx);
  const inventory = useInventory();
  const picker = useTeamPicker(ctx, zone);
  const bonuses = usePlayerBonuses(ctx);
  const owned = new Map(inventory.data?.map((i) => [i.itemId, i.quantity]));
  const roamers = useExpeditions().data?.roamers.filter((r) => r.zoneId === zone.id);

  const start = useMutation({
    mutationFn: (input: StartExpeditionInput) =>
      api<ExpeditionDto>('/api/expeditions', {
        method: 'POST',
        json: { ...input, utcOffsetMinutes: utcOffsetMinutes() },
      }),
    onSuccess: () => {
      // Fermer avant le rechargement : l'équipe envoyée devient « occupée » et sortirait de la liste.
      onClose();
      return Promise.all(
        PLAYER_STATE_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
  });

  return (
    <Modal open onClose={onClose} wide>
      <LaunchExpeditionForm
        ctx={ctx}
        zone={zone}
        chain={chain}
        charm={charm}
        owned={(itemId) => owned.get(itemId) ?? 0}
        bonuses={bonuses}
        roamers={roamers}
        team={picker.team}
        members={picker.members}
        renderTeam={(power, env) => (
          <TeamPicker ctx={ctx} zone={zone} picker={picker} power={power} abilityEnv={env} />
        )}
        pending={start.isPending}
        error={
          start.error &&
          (start.error instanceof ApiError
            ? (GAME_ERRORS[start.error.code] ?? start.error.code)
            : 'Erreur inconnue')
        }
        onCancel={onClose}
        onSubmit={(input) => start.mutate(input)}
      />
    </Modal>
  );
}

/**
 * Réglages d'une expédition (durée, équipe, Balls, baie, filtre de capture) et aperçu des
 * rencontres et du butin. Sans accès aux données du joueur : le jeu et le simulateur de
 * l'admin le partagent.
 */
export function LaunchExpeditionForm({
  ctx,
  zone,
  chain,
  charm,
  owned,
  unlimitedItems = false,
  bonuses,
  weather: forcedWeather,
  roamers = [],
  team,
  members,
  renderTeam,
  extra,
  pending,
  error,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  ctx: GameContext;
  zone: Zone;
  /** Maillon de la chaîne de zone qu'aurait cette expédition. */
  chain: number;
  /** Multiplicateur du Charme Chroma (1 = aucun). */
  charm: number;
  /** Quantité possédée d'un objet. */
  owned: (itemId: string) => number;
  /** Stock illimité (simulateur) : les quantités ne sont pas affichées. */
  unlimitedItems?: boolean;
  /** Bonus permanents du joueur (aucun par défaut). */
  bonuses?: PlayerBonuses;
  /** Météo de la zone imposée (simulateur) ; par défaut, celle du moment. */
  weather?: Weather | null;
  /** Pokémon fuyards cachés dans la zone en ce moment. */
  roamers?: RoamerDto[];
  team: string[];
  members: PokemonDto[];
  /** Choix de l'équipe, selon sa PE et l'environnement des talents de l'expédition. */
  renderTeam: (power: number, env: AbilityEnv) => ReactNode;
  /** Réglages supplémentaires, sous la durée. */
  extra?: ReactNode;
  pending: boolean;
  error: ReactNode;
  /** Libellé du bouton de départ (par défaut « Partir (durée) »). */
  submitLabel?: (durationMinutes: number) => string;
  onCancel: () => void;
  onSubmit: (input: StartExpeditionInput) => void;
}) {
  const perfectIvs = chainPerfectIvs(ctx, chain);
  const nextIvThreshold = nextChainPerfectIvThreshold(ctx, chain);
  const [duration, setDuration] = useState(zone.durationsMinutes[0]!);
  const ownedLabel = (itemId: string) => (unlimitedItems ? '' : ` (× ${owned(itemId)})`);
  // Du multiplicateur le plus faible au plus fort : la Ball par défaut reste la plus courante.
  const balls = ctx.content.items
    .filter((i) => ctx.itemEffect(i.id, 'ball') && owned(i.id) > 0)
    .sort(
      (a, b) =>
        ctx.itemEffect(a.id, 'ball')!.catchMultiplier -
        ctx.itemEffect(b.id, 'ball')!.catchMultiplier,
    );
  const berries = ctx.content.items
    .filter((i) => ctx.itemEffect(i.id, 'captureBoost') && owned(i.id) > 0)
    .sort(
      (a, b) =>
        ctx.itemEffect(a.id, 'captureBoost')!.multiplier -
        ctx.itemEffect(b.id, 'captureBoost')!.multiplier,
    );
  // undefined = choix par défaut (première Ball possédée) ; null = aucune Ball.
  const [ballId, setBallId] = useState<string | null | undefined>(undefined);
  const [berryId, setBerryId] = useState<string | null>(null);
  // null = autant que possible (une par rencontre, dans la limite du stock).
  const [ballCount, setBallCount] = useState<number | null>(null);
  // null = tenter de capturer toutes les rencontres.
  const [captureFilter, setCaptureFilter] = useState<CaptureFilter | null>(null);
  const selectedBall = ballId === undefined ? (balls[0]?.id ?? null) : ballId;

  // Talents de l'équipe et météo de la zone : estimations à l'instant présent (celui du départ).
  const now = useNow(30_000);
  const placeWeather = forcedWeather !== undefined ? forcedWeather : zoneWeather(zone, now);
  const forecast = forcedWeather !== undefined ? undefined : zoneWeatherForecast(zone, now);
  const site = { ...zone, weather: placeWeather };
  const env = expeditionEnv(site, members, new Date().getHours());
  const check = checkTeam(ctx, site, duration, members, env.hour);
  const plan = expeditionPlan(ctx, duration, env);
  const weather = resolveWeather(ctx, env);
  const { encounters } = plan;
  const xp = expectedExpeditionXp(ctx, zone, duration, bonuses, env);
  const maxBalls = selectedBall ? Math.min(encounters, owned(selectedBall)) : 0;
  const ballsTaken = Math.min(ballCount ?? maxBalls, maxBalls);
  const ballEffect = selectedBall ? ctx.itemEffect(selectedBall, 'ball') : undefined;
  const boost = berryId ? ctx.itemEffect(berryId, 'captureBoost')?.multiplier : undefined;
  // Bonus permanents et talents de l'équipe, comme au serveur.
  const captureBonus = abilityBonuses(ctx, env, bonuses ?? NO_BONUSES).capture;
  const possibleEncounters = encounterProbabilities(ctx, zone, undefined, attractedTypes(ctx, env));
  const zoneSpeciesIds = [...new Set(possibleEncounters.map((e) => e.speciesId))];
  const updateFilter = (patch: Partial<CaptureFilter>) =>
    setCaptureFilter((f) => ({ ...(f ?? NO_FILTER), ...patch }));
  const targeted = (speciesId: number) =>
    !captureFilter ||
    captureFilter.speciesIds.length === 0 ||
    captureFilter.speciesIds.includes(speciesId);
  const loot = lootProbabilities(ctx, zone, duration, env).sort(
    (a, b) => b.probability - a.probability,
  );

  return (
    <>
      <h2 className="flex items-center gap-2 text-xl font-bold">
        {zone.name}
        {(weather || placeWeather || forecast) && (
          <WeatherIcon
            weather={weather ?? 'clear'}
            activity="expedition"
            note={weather !== placeWeather ? TEAM_WEATHER_NOTE : undefined}
            forecast={forecast}
          />
        )}
      </h2>
      <p className="text-sm text-slate-500">{zone.description}</p>

      <h3 className="mt-5 text-sm font-semibold">Durée</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {zone.durationsMinutes.map((d) => (
          <button
            key={d}
            className={duration === d ? 'btn-primary' : 'btn-ghost'}
            onClick={() => setDuration(d)}
          >
            {formatDuration(d)}
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {plan.realDurationMinutes !== duration &&
          `Retour en ${formatDuration(plan.realDurationMinutes)} grâce aux talents. `}
        {encounters} rencontre{encounters > 1 ? 's' : ''} prévue{encounters > 1 ? 's' : ''}. Taux
        shiny :{' '}
        {formatShinyRate(
          Math.min(
            1,
            shinyProbability(ctx, { chain, charm }) * abilityMultiplier(ctx, env, 'shinyChance'),
          ),
        )}
        {(chain > 0 || charm > 1) &&
          ` (${[chain > 0 && `chaîne ${chain}`, charm > 1 && 'Charme Chroma']
            .filter(Boolean)
            .join(', ')})`}
        .
        {perfectIvs > 0 &&
          ` Chaque Pokémon sauvage aura au moins ${perfectIvs} IV parfait${perfectIvs > 1 ? 's' : ''}.`}
        {nextIvThreshold !== null &&
          ` Prochain IV parfait garanti à ${nextIvThreshold} maillon${nextIvThreshold > 1 ? 's' : ''}.`}
      </p>
      {roamers.map((r) => (
        <p
          key={r.questId}
          className="mt-2 flex items-center gap-2 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
        >
          <PokemonSprite speciesId={r.speciesId} formId={r.formId} size={40} />
          <span>
            <strong>{speciesName(ctx, r.speciesId, r.formId)}</strong> se cache ici ! Chances de le
            croiser pendant cette expédition :{' '}
            {formatChance(roamerMeetChance(r.encounterChance, encounters))}. S’il reste une Ball,
            elle lui est lancée quel que soit le filtre de capture. L’expédition l’emmène avec elle
            : il n’apparaît plus ailleurs jusqu’à son retour.
          </span>
        </p>
      ))}
      {extra}

      {renderTeam(check.power, env)}
      {members.length > 0 && (
        <>
          <h3 className="mt-4 text-sm font-semibold">Talents actifs</h3>
          <ActiveAbilities
            ctx={ctx}
            env={env}
            members={members}
            className="mt-1 text-xs"
            empty={
              <p className="mt-1 text-xs text-slate-500">Aucun talent de l’équipe n’agit ici.</p>
            }
          />
        </>
      )}
      <XpPreview ctx={ctx} members={members} xp={xp}>
        ≈ {formatXp(xp)} par Pokémon
        <span className="text-slate-500"> (moyenne, selon les rencontres)</span>
      </XpPreview>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold">Ball</h3>
          <select
            className="input mt-2"
            value={selectedBall ?? ''}
            onChange={(e) => {
              setBallId(e.target.value || null);
              setBallCount(null);
            }}
          >
            {balls.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {ownedLabel(b.id)}
              </option>
            ))}
            <option value="">Aucune (observer seulement)</option>
          </select>
          {selectedBall && maxBalls > 0 && (
            <>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="range"
                  className="flex-1 accent-brand-500"
                  min={1}
                  max={maxBalls}
                  value={ballsTaken}
                  onChange={(e) => setBallCount(Number(e.target.value))}
                  aria-label="Nombre de Balls"
                />
                <input
                  type="number"
                  className="input w-20"
                  min={1}
                  max={maxBalls}
                  value={ballsTaken}
                  onChange={(e) =>
                    setBallCount(Math.max(1, Math.min(maxBalls, Number(e.target.value) || 1)))
                  }
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {ballsTaken} / {maxBalls} emportée{ballsTaken > 1 ? 's' : ''}, une par rencontre au
                plus ; les Balls non utilisées sont rendues.
              </p>
            </>
          )}
        </div>
        <div>
          <h3 className="text-sm font-semibold">Baie (optionnelle)</h3>
          <select
            className="input mt-2"
            value={berryId ?? ''}
            onChange={(e) => setBerryId(e.target.value || null)}
          >
            <option value="">Aucune</option>
            {berries.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {ownedLabel(b.id)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedBall && (
        <div className="mt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">Captures</h3>
            <div className="flex gap-1 text-xs">
              <button
                type="button"
                onClick={() => setCaptureFilter(null)}
                className={pillClass(!captureFilter)}
              >
                Tout tenter
              </button>
              <button
                type="button"
                onClick={() => setCaptureFilter((f) => f ?? NO_FILTER)}
                className={pillClass(!!captureFilter)}
              >
                Filtrer
              </button>
            </div>
          </div>
          {captureFilter ? (
            <div className="mt-2 space-y-3 rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-800">
              <div>
                <p className="text-slate-500">
                  Espèces visées
                  {captureFilter.speciesIds.length === 0 && ' (aucune sélection = toutes)'}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {zoneSpeciesIds.map((id) => {
                    const on = captureFilter.speciesIds.includes(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() =>
                          updateFilter({
                            speciesIds: on
                              ? captureFilter.speciesIds.filter((s) => s !== id)
                              : [...captureFilter.speciesIds, id],
                          })
                        }
                        className={`flex items-center gap-1 rounded-full border py-0.5 pr-2 pl-0.5 ${
                          on
                            ? 'border-brand-500 bg-brand-500/10'
                            : 'border-slate-200 hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800'
                        }`}
                      >
                        <PokemonSprite speciesId={id} size={24} />
                        {ctx.species(id)?.nameFr}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!captureFilter.newOnly}
                    onChange={(e) => updateFilter({ newOnly: e.target.checked })}
                  />
                  <span>Nouveaux Pokémon uniquement</span>
                </label>
                <label className="flex items-center gap-2">
                  <span className="text-slate-500">IV à 31, au moins</span>
                  <select
                    className="input w-16 py-1"
                    value={captureFilter.minPerfectIvs}
                    onChange={(e) => updateFilter({ minPerfectIvs: Number(e.target.value) })}
                  >
                    {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-center gap-1">
                  <span className="mr-1 text-slate-500">Shiny</span>
                  {(Object.keys(SHINY_MODES) as CaptureFilter['shiny'][]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => updateFilter({ shiny: mode })}
                      className={pillClass(captureFilter.shiny === mode)}
                    >
                      {SHINY_MODES[mode]}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-slate-500">
                Les rencontres hors filtre sont ignorées : aucune Ball ni baie utilisée.
                {captureFilter.newOnly &&
                  ' Un Pokémon absent du Pokédex n’est plus visé une fois capturé.'}
                {captureFilter.shiny === 'always' &&
                  ' Les shiny sont tentés même hors des autres critères.'}
              </p>
            </div>
          ) : (
            <p className="mt-1 text-xs text-slate-500">
              Une capture est tentée à chaque rencontre, tant qu’il reste des Balls.
            </p>
          )}
        </div>
      )}

      <h3 className="mt-5 text-sm font-semibold">Rencontres possibles</h3>
      <ul className="mt-2 grid grid-cols-2 gap-1 text-xs sm:grid-cols-3">
        {possibleEncounters.map(({ speciesId, formId, probability }) => {
          const species = ctx.species(speciesId, formId)!;
          const chance = ballEffect
            ? captureProbability(ctx, {
                captureRate: species.captureRate,
                ballMultiplier: ballEffect.catchMultiplier,
                boostMultiplier: boost,
                affinityCount: check.affinityCount,
                bonusMultiplier: captureBonus,
              })
            : 0;
          return (
            <li
              key={`${speciesId}:${formId ?? ''}`}
              className={`flex items-center gap-1 ${targeted(speciesId) ? '' : 'opacity-40'}`}
            >
              <PokemonSprite speciesId={speciesId} formId={formId} size={32} />
              <span className="truncate">
                {species.nameFr} · {Math.round(probability * 100)} %
                <span className="text-slate-500"> (capture {Math.round(chance * 100)} %)</span>
              </span>
            </li>
          );
        })}
      </ul>

      {loot.length > 0 && (
        <>
          <h3 className="mt-5 text-sm font-semibold">Butin possible</h3>
          <ul className="mt-2 grid grid-cols-2 gap-1 text-xs sm:grid-cols-3">
            {loot.map(({ itemId, probability, min, max }) => (
              <li key={itemId} className="flex items-center gap-1">
                <img src={itemIcon(ctx, itemId)} alt="" className="h-8 w-8 object-contain" />
                <span className="truncate">
                  {itemName(ctx, itemId)} · {formatChance(probability)}
                  <span className="text-slate-500"> (× {min === max ? min : `${min}–${max}`})</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {zone.requiredTypes.length > 0 && (
        <p className="mt-3 flex flex-wrap items-center gap-1 text-xs text-slate-500">
          Types requis :
          {zone.requiredTypes.map((r) => (
            <span key={r.type} className="flex items-center gap-1">
              {r.count} × <TypeBadge type={r.type} />
            </span>
          ))}
        </p>
      )}

      {team.length > 0 && check.errors.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm text-red-600">
          {check.errors.map((e) => (
            <li key={e.code}>{teamErrorText(e)}</li>
          ))}
        </ul>
      )}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-6 flex items-center justify-end gap-2">
        {selectedBall && (
          <img
            src={itemIcon(ctx, selectedBall)}
            alt={itemName(ctx, selectedBall)}
            className="h-8"
          />
        )}
        <button className="btn-ghost" onClick={onCancel}>
          Annuler
        </button>
        <button
          className="btn-primary"
          disabled={check.errors.length > 0 || pending}
          onClick={() =>
            onSubmit({
              zoneId: zone.id,
              durationMinutes: duration,
              team,
              ballItemId: selectedBall,
              ...(selectedBall && ballsTaken > 0 ? { ballCount: ballsTaken, captureFilter } : {}),
              berryItemId: berryId,
            })
          }
        >
          {submitLabel ? submitLabel(duration) : `Partir (${formatDuration(duration)})`}
        </button>
      </div>
    </>
  );
}
