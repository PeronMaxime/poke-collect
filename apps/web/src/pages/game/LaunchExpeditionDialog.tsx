import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Zone } from '@poke/content';
import {
  captureProbability,
  checkTeam,
  encounterCount,
  encounterProbabilities,
  pokemonPower,
  shinyProbability,
} from '@poke/game-core';
import type { ExpeditionError, GameContext } from '@poke/game-core';
import type { ExpeditionDto, PokemonDto, StartExpeditionInput } from '@poke/shared';
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
  const balls = ctx.content.items.filter(
    (i) => ctx.itemEffect(i.id, 'ball') && (owned.get(i.id) ?? 0) > 0,
  );
  const berries = ctx.content.items.filter(
    (i) => ctx.itemEffect(i.id, 'captureBoost') && (owned.get(i.id) ?? 0) > 0,
  );
  // undefined = choix par défaut (première Ball possédée) ; null = aucune Ball.
  const [ballId, setBallId] = useState<string | null | undefined>(undefined);
  const [berryId, setBerryId] = useState<string | null>(null);
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
  const available = (pokemon.data ?? [])
    .filter((p) => isUsable(p, now))
    .map((p) => ({ p, power: pokemonPower(ctx.species(p.speciesId)!, p) }))
    .sort((a, b) => b.power - a.power);
  const members = team.flatMap((id) => available.find((a) => a.p.id === id)?.p ?? []);
  const check = checkTeam(ctx, zone, duration, members);
  const { maxTeamSize } = ctx.balance.expeditions;
  const encounters = encounterCount(ctx, duration);
  const ballEffect = selectedBall ? ctx.itemEffect(selectedBall, 'ball') : undefined;
  const boost = berryId ? ctx.itemEffect(berryId, 'captureBoost')?.multiplier : undefined;

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

      <div className="mt-5 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">
          Équipe ({team.length} / {maxTeamSize})
        </h3>
        <span
          className={`text-sm font-medium ${check.power >= zone.minPower ? 'text-emerald-600' : 'text-red-600'}`}
        >
          PE {check.power} / {zone.minPower}
        </span>
      </div>
      <div className="mt-2 grid max-h-64 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-5">
        {available.map(({ p, power }) => {
          const selected = team.includes(p.id);
          const species = ctx.species(p.speciesId);
          const affinity = species?.types.some((t) => zone.affinityTypes.includes(t));
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(p)}
              className={`relative flex flex-col items-center rounded-xl border p-1 text-xs transition ${
                selected
                  ? 'border-brand-500 bg-brand-500/10'
                  : 'border-slate-200 hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800'
              }`}
            >
              {affinity && (
                <span
                  className="absolute top-1 left-1 text-[10px] text-emerald-600"
                  title="Affinité"
                >
                  ◆
                </span>
              )}
              <PokemonSprite speciesId={p.speciesId} shiny={p.isShiny} size={56} />
              <span className="truncate">
                {species?.nameFr} {p.isShiny && <ShinyStar />}
              </span>
              <span className="text-slate-500">
                N.{p.level} · PE {power}
              </span>
            </button>
          );
        })}
        {available.length === 0 && (
          <p className="col-span-full text-sm text-slate-500">
            Tous tes Pokémon sont occupés ou K.O.
          </p>
        )}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold">Ball</h3>
          <select
            className="input mt-2"
            value={selectedBall ?? ''}
            onChange={(e) => setBallId(e.target.value || null)}
          >
            {balls.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} (× {owned.get(b.id)})
              </option>
            ))}
            <option value="">Aucune (observer seulement)</option>
          </select>
          {selectedBall && (
            <p className="mt-1 text-xs text-slate-500">
              {Math.min(encounters, owned.get(selectedBall) ?? 0)} réservée(s), une par rencontre.
            </p>
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

      <h3 className="mt-5 text-sm font-semibold">Rencontres possibles</h3>
      <ul className="mt-2 grid grid-cols-2 gap-1 text-xs sm:grid-cols-3">
        {encounterProbabilities(ctx, zone).map(({ speciesId, probability }) => {
          const species = ctx.species(speciesId)!;
          const chance = ballEffect
            ? captureProbability(ctx, {
                captureRate: species.captureRate,
                ballMultiplier: ballEffect.catchMultiplier,
                boostMultiplier: boost,
                affinityCount: check.affinityCount,
              })
            : 0;
          return (
            <li key={speciesId} className="flex items-center gap-1">
              <PokemonSprite speciesId={speciesId} size={32} />
              <span className="truncate">
                {species.nameFr} · {Math.round(probability * 100)} %
                <span className="text-slate-500"> (capture {Math.round(chance * 100)} %)</span>
              </span>
            </li>
          );
        })}
      </ul>
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
