import { useState } from 'react';
import { RARITIES, speciesOverrideSchema } from '@poke/content';
import type { SpeciesOverride } from '@poke/content';
import { STAT_NAMES, habitats, species as allSpecies, speciesForms } from '@poke/data';
import { IssueList, VersionBanner } from '../../components/EntityPage';
import { Field, NullableTextInput, Toggle, validate } from '../../components/forms/fields';
import { Sprite, TypeBadge, typeLabel } from '../../components/forms/pickers';
import type { WorkingVersion } from '../../lib/content';
import { errorMessage, useDeleteEntity, useSaveEntity, useWorkingVersion } from '../../lib/content';
import { RARITY_LABELS } from './ItemsPage';

const habitatNames = new Map(habitats.map((h) => [h.name, h.nameFr]));
const STAT_SHORT = ['PV', 'Atq', 'Déf', 'AtqS', 'DéfS', 'Vit'];

/** Espèces : base PokéAPI en lecture seule + surcharges éditables. */
export function SpeciesPage() {
  const working = useWorkingVersion();
  const [search, setSearch] = useState('');
  const [onlyOverridden, setOnlyOverridden] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  if (working.isPending) return <p className="text-slate-500">Chargement…</p>;
  if (!working.data) return <p className="text-red-600">{errorMessage(working.error)}</p>;
  const w = working.data;
  const overrides = new Map(w.content.speciesOverrides.map((o) => [o.speciesId, o]));
  const needle = search.trim().toLowerCase();
  const rows = allSpecies.filter((s) => {
    if (onlyOverridden && !overrides.has(s.id)) return false;
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
        <span className="text-sm text-slate-500">
          {rows.length} espèce(s) · {overrides.size} surcharge(s)
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
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs text-slate-500 uppercase">
            <tr className="border-b border-slate-200 dark:border-slate-800">
              <th className="px-3 py-2">N°</th>
              <th className="px-3 py-2">Espèce</th>
              <th className="px-3 py-2">Types</th>
              <th className="px-3 py-2">Habitat</th>
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
