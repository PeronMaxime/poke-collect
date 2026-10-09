import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Zone } from '@poke/content';
import {
  captureProbability,
  checkTeam,
  encounterCount,
  encounterProbabilities,
  isRegionalSpecies,
  lootProbabilities,
  pokemonPower,
  shinyProbability,
} from '@poke/game-core';
import type { CaptureFilter, ExpeditionError, GameContext } from '@poke/game-core';
import type { ExpeditionDto, PokemonDto, StartExpeditionInput } from '@poke/shared';
import { PokemonTagBadge, TagFilterSelect, useTagFilter } from '../../components/tags';
import { Modal, PokemonSprite, ShinyStar, TypeBadge, useNow } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import {
  PLAYER_STATE_KEYS,
  isUsable,
  useInventory,
  usePokemon,
  useShinyCharm,
} from '../../lib/game';
import {
  GAME_ERRORS,
  formatDuration,
  formatShinyRate,
  itemIcon,
  itemName,
  typeLabel,
} from '../../lib/labels';

/** Les objets rares (1 %, menthes…) ne doivent pas s'afficher « 0 % ». */
function formatChance(p: number): string {
  const pct = p * 100;
  return pct < 1 ? '< 1 %' : `${Math.round(pct)} %`;
}

const SORTS = {
  power: 'PE',
  affinity: 'Affinité',
  level: 'Niveau',
  tag: 'Étiquette',
} as const;
type Sort = keyof typeof SORTS;

const SHINY_MODES = {
  any: 'Indifférent',
  always: 'Toujours tenter',
  only: 'Uniquement',
} as const;

export const pillClass = (active: boolean) =>
  `rounded-full px-2 py-0.5 ${
    active
      ? 'bg-brand-500 text-white'
      : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700'
  }`;

const NO_FILTER: CaptureFilter = { speciesIds: [], minPerfectIvs: 0, shiny: 'any' };

function errorText(e: ExpeditionError): string {
  switch (e.code) {
    case 'DURATION_NOT_ALLOWED':
      return 'Durée non disponible pour cette zone.';
    case 'TEAM_EMPTY':
      return 'Choisis au moins un Pokémon.';
    case 'TEAM_TOO_LARGE':
      return `Au plus ${e.max} Pokémon.`;
    case 'DUPLICATE_MEMBER':
      return 'Un Pokémon est sélectionné deux fois.';
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
  const pokemon = usePokemon();
  const inventory = useInventory();
  const [duration, setDuration] = useState(zone.durationsMinutes[0]!);
  const [team, setTeam] = useState<string[]>([]);
  const owned = new Map(inventory.data?.map((i) => [i.itemId, i.quantity]));
  // Du multiplicateur le plus faible au plus fort : la Ball par défaut reste la plus courante.
  const balls = ctx.content.items
    .filter((i) => ctx.itemEffect(i.id, 'ball') && (owned.get(i.id) ?? 0) > 0)
    .sort(
      (a, b) =>
        ctx.itemEffect(a.id, 'ball')!.catchMultiplier -
        ctx.itemEffect(b.id, 'ball')!.catchMultiplier,
    );
  const berries = ctx.content.items
    .filter((i) => ctx.itemEffect(i.id, 'captureBoost') && (owned.get(i.id) ?? 0) > 0)
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
  const [sort, setSort] = useState<Sort>('power');
  const tagFilter = useTagFilter();
  // null = tenter de capturer toutes les rencontres.
  const [captureFilter, setCaptureFilter] = useState<CaptureFilter | null>(null);
  const selectedBall = ballId === undefined ? (balls[0]?.id ?? null) : ballId;

  const start = useMutation({
    mutationFn: (input: StartExpeditionInput) =>
      api<ExpeditionDto>('/api/expeditions', { method: 'POST', json: input }),
    onSuccess: () => {
      // Fermer avant le rechargement : l'équipe envoyée devient « occupée » et sortirait de la liste.
      onClose();
      return Promise.all(
        PLAYER_STATE_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
  });

  const now = useNow(10_000);
  const region = ctx.region(zone.regionId);
  const available = (pokemon.data ?? [])
    .filter((p) => isUsable(p, now) && isRegionalSpecies(ctx, zone.regionId, p.speciesId))
    // Les membres déjà choisis restent visibles, quel que soit le filtre.
    .filter((p) => tagFilter.matches(p) || team.includes(p.id))
    .map((p) => {
      const species = ctx.species(p.speciesId, p.formId)!;
      return {
        p,
        species,
        power: pokemonPower(species, p),
        affinity: species.types.some((t) => zone.affinityTypes.includes(t)),
      };
    })
    .sort(
      (a, b) =>
        (sort === 'affinity' ? Number(b.affinity) - Number(a.affinity) : 0) ||
        (sort === 'level' ? b.p.level - a.p.level : 0) ||
        (sort === 'tag' ? tagFilter.compare(a.p, b.p) : 0) ||
        b.power - a.power,
    );
  const members = team.flatMap((id) => available.find((a) => a.p.id === id)?.p ?? []);
  const check = checkTeam(ctx, zone, duration, members);
  const { maxTeamSize } = ctx.balance.expeditions;
  const encounters = encounterCount(ctx, duration);
  const maxBalls = selectedBall ? Math.min(encounters, owned.get(selectedBall) ?? 0) : 0;
  const ballsTaken = Math.min(ballCount ?? maxBalls, maxBalls);
  const ballEffect = selectedBall ? ctx.itemEffect(selectedBall, 'ball') : undefined;
  const boost = berryId ? ctx.itemEffect(berryId, 'captureBoost')?.multiplier : undefined;
  const possibleEncounters = encounterProbabilities(ctx, zone);
  const zoneSpeciesIds = [...new Set(possibleEncounters.map((e) => e.speciesId))];
  const updateFilter = (patch: Partial<CaptureFilter>) =>
    setCaptureFilter((f) => ({ ...(f ?? NO_FILTER), ...patch }));
  const targeted = (speciesId: number) =>
    !captureFilter ||
    captureFilter.speciesIds.length === 0 ||
    captureFilter.speciesIds.includes(speciesId);
  const loot = lootProbabilities(ctx, zone, duration).sort((a, b) => b.probability - a.probability);

  function toggle(p: PokemonDto) {
    setTeam((t) =>
      t.includes(p.id) ? t.filter((id) => id !== p.id) : t.length < maxTeamSize ? [...t, p.id] : t,
    );
  }

  return (
    <Modal open onClose={onClose} wide>
      <h2 className="text-xl font-bold">{zone.name}</h2>
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
        {encounters} rencontre{encounters > 1 ? 's' : ''} prévue{encounters > 1 ? 's' : ''}. Taux
        shiny : {formatShinyRate(shinyProbability(ctx, { chain, charm }))}
        {(chain > 0 || charm > 1) &&
          ` (${[chain > 0 && `chaîne ${chain}`, charm > 1 && 'Charme Chroma']
            .filter(Boolean)
            .join(', ')})`}
        .
      </p>

      <div className="mt-5 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">
          Équipe ({team.length} / {maxTeamSize})
        </h3>
        <div className="flex items-center gap-1 text-xs">
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
        </div>
        <span
          className={`text-sm font-medium ${check.power >= zone.minPower ? 'text-emerald-600' : 'text-red-600'}`}
        >
          PE {check.power} / {zone.minPower}
        </span>
      </div>
      <div className="mt-2 grid max-h-64 grid-cols-3 gap-2 overflow-y-auto p-1 sm:grid-cols-5">
        {available.map(({ p, species, power, affinity }) => {
          const selected = team.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(p)}
              title={affinity ? 'Affinité avec la zone' : undefined}
              className={`relative flex flex-col items-center rounded-xl border p-1 text-xs transition ${
                selected
                  ? 'border-brand-500 bg-brand-500/10'
                  : affinity
                    ? 'border-emerald-400 hover:bg-slate-100 dark:border-emerald-500 dark:hover:bg-slate-800'
                    : 'border-slate-200 hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800'
              } ${affinity ? 'shadow-[0_0_8px_2px_rgba(52,211,153,0.65)]' : ''}`}
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
              <PokemonTagBadge pokemon={p} tags={tagFilter.tags} />
            </button>
          );
        })}
        {available.length === 0 && (
          <p className="col-span-full text-sm text-slate-500">
            {tagFilter.filter === 'all'
              ? `Aucun Pokémon de ${region?.name} disponible : ils sont occupés, K.O., ou pas encore capturés.`
              : `Aucun Pokémon de ${region?.name} disponible avec cette étiquette.`}
          </p>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Seuls les Pokémon du Pokédex de {region?.name} peuvent explorer ses zones.
      </p>

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
                {b.name} (× {owned.get(b.id)})
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
                {b.name} (× {owned.get(b.id)})
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
            <li key={e.code}>{errorText(e)}</li>
          ))}
        </ul>
      )}
      {start.error && (
        <p className="mt-4 text-sm text-red-600">
          {start.error instanceof ApiError
            ? (GAME_ERRORS[start.error.code] ?? start.error.code)
            : 'Erreur inconnue'}
        </p>
      )}

      <div className="mt-6 flex items-center justify-end gap-2">
        {selectedBall && (
          <img
            src={itemIcon(ctx, selectedBall)}
            alt={itemName(ctx, selectedBall)}
            className="h-8"
          />
        )}
        <button className="btn-ghost" onClick={onClose}>
          Annuler
        </button>
        <button
          className="btn-primary"
          disabled={check.errors.length > 0 || start.isPending}
          onClick={() =>
            start.mutate({
              zoneId: zone.id,
              durationMinutes: duration,
              team,
              ballItemId: selectedBall,
              ...(selectedBall && ballsTaken > 0 ? { ballCount: ballsTaken, captureFilter } : {}),
              berryItemId: berryId,
            })
          }
        >
          Partir ({formatDuration(duration)})
        </button>
      </div>
    </Modal>
  );
}
