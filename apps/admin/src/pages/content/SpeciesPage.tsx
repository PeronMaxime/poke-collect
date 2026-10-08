import { useState } from 'react';
import { RARITIES, speciesOverrideSchema } from '@poke/content';
import type { Item, Quest, SpeciesOverride, Zone } from '@poke/content';
import {
  DEX_FORM_SECTIONS,
  STAT_NAMES,
  abilities,
  forms as allForms,
  habitats,
  species as allSpecies,
  speciesForms,
} from '@poke/data';
import type { FormKind, PokemonForm } from '@poke/data';
import { IssueList, VersionBanner } from '../../components/EntityPage';
import { Field, NullableTextInput, Toggle, validate } from '../../components/forms/fields';
import { Sprite, TypeBadge, typeLabel } from '../../components/forms/pickers';
import type { WorkingVersion } from '../../lib/content';
import { errorMessage, useDeleteEntity, useSaveEntity, useWorkingVersion } from '../../lib/content';
import { RARITY_LABELS } from './ItemsPage';

const habitatNames = new Map(habitats.map((h) => [h.name, h.nameFr]));
const abilityNames = new Map(abilities.map((a) => [a.name, a.nameFr]));
const STAT_SHORT = ['PV', 'Atq', 'Déf', 'AtqS', 'DéfS', 'Vit'];

interface SpeciesLocation {
  zones: { zone: Zone; active: boolean }[];
  quests: Quest[];
  /** Fossiles qui redonnent vie à l'espèce (ou à la forme) au Musée. */
  fossils: Item[];
  starter: boolean;
}

/**
 * Où chaque espèce s'obtient : zones (actives ou non) qui la rencontrent, quêtes qui l'offrent,
 * fossiles qui la restaurent, starters des régions.
 */
function locateSpecies(w: WorkingVersion): Map<number, SpeciesLocation> {
  const result = new Map<number, SpeciesLocation>();
  const entry = (id: number) => {
    let loc = result.get(id);
    if (!loc) result.set(id, (loc = { zones: [], quests: [], fossils: [], starter: false }));
    return loc;
  };
  for (const zone of w.ctx.zones) {
    const active = zone.enabled && w.ctx.region(zone.regionId)?.enabled !== false;
    for (const id of new Set(zone.encounters.map((e) => e.speciesId))) {
      entry(id).zones.push({ zone, active });
    }
  }
  for (const quest of w.content.quests) {
    for (const p of quest.rewards.pokemon) entry(p.speciesId).quests.push(quest);
  }
  for (const item of w.content.items) {
    const fossil = w.ctx.itemEffect(item.id, 'fossil');
    if (fossil) entry(fossil.speciesId).fossils.push(item);
  }
  for (const region of w.content.regions) {
    for (const id of region.starterSpeciesIds) entry(id).starter = true;
  }
  return result;
}

const hasActiveZone = (loc: SpeciesLocation | undefined) => !!loc?.zones.some((z) => z.active);

/** Où chaque forme s'obtient : zones qui la rencontrent, quêtes qui l'offrent, fossiles. */
function locateForms(w: WorkingVersion): Map<number, SpeciesLocation> {
  const result = new Map<number, SpeciesLocation>();
  const entry = (id: number) => {
    let loc = result.get(id);
    if (!loc) result.set(id, (loc = { zones: [], quests: [], fossils: [], starter: false }));
    return loc;
  };
  for (const zone of w.ctx.zones) {
    const active = zone.enabled && w.ctx.region(zone.regionId)?.enabled !== false;
    for (const id of new Set(zone.encounters.flatMap((e) => (e.formId ? [e.formId] : [])))) {
      entry(id).zones.push({ zone, active });
    }
  }
  for (const quest of w.content.quests) {
    for (const p of quest.rewards.pokemon) if (p.formId) entry(p.formId).quests.push(quest);
  }
  for (const item of w.content.items) {
    const fossil = w.ctx.itemEffect(item.id, 'fossil');
    if (fossil?.formId) entry(fossil.formId).fossils.push(item);
  }
  return result;
}

const VIEWS: { id: 'species' | FormKind; label: string; count: number }[] = [
  { id: 'species', label: 'Espèces', count: allSpecies.length },
  ...DEX_FORM_SECTIONS.map((s) => ({
    id: s.kind,
    label: s.label,
    count: allForms.filter((f) => f.kind === s.kind).length,
  })),
];
type View = (typeof VIEWS)[number]['id'];

/** Espèces et leurs formes (régionales, Méga, Gigamax…) : onglet par type de forme. */
export function SpeciesPage() {
  const [view, setView] = useState<View>('species');
  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-1">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              view === v.id
                ? 'bg-brand-500 text-white'
                : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {v.label} <span className="opacity-70">({v.count})</span>
          </button>
        ))}
      </nav>
      {view === 'species' ? <SpeciesView /> : <FormsView key={view} kind={view} />}
    </div>
  );
}

/**
 * Formes d'un type : données PokéAPI en lecture seule. Les surcharges (activation, nom,
 * habitat…) se règlent sur l'espèce de base, ouverte au clic.
 */
function FormsView({ kind }: { kind: FormKind }) {
  const working = useWorkingVersion();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<number | null>(null);

  if (working.isPending) return <p className="text-slate-500">Chargement…</p>;
  if (!working.data) return <p className="text-red-600">{errorMessage(working.error)}</p>;
  const w = working.data;
  const overrides = new Map(w.content.speciesOverrides.map((o) => [o.speciesId, o]));
  const locations = locateForms(w);
  const section = DEX_FORM_SECTIONS.find((s) => s.kind === kind)!;
  const needle = search.trim().toLowerCase();
  const rows = allForms.filter((f: PokemonForm) => {
    if (f.kind !== kind) return false;
    if (!needle) return true;
    return (
      String(f.speciesId) === needle ||
      f.nameFr.toLowerCase().includes(needle) ||
      w.ctx.species(f.speciesId)!.nameFr.toLowerCase().includes(needle) ||
      f.name.includes(needle) ||
      f.types.some((t) => typeLabel(t).toLowerCase().includes(needle))
    );
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{section.label}</h1>
        <p className="mt-1 text-slate-500">
          Données PokéAPI en lecture seule. Cliquer sur une forme ouvre son espèce de base, qui
          porte les surcharges.
        </p>
      </div>
      <VersionBanner working={w} />

      <div className="flex flex-wrap items-center gap-3">
        <input
          className="input max-w-xs"
          placeholder="Nom, numéro ou type…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="text-sm text-slate-500">{rows.length} forme(s)</span>
      </div>

      {selected !== null && (
        <SpeciesEditor
          key={`${w.version.id}:${selected}`}
          working={w}
          speciesId={selected}
          override={overrides.get(selected)}
          onClose={() => setSelected(null)}
        />
      )}

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="text-left text-xs text-slate-500 uppercase">
            <tr className="border-b border-slate-200 dark:border-slate-800">
              <th className="px-3 py-2">N°</th>
              <th className="px-3 py-2">Forme</th>
              <th className="px-3 py-2">Espèce de base</th>
              <th className="px-3 py-2">Types</th>
              <th className="px-3 py-2">Localisation</th>
              <th className="px-3 py-2">Talents</th>
              <th className="px-3 py-2 text-right">Stats</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => {
              const base = w.ctx.species(f.speciesId)!;
              const location = locations.get(f.id);
              return (
                <tr
                  key={f.id}
                  onClick={() => setSelected(f.speciesId)}
                  className={`cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50 ${
                    base.enabled ? '' : 'opacity-50'
                  } ${selected === f.speciesId ? 'bg-brand-500/5' : ''}`}
                >
                  <td className="px-3 py-1 font-mono text-slate-500">{f.speciesId}</td>
                  <td className="px-3 py-1">
                    <span className="flex items-center gap-1" title={f.name}>
                      <Sprite id={f.speciesId} formId={f.id} size={36} />
                      {f.nameFr}
                    </span>
                  </td>
                  <td className="px-3 py-1 text-slate-500">
                    <span className="flex items-center gap-1">
                      <Sprite id={f.speciesId} size={28} />
                      {base.nameFr}
                    </span>
                  </td>
                  <td className="px-3 py-1">
                    <span className="flex gap-1">
                      {f.types.map((t) => (
                        <TypeBadge key={t} type={t} />
                      ))}
                    </span>
                  </td>
                  <td className="px-3 py-1 text-xs">
                    {location?.zones.length ? (
                      <span
                        className={hasActiveZone(location) ? '' : 'text-slate-400 line-through'}
                      >
                        {location.zones.map((z) => z.zone.name).join(', ')}
                      </span>
                    ) : location?.quests.length ? (
                      <span className="text-slate-500">
                        Quête : {location.quests.map((q) => q.name).join(', ')}
                      </span>
                    ) : location?.fossils.length ? (
                      <span className="text-slate-500">
                        Fossile : {location.fossils.map((i) => i.name).join(', ')}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-1 text-xs text-slate-500">
                    {f.abilities.map((a) => abilityNames.get(a.name) ?? a.name).join(', ')}
                  </td>
                  <td
                    className="px-3 py-1 text-right font-mono"
                    title={STAT_NAMES.map((s, i) => `${STAT_SHORT[i]} ${f.baseStats[s]}`).join(
                      ' · ',
                    )}
                  >
                    {STAT_NAMES.reduce((sum, st) => sum + f.baseStats[st], 0)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Espèces : base PokéAPI en lecture seule + surcharges éditables. */
function SpeciesView() {
  const working = useWorkingVersion();
  const [search, setSearch] = useState('');
  const [onlyOverridden, setOnlyOverridden] = useState(false);
  const [onlyUnlocated, setOnlyUnlocated] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  if (working.isPending) return <p className="text-slate-500">Chargement…</p>;
  if (!working.data) return <p className="text-red-600">{errorMessage(working.error)}</p>;
  const w = working.data;
  const overrides = new Map(w.content.speciesOverrides.map((o) => [o.speciesId, o]));
  const locations = locateSpecies(w);
  const unlocatedCount = allSpecies.filter(
    (s) => w.ctx.species(s.id)!.enabled && !hasActiveZone(locations.get(s.id)),
  ).length;
  const needle = search.trim().toLowerCase();
  const rows = allSpecies.filter((s) => {
    if (onlyOverridden && !overrides.has(s.id)) return false;
    if (onlyUnlocated && hasActiveZone(locations.get(s.id))) return false;
    if (!needle) return true;
    const merged = w.ctx.species(s.id)!;
    return (
      String(s.id) === needle ||
      merged.nameFr.toLowerCase().includes(needle) ||
      s.name.includes(needle) ||
      s.types.some((t) => typeLabel(t).toLowerCase().includes(needle))
    );
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Espèces</h1>
        <p className="mt-1 text-slate-500">
          Données PokéAPI en lecture seule. Les surcharges (activation, nom, habitat, rareté,
          élevage) s’appliquent par-dessus.
        </p>
      </div>
      <VersionBanner working={w} />

      <div className="flex flex-wrap items-center gap-3">
        <input
          className="input max-w-xs"
          placeholder="Nom, numéro ou type…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Toggle
          checked={onlyOverridden}
          onChange={setOnlyOverridden}
          label="Surchargées uniquement"
        />
        <Toggle checked={onlyUnlocated} onChange={setOnlyUnlocated} label="Sans zone uniquement" />
        <span className="text-sm text-slate-500">
          {rows.length} espèce(s) · {overrides.size} surcharge(s) ·{' '}
          <span className={unlocatedCount ? 'text-amber-600' : ''}>
            {unlocatedCount} espèce(s) activée(s) sans zone active
          </span>
        </span>
      </div>

      {selected !== null && (
        <SpeciesEditor
          key={`${w.version.id}:${selected}`}
          working={w}
          speciesId={selected}
          override={overrides.get(selected)}
          onClose={() => setSelected(null)}
        />
      )}

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="text-left text-xs text-slate-500 uppercase">
            <tr className="border-b border-slate-200 dark:border-slate-800">
              <th className="px-3 py-2">N°</th>
              <th className="px-3 py-2">Espèce</th>
              <th className="px-3 py-2">Types</th>
              <th className="px-3 py-2">Habitat</th>
              <th className="px-3 py-2">Localisation</th>
              <th className="px-3 py-2 text-right">Capture</th>
              <th className="px-3 py-2 text-right">Stats</th>
              <th className="px-3 py-2">Surcharge</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const merged = w.ctx.species(s.id)!;
              const o = overrides.get(s.id);
              return (
                <tr
                  key={s.id}
                  onClick={() => setSelected(s.id)}
                  className={`cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50 ${
                    merged.enabled ? '' : 'opacity-50'
                  } ${selected === s.id ? 'bg-brand-500/5' : ''}`}
                >
                  <td className="px-3 py-1 font-mono text-slate-500">{s.id}</td>
                  <td className="px-3 py-1">
                    <span className="flex items-center gap-1">
                      <Sprite id={s.id} size={36} />
                      {merged.nameFr}
                      {(s.isLegendary || s.isMythical) && (
                        <span title="Légendaire / mythique">✦</span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-1">
                    <span className="flex gap-1">
                      {s.types.map((t) => (
                        <TypeBadge key={t} type={t} />
                      ))}
                    </span>
                  </td>
                  <td className="px-3 py-1 text-slate-500">
                    {merged.habitat ? (habitatNames.get(merged.habitat) ?? merged.habitat) : '—'}
                    {s.habitatInferred && !overrides.get(s.id)?.habitat && (
                      <span
                        className="ml-1 text-xs text-amber-600"
                        title="Gen IV+ : habitat maison déduit des espèces proches (types, forme, couleur)"
                      >
                        (déduit)
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1">
                    <LocationCell w={w} speciesId={s.id} location={locations.get(s.id)} />
                  </td>
                  <td className="px-3 py-1 text-right font-mono">{s.captureRate}</td>
                  <td className="px-3 py-1 text-right font-mono">
                    {STAT_NAMES.reduce((sum, st) => sum + s.baseStats[st], 0)}
                  </td>
                  <td className="px-3 py-1 text-xs">
                    {o ? (o.enabled ? 'Modifiée' : 'Désactivée') : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const MAX_ZONES_SHOWN = 2;

/** Zones de rencontre, ou à défaut l'autre moyen d'obtention (quête, fossile, évolution, œuf). */
function LocationCell({
  w,
  speciesId,
  location,
}: {
  w: WorkingVersion;
  speciesId: number;
  location: SpeciesLocation | undefined;
}) {
  const base = allSpecies.find((s) => s.id === speciesId)!;
  const zones = location?.zones ?? [];
  const quests = location?.quests ?? [];
  const fossils = location?.fossils ?? [];
  const zoneLabel = ({ zone, active }: { zone: Zone; active: boolean }) =>
    `${zone.name} (${w.ctx.region(zone.regionId)?.name ?? zone.regionId})${active ? '' : ' — désactivée'}`;

  if (zones.length) {
    const shown = zones.slice(0, MAX_ZONES_SHOWN);
    return (
      <span className="text-xs" title={zones.map(zoneLabel).join('\n')}>
        {shown.map((z, i) => (
          <span key={z.zone.id} className={z.active ? '' : 'text-slate-400 line-through'}>
            {i > 0 && ', '}
            {z.zone.name}
          </span>
        ))}
        {zones.length > shown.length && (
          <span className="text-slate-500"> +{zones.length - shown.length}</span>
        )}
        {!hasActiveZone(location) && <span className="ml-1 text-amber-600">(inactive)</span>}
      </span>
    );
  }
  const fallback = location?.starter
    ? 'Starter'
    : quests.length
      ? `Quête : ${quests.map((q) => q.name).join(', ')}`
      : fossils.length
        ? `Fossile : ${fossils.map((i) => i.name).join(', ')}`
        : base.evolvesFromSpeciesId
          ? `Évolution de ${w.ctx.species(base.evolvesFromSpeciesId)?.nameFr ?? `#${base.evolvesFromSpeciesId}`}`
          : base.isBaby
            ? 'Œuf'
            : null;
  return fallback ? (
    <span className="text-xs text-slate-500">{fallback}</span>
  ) : (
    <span className="text-xs font-medium text-red-600">Aucune</span>
  );
}

function SpeciesEditor({
  working,
  speciesId,
  override,
  onClose,
}: {
  working: WorkingVersion;
  speciesId: number;
  override: SpeciesOverride | undefined;
  onClose: () => void;
}) {
  const base = allSpecies.find((s) => s.id === speciesId)!;
  const initial: SpeciesOverride = override ?? {
    speciesId,
    enabled: true,
    nameFr: null,
    habitat: null,
    rarity: null,
    breedable: null,
  };
  const [value, setValue] = useState(initial);
  const save = useSaveEntity<SpeciesOverride>(working.version.id, 'species');
  const reset = useDeleteEntity(working.version.id, 'species');
  const { valid, errors } = validate(speciesOverrideSchema, value);
  const editable = working.editable;
  const set = <K extends keyof SpeciesOverride>(k: K, v: SpeciesOverride[K]) =>
    setValue({ ...value, [k]: v });
  const usedIn = working.content.zones.filter((z) =>
    z.encounters.some((e) => e.speciesId === speciesId),
  );
  const issues = working.issues.filter(
    (i) => i.entity === 'speciesOverride' && i.entityId === String(speciesId),
  );

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Sprite id={speciesId} size={80} />
          <div>
            <h2 className="text-lg font-semibold">
              #{speciesId} {base.nameFr}{' '}
              <span className="text-sm text-slate-500">({base.name})</span>
            </h2>
            <p className="text-xs text-slate-500">
              Gén. {base.generation} · taux de capture {base.captureRate} · éclosion{' '}
              {base.hatchCounter ?? '—'} cycles · groupes d’œufs {base.eggGroups.join(', ')}
            </p>
            <p className="text-xs text-slate-500">
              {STAT_NAMES.map((s, i) => `${STAT_SHORT[i]} ${base.baseStats[s]}`).join(' · ')}
            </p>
            {speciesForms(speciesId).length > 0 && (
              <p className="text-xs text-slate-500">
                Formes :{' '}
                {speciesForms(speciesId)
                  .map((f) => `${f.nameFr} (${f.types.map(typeLabel).join('/')})`)
                  .join(', ')}
              </p>
            )}
            <p className="text-xs text-slate-500">
              Rencontrée dans :{' '}
              {usedIn.length ? usedIn.map((z) => z.name).join(', ') : 'aucune zone'}
            </p>
          </div>
        </div>
        <button
          className="text-slate-400 hover:text-slate-600"
          onClick={onClose}
          aria-label="Fermer"
        >
          ✕
        </button>
      </div>

      <IssueList issues={issues} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Statut" hint="Une espèce désactivée n’apparaît plus en rencontre.">
          <Toggle
            checked={value.enabled}
            onChange={(v) => set('enabled', v)}
            label="Activée"
            disabled={!editable}
          />
        </Field>
        <Field
          label="Nom affiché"
          hint={`Par défaut : ${base.nameFr}`}
          error={errors.get('nameFr')}
        >
          <NullableTextInput
            value={value.nameFr}
            onChange={(v) => set('nameFr', v)}
            disabled={!editable}
            placeholder={base.nameFr}
          />
        </Field>
        <Field
          label="Habitat"
          hint={
            base.habitatInferred
              ? `Gen IV+ : déduit des espèces proches (${base.habitat ?? '—'})`
              : `PokéAPI : ${base.habitat ?? 'aucun'}`
          }
        >
          <input
            className="input"
            list="species-habitats"
            value={value.habitat ?? ''}
            disabled={!editable}
            placeholder={base.habitat ?? ''}
            onChange={(e) => set('habitat', e.target.value || null)}
          />
          <datalist id="species-habitats">
            {habitats.map((h) => (
              <option key={h.name} value={h.name}>
                {h.nameFr}
              </option>
            ))}
          </datalist>
        </Field>
        <Field label="Rareté">
          <select
            className="input"
            value={value.rarity ?? ''}
            disabled={!editable}
            onChange={(e) => set('rarity', (e.target.value || null) as SpeciesOverride['rarity'])}
          >
            <option value="">Non définie</option>
            {RARITIES.map((r) => (
              <option key={r} value={r}>
                {RARITY_LABELS[r]}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Élevage"
          hint={`PokéAPI : ${base.eggGroups.includes('no-eggs') ? 'non élevable' : 'élevable'}`}
        >
          <select
            className="input"
            value={value.breedable === null ? '' : String(value.breedable)}
            disabled={!editable}
            onChange={(e) =>
              set('breedable', e.target.value === '' ? null : e.target.value === 'true')
            }
          >
            <option value="">Selon PokéAPI</option>
            <option value="true">Élevable</option>
            <option value="false">Non élevable</option>
          </select>
        </Field>
      </div>

      {(save.error || reset.error) && (
        <p className="text-sm text-red-600">{errorMessage(save.error ?? reset.error)}</p>
      )}
      {editable && (
        <div className="flex justify-end gap-2">
          {override && (
            <button
              className="btn-ghost"
              disabled={reset.isPending}
              onClick={() => reset.mutate(String(speciesId), { onSuccess: onClose })}
            >
              Retirer la surcharge
            </button>
          )}
          <button
            className="btn-primary"
            disabled={!valid || save.isPending || JSON.stringify(value) === JSON.stringify(initial)}
            onClick={() => save.mutate({ entity: value, key: override ? String(speciesId) : null })}
          >
            Enregistrer
          </button>
        </div>
      )}
    </div>
  );
}
