import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Zone } from '@poke/content';
import { chainMultiplier, isZoneUnlocked, regionDexProgress } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type { ClaimExpeditionResponse, ExpeditionDto, ShinyChainDto } from '@poke/shared';
import { PokemonSprite, ProgressBar, TypeBadge, useNow } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import {
  PLAYER_STATE_KEYS,
  useExpeditions,
  usePlayerProgress,
  usePokedex,
  usePokemon,
} from '../../lib/game';
import {
  GAME_ERRORS,
  formatCountdown,
  formatDuration,
  formatMultiplier,
  unlockConditionText,
} from '../../lib/labels';
import { LaunchExpeditionDialog } from './LaunchExpeditionDialog';
import { LootReveal } from './LootReveal';

export function ExpeditionsPage({ ctx }: { ctx: GameContext }) {
  const queryClient = useQueryClient();
  const expeditions = useExpeditions();
  const pokedex = usePokedex();
  const pokemon = usePokemon();
  const now = useNow();
  const [launchZone, setLaunchZone] = useState<Zone | null>(null);
  const [reveal, setReveal] = useState<ClaimExpeditionResponse | null>(null);

  const claim = useMutation({
    mutationFn: (id: string) =>
      api<ClaimExpeditionResponse>(`/api/expeditions/${id}/claim`, { method: 'POST' }),
    onSuccess: (data) => {
      setReveal(data);
      return Promise.all(
        PLAYER_STATE_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
  });

  const progress = usePlayerProgress();
  const seen = new Set(pokedex.data?.filter((d) => d.seen).map((d) => d.speciesId));
  // Décalage entre l'horloge du serveur et celle du navigateur, pour des comptes à rebours justes.
  const offset = expeditions.data
    ? Date.parse(expeditions.data.serverTime) - expeditions.dataUpdatedAt
    : 0;
  const serverNow = now + offset;
  const active = expeditions.data?.active ?? [];
  const slots = expeditions.data?.slots ?? 0;
  const freeSlots = slots - active.length;
  const pokemonById = new Map(pokemon.data?.map((p) => [p.id, p]));
  const chains = new Map(expeditions.data?.chains.map((c) => [c.zoneId, c]));

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Expéditions en cours</h2>
          <span className="text-sm text-slate-500">
            {active.length} / {slots} emplacements
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: slots }, (_, slot) => {
            const exp = active.find((e) => e.slotIndex === slot);
            return exp ? (
              <ActiveExpedition
                key={exp.id}
                ctx={ctx}
                expedition={exp}
                serverNow={serverNow}
                teamSpecies={exp.team.map((id) => pokemonById.get(id))}
                claiming={claim.isPending && claim.variables === exp.id}
                onClaim={() => claim.mutate(exp.id)}
              />
            ) : (
              <div
                key={slot}
                className="grid min-h-32 place-items-center rounded-2xl border-2 border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-700"
              >
                Emplacement libre — choisis une zone ci-dessous.
              </div>
            );
          })}
        </div>
        {claim.error && (
          <p className="mt-2 text-sm text-red-600">
            {claim.error instanceof ApiError
              ? (GAME_ERRORS[claim.error.code] ?? claim.error.code)
              : 'Erreur inconnue'}
          </p>
        )}
      </section>

      {ctx.regions.map((region) => {
        const zones = ctx.zones.filter((z) => z.regionId === region.id);
        if (zones.length === 0) return null;
        const dex = regionDexProgress(ctx, region.id, progress);
        return (
          <section key={region.id}>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">Zones de {region.name}</h2>
              <span className="text-sm text-slate-500">
                Pokédex : {dex.caught} / {dex.total}
              </span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {zones.map((zone) => (
                <ZoneCard
                  key={zone.id}
                  ctx={ctx}
                  zone={zone}
                  seen={seen}
                  unlocked={isZoneUnlocked(ctx, zone, progress)}
                  canLaunch={freeSlots > 0}
                  chain={chains.get(zone.id)}
                  serverNow={serverNow}
                  onLaunch={() => setLaunchZone(zone)}
                />
              ))}
            </div>
          </section>
        );
      })}

      {launchZone && (
        <LaunchExpeditionDialog
          ctx={ctx}
          zone={launchZone}
          chain={chains.get(launchZone.id)?.chain ?? 0}
          onClose={() => setLaunchZone(null)}
        />
      )}
      <LootReveal ctx={ctx} data={reveal} onClose={() => setReveal(null)} />
    </div>
  );
}

function ActiveExpedition({
  ctx,
  expedition,
  serverNow,
  teamSpecies,
  claiming,
  onClaim,
}: {
  ctx: GameContext;
  expedition: ExpeditionDto;
  serverNow: number;
  teamSpecies: ({ speciesId: number; isShiny: boolean } | undefined)[];
  claiming: boolean;
  onClaim: () => void;
}) {
  const start = Date.parse(expedition.startedAt);
  const end = Date.parse(expedition.endsAt);
  const done = serverNow >= end;
  const zone = ctx.zone(expedition.zoneId);
  return (
    <div className={`card p-4 ${done ? 'ring-2 ring-brand-500/50' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{zone?.name ?? expedition.zoneId}</p>
          <p className="text-xs text-slate-500">
            {formatDuration(expedition.durationMinutes)}
            {expedition.shinyChain > 0 && (
              <span className="ml-1 text-amber-600 dark:text-amber-400">
                · ✦ chaîne {expedition.shinyChain}
              </span>
            )}
          </p>
        </div>
        <div className="flex -space-x-3">
          {teamSpecies.map((p, i) =>
            p ? (
              <PokemonSprite key={i} speciesId={p.speciesId} shiny={p.isShiny} size={48} />
            ) : null,
          )}
        </div>
      </div>
      <ProgressBar className="mt-3" value={(serverNow - start) / (end - start)} />
      <div className="mt-3 flex items-center justify-between">
        <span className="font-mono text-sm text-slate-500">
          {done ? 'Terminée !' : formatCountdown(end - serverNow)}
        </span>
        <button className="btn-primary" disabled={!done || claiming} onClick={onClaim}>
          {claiming ? 'Ouverture…' : 'Récupérer'}
        </button>
      </div>
    </div>
  );
}

function ZoneCard({
  ctx,
  zone,
  seen,
  unlocked,
  canLaunch,
  chain,
  serverNow,
  onLaunch,
}: {
  ctx: GameContext;
  zone: Zone;
  seen: Set<number>;
  unlocked: boolean;
  canLaunch: boolean;
  chain: ShinyChainDto | undefined;
  serverNow: number;
  onLaunch: () => void;
}) {
  const expiresIn = chain?.expiresAt ? Date.parse(chain.expiresAt) - serverNow : null;
  const species = [...new Set(zone.encounters.map((e) => e.speciesId))].filter(
    (id) => ctx.species(id)?.enabled,
  );
  const unlock = zone.unlock;
  return (
    <div className={`card flex flex-col p-4 ${unlocked ? '' : 'opacity-60'}`}>
      {zone.image && (
        <img src={zone.image} alt="" className="-mx-4 -mt-4 mb-3 h-28 rounded-t-2xl object-cover" />
      )}
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold">{zone.name}</h3>
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          PE ≥ {zone.minPower}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-500">{zone.description}</p>
      {chain && (expiresIn === null || expiresIn > 0) && (
        <p
          className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
          title="Relance la zone avant la fin du délai pour allonger la chaîne."
        >
          ✦ Chaîne {chain.chain} : shiny {formatMultiplier(chainMultiplier(ctx, chain.chain))}
          {expiresIn !== null && ` · à relancer sous ${formatCountdown(expiresIn)}`}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-1 text-xs text-slate-500">
        {zone.requiredTypes.map((r) => (
          <span key={r.type} className="flex items-center gap-1">
            Requis : {r.count} × <TypeBadge type={r.type} />
          </span>
        ))}
        {zone.affinityTypes.length > 0 && <span className="ml-1">Affinité :</span>}
        {zone.affinityTypes.map((t) => (
          <TypeBadge key={t} type={t} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        {species.map((id) => (
          <PokemonSprite
            key={id}
            speciesId={id}
            size={40}
            silhouette={!seen.has(id)}
            alt={seen.has(id) ? ctx.species(id)?.nameFr : '?'}
          />
        ))}
      </div>
      <div className="mt-auto pt-3">
        {unlocked ? (
          <button className="btn-primary w-full" disabled={!canLaunch} onClick={onLaunch}>
            {canLaunch ? 'Envoyer une équipe' : 'Aucun emplacement libre'}
          </button>
        ) : (
          <p className="text-center text-sm text-slate-500">
            🔒 {unlockConditionText(ctx, unlock) ?? 'Région verrouillée'}
          </p>
        )}
      </div>
    </div>
  );
}
