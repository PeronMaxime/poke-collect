import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Zone } from '@poke/content';
import {
  MAX_LEVEL,
  MAX_SEED,
  charmMultiplier,
  createRng,
  encounterCount,
  generatePokemon,
  resolveExpedition,
} from '@poke/game-core';
import type { CaughtDex, GameContext } from '@poke/game-core';
import type {
  PokemonDto,
  PokemonTagDto,
  ShinyChainDto,
  StartExpeditionInput,
  StoredExpeditionResult,
} from '@poke/shared';
import { TagBadge, TagToggleList } from '@web/components/tags';
import { Modal, PokemonSprite } from '@web/components/ui';
import { formatDuration } from '@web/lib/labels';
import { ZoneCard } from '@web/pages/game/ExpeditionsPage';
import { NewbornActionsView } from '@web/pages/game/HatchReveal';
import { LaunchExpeditionForm } from '@web/pages/game/LaunchExpeditionDialog';
import { ExpeditionRevealView } from '@web/pages/game/LootReveal';
import { TeamPicker, nameMatcher, pillClass, useTeamPickerOver } from '@web/pages/game/TeamPicker';
import { VersionBanner } from '../components/EntityPage';
import { errorMessage, useWorkingVersion } from '../lib/content';

/** Étiquettes fictives, pour retrouver le filtre et le tri par étiquette du jeu. */
const TEST_TAGS: PokemonTagDto[] = [
  { id: 'test-favori', label: 'Favori', color: '#ef4444' },
  { id: 'test-combat', label: 'Combat', color: '#3b82f6' },
  { id: 'test-elevage', label: 'Élevage', color: '#22c55e' },
  { id: 'test-relache', label: 'À relâcher', color: '#64748b' },
];

const randomSeed = () => Math.floor(Math.random() * (MAX_SEED + 1));

/** Pokémon fictif du PC simulé : la graine (dans son identifiant) fixe ses IV, nature et talent. */
function virtualPokemon(
  ctx: GameContext,
  speciesId: number,
  level: number,
  regionId: string,
  seed = randomSeed(),
  tagIds: string[] = [],
): PokemonDto {
  const p = generatePokemon(ctx, createRng(seed), speciesId, level, { shinyProbability: 0 });
  return {
    ...p,
    id: `sim-${seed}`,
    formId: p.formId ?? null,
    originalNature: null,
    origin: 'capture',
    originRegion: regionId,
    caughtAt: new Date().toISOString(),
    locked: false,
    busy: false,
    activity: null,
    koUntil: null,
    tagIds,
  };
}

/** Réglage gardé dans ce navigateur (PC fictif, favoris) ; sans stockage, il vaut pour la session. */
function useStored<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const set = (next: T) => {
    setValue(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Stockage indisponible : on garde la valeur en mémoire.
    }
  };
  return [value, set] as const;
}

interface Simulation {
  input: StartExpeditionInput;
  chain: number;
  seed: number;
  result: StoredExpeditionResult;
}

/**
 * Expédition instantanée, avec les écrans du jeu (zones, lancement, résultat) et le contenu de la
 * version de travail (brouillon compris). PC fictif, étiquettes de test, stock de Balls et baies
 * illimité : rien n'est enregistré côté serveur.
 */
export function ExpeditionSimulatorPage() {
  const { data: w, isPending, error } = useWorkingVersion();
  const [regionId, setRegionId] = useState<string | null>(null);
  const [zoneId, setZoneId] = useState<string | null>(null);
  // Un PC fictif par région : seuls les Pokémon du Pokédex régional partent.
  const [pcs, setPcs] = useStored<Record<string, PokemonDto[]>>('sim-expedition-pc', {});
  const [favorites, setFavorites] = useStored<string[]>('sim-expedition-favorites', []);
  // Chaînes de zone : chaque simulation fait avancer celle de sa zone, comme en jeu.
  const [chains, setChains] = useState<Record<string, number>>({});
  // Pokédex vierge : silhouettes, « Nouveau ! » à chaque première capture ; complet : rien de neuf.
  const [emptyDex, setEmptyDex] = useState(true);
  const [withCharm, setWithCharm] = useState(false);

  if (isPending) return <p className="text-sm text-slate-500">Chargement…</p>;
  if (!w) return <p className="text-sm text-red-600">{errorMessage(error)}</p>;
  const { ctx } = w;
  const region = ctx.region(regionId ?? '') ?? ctx.regions[0];
  const zones = ctx.zones.filter((z) => z.regionId === region?.id);
  const zone = zoneId ? ctx.zone(zoneId) : undefined;
  const bestCharm = charmMultiplier(
    ctx,
    ctx.content.items.map((i) => i.id),
  );
  const charm = withCharm ? bestCharm : 1;

  const seen = new Set(
    emptyDex ? [] : ctx.zones.flatMap((z) => z.encounters.map((e) => e.speciesId)),
  );
  const caughtForms = new Set(
    emptyDex ? [] : ctx.zones.flatMap((z) => z.encounters.flatMap((e) => e.formId ?? [])),
  );
  const chainDto = (id: string): ShinyChainDto | undefined =>
    chains[id] ? { zoneId: id, chain: chains[id], expiresAt: null } : undefined;
  const favoriteZones = favorites.flatMap((id) => ctx.zone(id) ?? []);
  const zoneCard = (z: Zone) => (
    <ZoneCard
      key={z.id}
      ctx={ctx}
      zone={z}
      seen={seen}
      caught={seen}
      caughtForms={caughtForms}
      unlocked
      canLaunch={z.durationsMinutes.length > 0}
      chain={chainDto(z.id)}
      // Chaînes sans délai de relance : l’heure n’est pas utilisée.
      serverNow={0}
      onLaunch={() => setZoneId(z.id)}
      favorite={favorites.includes(z.id)}
      onFavorite={(on) =>
        setFavorites(on ? [...favorites, z.id] : favorites.filter((id) => id !== z.id))
      }
    />
  );

  const settings = (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
      <div className="flex items-center gap-1">
        <span className="mr-1 text-slate-500">Pokédex</span>
        <button type="button" className={pillClass(emptyDex)} onClick={() => setEmptyDex(true)}>
          Vierge
        </button>
        <button type="button" className={pillClass(!emptyDex)} onClick={() => setEmptyDex(false)}>
          Complet
        </button>
      </div>
      <label
        className={`flex items-center gap-2 ${bestCharm > 1 ? '' : 'opacity-50'}`}
        title={bestCharm > 1 ? undefined : 'Aucun Charme Chroma dans le contenu'}
      >
        <input
          type="checkbox"
          disabled={bestCharm <= 1}
          checked={withCharm}
          onChange={(e) => setWithCharm(e.target.checked)}
        />
        <span>Charme Chroma</span>
      </label>
      {Object.keys(chains).length > 0 && (
        <button
          type="button"
          className="text-slate-500 hover:underline"
          onClick={() => setChains({})}
        >
          Remettre les chaînes à 0
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <VersionBanner working={w} />
        <div>
          <h1 className="text-xl font-bold">Simulateur d’expédition</h1>
          <p className="text-sm text-slate-500">
            Expédition instantanée avec les écrans du jeu et le contenu de la version de travail. PC
            fictif (gardé dans ce navigateur), étiquettes de test, Balls et baies illimitées : rien
            n’est enregistré côté serveur.
          </p>
        </div>
        <div className="card p-4">{settings}</div>
      </div>

      {favoriteZones.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">★ Favoris</h2>
          <div className="grid gap-3 md:grid-cols-2">{favoriteZones.map(zoneCard)}</div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap gap-1" role="tablist">
          {ctx.regions.map((r) => (
            <button
              key={r.id}
              role="tab"
              aria-selected={r.id === region?.id}
              onClick={() => setRegionId(r.id)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                r.id === region?.id
                  ? 'bg-brand-500 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              {r.name}
              {!r.enabled && ' (désactivée)'}
            </button>
          ))}
        </div>
        {region && (
          <>
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">Zones de {region.name}</h2>
              <span className="text-sm text-slate-500">
                PC fictif : {(pcs[region.id] ?? []).length} Pokémon
              </span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">{zones.map(zoneCard)}</div>
            {zones.length === 0 && <p className="text-sm text-slate-500">Aucune zone.</p>}
          </>
        )}
      </section>

      {zone && (
        <SimulatorDialog
          key={zone.id}
          ctx={ctx}
          zone={zone}
          pc={pcs[zone.regionId] ?? []}
          onPcChange={(pc) => setPcs({ ...pcs, [zone.regionId]: pc })}
          chain={chains[zone.id] ?? 0}
          onChainChange={(chain) => setChains((c) => ({ ...c, [zone.id]: chain }))}
          charm={charm}
          emptyDex={emptyDex}
          settings={settings}
          onClose={() => setZoneId(null)}
        />
      )}
    </div>
  );
}

function SimulatorDialog({
  ctx,
  zone,
  pc,
  onPcChange,
  chain,
  onChainChange,
  charm,
  emptyDex,
  settings,
  onClose,
}: {
  ctx: GameContext;
  zone: Zone;
  pc: PokemonDto[];
  onPcChange: (pc: PokemonDto[]) => void;
  /** Maillon qu'aurait la prochaine expédition dans la zone. */
  chain: number;
  onChainChange: (chain: number) => void;
  charm: number;
  emptyDex: boolean;
  /** Réglages de la simulation (Pokédex, Charme Chroma), partagés avec la page. */
  settings: ReactNode;
  onClose: () => void;
}) {
  const picker = useTeamPickerOver(ctx, zone, pc, TEST_TAGS);
  const [sim, setSim] = useState<Simulation | null>(null);
  const [runs, setRuns] = useState(0);
  const pcById = new Map(pc.map((p) => [p.id, p]));

  function run(input: StartExpeditionInput, simChain: number) {
    const encounters = encounterCount(ctx, input.durationMinutes);
    // Seules les rencontres de la zone comptent pour le filtre « nouveaux Pokémon ».
    const caught: CaughtDex = emptyDex
      ? { speciesIds: new Set(), formIds: new Set() }
      : {
          speciesIds: new Set(zone.encounters.map((e) => e.speciesId)),
          formIds: new Set(zone.encounters.flatMap((e) => e.formId ?? [])),
        };
    const seed = randomSeed();
    const result = resolveExpedition(ctx, {
      zone,
      durationMinutes: input.durationMinutes,
      seed,
      team: input.team.flatMap((id) => pcById.get(id) ?? []),
      balls: input.ballItemId
        ? {
            itemId: input.ballItemId,
            quantity: Math.min(encounters, input.ballCount ?? encounters),
          }
        : null,
      berries: input.berryItemId ? { itemId: input.berryItemId, quantity: encounters } : null,
      pity: {},
      shiny: { chain: simChain, charm },
      captureFilter: input.captureFilter,
      caught,
    });
    const captured = result.encounters.filter((e) => e.outcome === 'captured');
    setSim({
      input,
      chain: simChain,
      seed,
      result: {
        ...result,
        // Identifiants fictifs des captures : le résultat affiche leurs actions comme en jeu.
        encounters: result.encounters.map((e, i) =>
          e.pokemon ? { ...e, pokemonId: `capture-${i}` } : e,
        ),
        newSpeciesIds: emptyDex ? [...new Set(captured.map((e) => e.speciesId))] : [],
        newFormIds: emptyDex ? [...new Set(captured.flatMap((e) => e.formId ?? []))] : [],
      },
    });
    setRuns((n) => n + 1);
    // Comme en jeu : l'expédition suivante dans la zone sera au maillon d'après.
    onChainChange(simChain + 1);
  }

  return (
    <Modal open onClose={sim ? () => setSim(null) : onClose} wide>
      {/* Le formulaire reste monté pendant le résultat : ses réglages sont conservés. */}
      <div hidden={!!sim}>
        <LaunchExpeditionForm
          ctx={ctx}
          zone={zone}
          chain={chain}
          charm={charm}
          owned={() => Number.MAX_SAFE_INTEGER}
          unlimitedItems
          team={picker.team}
          members={picker.members}
          renderTeam={(power) => (
            <>
              <TeamPicker ctx={ctx} zone={zone} picker={picker} power={power} />
              <VirtualPcEditor
                ctx={ctx}
                regionId={zone.regionId}
                pc={pc}
                onChange={(next) => {
                  // Un Pokémon retiré du PC quitte aussi l'équipe.
                  picker.setTeam((t) => t.filter((id) => next.some((p) => p.id === id)));
                  onPcChange(next);
                }}
              />
            </>
          )}
          extra={
            <div className="mt-3 space-y-2 rounded-xl border border-dashed border-slate-300 p-3 dark:border-slate-700">
              <label className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-slate-500">Simulation</span>
                <span className="ml-4 text-slate-500">Maillon de chaîne</span>
                <input
                  type="number"
                  className="input w-20 py-1"
                  min={0}
                  value={chain}
                  onChange={(e) =>
                    onChainChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))
                  }
                />
              </label>
              {settings}
            </div>
          }
          pending={false}
          error={null}
          submitLabel={(d) => `Partir (${formatDuration(d)}) — instantané`}
          onCancel={onClose}
          onSubmit={(input) => run(input, chain)}
        />
      </div>
      {sim && (
        <ExpeditionRevealView
          key={runs}
          ctx={ctx}
          expedition={{ zoneId: zone.id, questId: null, shinyChain: sim.chain, result: sim.result }}
          pokemon={(id) =>
            pcById.get(id) ?? sim.result.encounters.find((e) => e.pokemonId === id)?.pokemon
          }
          renderNewborn={(id) => <SimNewbornActions key={`${runs}:${id}`} />}
          footer={
            <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
              <span className="mr-auto text-xs text-slate-400">Graine {sim.seed}</span>
              <button
                className="btn-ghost"
                onClick={() => run(sim.input, sim.chain)}
                title="Nouveau tirage au même maillon de chaîne"
              >
                ↻ Même maillon
              </button>
              <button
                className="btn-ghost"
                onClick={() => run(sim.input, sim.chain + 1)}
                title="Repartir avec les mêmes réglages, au maillon suivant (comme en jeu)"
              >
                ↻ Relancer
              </button>
              <button className="btn-primary" onClick={() => setSim(null)}>
                Continuer
              </button>
            </div>
          }
        />
      )}
    </Modal>
  );
}

/**
 * Favori, étiquettes et Transférer sous une capture, comme en jeu : l'état change à l'écran
 * seulement, rien n'est enregistré.
 */
function SimNewbornActions() {
  const [locked, setLocked] = useState(false);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [transferred, setTransferred] = useState(false);
  if (transferred) return <p className="mt-1 text-slate-500">Transféré (simulation)</p>;
  return (
    <NewbornActionsView
      pokemon={{ locked, busy: false }}
      tags={
        <TagToggleList
          tags={TEST_TAGS}
          current={tagIds}
          compact
          onToggle={(id) =>
            setTagIds((t) => (t.includes(id) ? t.filter((c) => c !== id) : [...t, id]))
          }
        />
      }
      onToggleLock={() => setLocked((l) => !l)}
      onTransfer={() => setTransferred(true)}
    />
  );
}

/**
 * PC fictif de la région : ajout de Pokémon du Pokédex régional (un par un ou tous), niveau et
 * étiquettes de test de chacun.
 */
function VirtualPcEditor({
  ctx,
  regionId,
  pc,
  onChange,
}: {
  ctx: GameContext;
  regionId: string;
  pc: PokemonDto[];
  onChange: (pc: PokemonDto[]) => void;
}) {
  const region = ctx.region(regionId);
  const [open, setOpen] = useState(pc.length === 0);
  const [level, setLevel] = useState(30);
  const [search, setSearch] = useState('');
  const matchesName = nameMatcher(search);
  const dex = (region?.speciesIds ?? []).flatMap((id) => {
    const s = ctx.species(id);
    return s?.enabled ? [s] : [];
  });
  const candidates = search.trim() ? dex.filter((s) => matchesName(s.nameFr)).slice(0, 24) : [];
  const add = (speciesIds: number[]) =>
    onChange([...pc, ...speciesIds.map((id) => virtualPokemon(ctx, id, level, regionId))]);
  const update = (p: PokemonDto, next: PokemonDto) =>
    onChange(pc.map((q) => (q.id === p.id ? next : q)));
  const setLevelOf = (p: PokemonDto, lvl: number) =>
    update(p, virtualPokemon(ctx, p.speciesId, lvl, regionId, Number(p.id.slice(4)), p.tagIds));
  const toggleTag = (p: PokemonDto, tagId: string) =>
    update(p, {
      ...p,
      tagIds: p.tagIds.includes(tagId) ? p.tagIds.filter((t) => t !== tagId) : [...p.tagIds, tagId],
    });

  return (
    <div className="mt-3 rounded-xl border border-dashed border-slate-300 p-3 text-xs dark:border-slate-700">
      <button
        type="button"
        className="flex w-full items-center justify-between font-semibold text-slate-500"
        onClick={() => setOpen((o) => !o)}
      >
        PC fictif de {region?.name ?? regionId} ({pc.length} Pokémon) : ajout, niveaux, étiquettes
        <span>{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-500">Niveau</span>
            <input
              type="number"
              className="input w-16 py-0.5 text-xs"
              min={1}
              max={MAX_LEVEL}
              value={level}
              onChange={(e) =>
                setLevel(Math.max(1, Math.min(MAX_LEVEL, Number(e.target.value) || 1)))
              }
            />
            <input
              className="input w-40 py-0.5 text-xs"
              placeholder="Ajouter une espèce…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              type="button"
              className="btn-ghost px-2 py-0.5 text-xs"
              onClick={() => add(dex.map((s) => s.id))}
            >
              + Tout le Pokédex de {region?.name ?? regionId}
            </button>
            {pc.length > 0 && (
              <button
                type="button"
                className="ml-auto text-red-600 hover:underline"
                onClick={() => onChange([])}
              >
                Vider le PC
              </button>
            )}
          </div>
          {candidates.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {candidates.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => add([s.id])}
                  className="flex items-center gap-1 rounded-full border border-slate-200 py-0.5 pr-2 pl-0.5 hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800"
                >
                  <PokemonSprite speciesId={s.id} size={24} />+ {s.nameFr}
                </button>
              ))}
            </div>
          )}
          {pc.length > 0 && (
            <ul className="max-h-48 space-y-1 overflow-y-auto">
              {pc.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2">
                  <PokemonSprite speciesId={p.speciesId} formId={p.formId} size={28} />
                  <span className="w-24 truncate">
                    {ctx.species(p.speciesId, p.formId)?.nameFr}
                  </span>
                  <label className="flex items-center gap-1 text-slate-500">
                    N.
                    <input
                      type="number"
                      className="input w-14 px-1 py-0 text-xs"
                      min={1}
                      max={MAX_LEVEL}
                      value={p.level}
                      onChange={(e) =>
                        setLevelOf(p, Math.max(1, Math.min(MAX_LEVEL, Number(e.target.value) || 1)))
                      }
                    />
                  </label>
                  <span className="flex flex-wrap gap-1">
                    {TEST_TAGS.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggleTag(p, t.id)}
                        aria-pressed={p.tagIds.includes(t.id)}
                        className={`rounded transition ${
                          p.tagIds.includes(t.id)
                            ? 'ring-2 ring-brand-500 ring-offset-1 dark:ring-offset-slate-900'
                            : 'opacity-30 hover:opacity-100'
                        }`}
                      >
                        <TagBadge tag={t} />
                      </button>
                    ))}
                  </span>
                  <button
                    type="button"
                    className="ml-auto text-slate-400 hover:text-red-600"
                    onClick={() => onChange(pc.filter((q) => q.id !== p.id))}
                    aria-label="Retirer du PC"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
