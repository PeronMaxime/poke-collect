import { useState } from 'react';
import { zoneSchema } from '@poke/content';
import type { Encounter, Zone } from '@poke/content';
import { habitats } from '@poke/data';
import { simulateZone } from '@poke/game-core';
import type { ZoneSimulation } from '@poke/game-core';
import { EntityPage } from '../../components/EntityPage';
import type { EntityFormProps } from '../../components/EntityPage';
import {
  Field,
  NullableTextInput,
  NumberInput,
  Section,
  TextInput,
  Toggle,
  errorsUnder,
} from '../../components/forms/fields';
import {
  ItemIcon,
  FormSelect,
  ItemSelect,
  SpeciesSelect,
  Sprite,
  TypeMultiSelect,
  TypeSelect,
  UnlockEditor,
} from '../../components/forms/pickers';
import type { WorkingVersion } from '../../lib/content';

export function ZonesPage() {
  return (
    <EntityPage<Zone>
      title="Zones d’expédition"
      description="Accès (PE minimale, types requis), durées, table de rencontres, butin, affinités, déblocage."
      collection="zones"
      entityKind="zone"
      schema={zoneSchema}
      list={(w) => w.ctx.zones as Zone[]}
      getKey={(z) => z.id}
      searchText={(z) => `${z.id} ${z.name}`}
      renderListItem={(z, w) => (
        <>
          <span
            className={`block truncate font-medium ${z.enabled && w.ctx.region(z.regionId)?.enabled !== false ? '' : 'line-through'}`}
          >
            {z.name}
          </span>
          <span className="block truncate text-xs text-slate-500">
            {w.ctx.region(z.regionId)?.name ?? z.regionId} · PE ≥ {z.minPower} ·{' '}
            {z.encounters.length} rencontre(s)
          </span>
        </>
      )}
      create={(w) => ({
        id: '',
        regionId: w.ctx.regions[0]?.id ?? '',
        order: w.content.zones.length,
        name: '',
        description: '',
        image: null,
        habitat: null,
        minPower: 0,
        requiredTypes: [],
        affinityTypes: [],
        durationsMinutes: [...w.content.balance.expeditions.durationsMinutes],
        encounters: [],
        lootTableId: null,
        enabled: true,
        unlock: { type: 'always' },
      })}
      duplicate={(z) => ({ ...structuredClone(z), id: `${z.id}-copie`, name: `${z.name} (copie)` })}
      renderForm={(p) => <ZoneForm {...p} />}
      renderExtra={(z, w) => <ZoneSimulator zone={z} working={w} />}
      newLabel="Nouvelle zone"
    />
  );
}

function ZoneForm({ value: z, onChange, errors, isNew, editable, working }: EntityFormProps<Zone>) {
  const set = <K extends keyof Zone>(key: K, v: Zone[K]) => onChange({ ...z, [key]: v });
  const { ctx } = working;
  const disabled = !editable;
  const durations = [
    ...new Set([...working.content.balance.expeditions.durationsMinutes, ...z.durationsMinutes]),
  ].sort((a, b) => a - b);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Identifiant"
          hint="Minuscules et tirets, non modifiable ensuite."
          error={errors.get('id')}
        >
          <TextInput value={z.id} onChange={(v) => set('id', v)} disabled={disabled || !isNew} />
        </Field>
        <Field label="Nom" error={errors.get('name')}>
          <TextInput value={z.name} onChange={(v) => set('name', v)} disabled={disabled} />
        </Field>
        <Field label="Région" error={errors.get('regionId')}>
          <select
            className="input"
            value={z.regionId}
            disabled={disabled}
            onChange={(e) => set('regionId', e.target.value)}
          >
            {ctx.regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ordre d’affichage" error={errors.get('order')}>
          <NumberInput
            value={z.order}
            min={0}
            onChange={(v) => set('order', v)}
            disabled={disabled}
          />
        </Field>
        <Field label="Habitat" hint="Habitat PokéAPI ou habitat maison.">
          <input
            className="input"
            list="habitats"
            value={z.habitat ?? ''}
            disabled={disabled}
            onChange={(e) => set('habitat', e.target.value || null)}
          />
          <datalist id="habitats">
            {habitats.map((h) => (
              <option key={h.name} value={h.name}>
                {h.nameFr}
              </option>
            ))}
          </datalist>
        </Field>
        <Field label="Illustration (URL)" error={errors.get('image')}>
          <NullableTextInput
            value={z.image}
            onChange={(v) => set('image', v)}
            disabled={disabled}
            placeholder="https://…"
          />
        </Field>
        <Field label="Description" className="sm:col-span-2" error={errors.get('description')}>
          <TextInput
            multiline
            value={z.description}
            onChange={(v) => set('description', v)}
            disabled={disabled}
            maxLength={500}
          />
        </Field>
      </div>
      <Toggle
        checked={z.enabled}
        onChange={(v) => set('enabled', v)}
        label="Zone activée (désactivée : cachée aux joueurs, plus aucune expédition ne peut y partir)"
        disabled={disabled}
      />

      <Section title="Accès">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="PE minimale de l’équipe" error={errors.get('minPower')}>
            <NumberInput
              value={z.minPower}
              min={0}
              unit="PE"
              onChange={(v) => set('minPower', v)}
              disabled={disabled}
            />
          </Field>
          <Field label="Condition de déblocage" error={errorsUnder(errors, 'unlock')[0]}>
            <UnlockEditor
              value={z.unlock}
              regions={ctx.regions}
              trainers={ctx.trainers}
              quests={ctx.quests}
              onChange={(v) => set('unlock', v)}
              disabled={disabled}
            />
          </Field>
        </div>
        <Field label="Types requis" hint="Exemple : 2 Pokémon Eau pour une zone sous-marine.">
          <div className="space-y-2">
            {z.requiredTypes.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <NumberInput
                  className="w-24"
                  value={r.count}
                  min={1}
                  max={6}
                  unit="×"
                  disabled={disabled}
                  onChange={(count) =>
                    set(
                      'requiredTypes',
                      z.requiredTypes.map((x, j) => (j === i ? { ...x, count } : x)),
                    )
                  }
                />
                <TypeSelect
                  value={r.type}
                  disabled={disabled}
                  onChange={(type) =>
                    set(
                      'requiredTypes',
                      z.requiredTypes.map((x, j) => (j === i ? { ...x, type } : x)),
                    )
                  }
                />
                {!disabled && (
                  <button
                    type="button"
                    className="text-slate-400 hover:text-red-600"
                    onClick={() =>
                      set(
                        'requiredTypes',
                        z.requiredTypes.filter((_, j) => j !== i),
                      )
                    }
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {!disabled && (
              <button
                type="button"
                className="btn-ghost py-1 text-xs"
                onClick={() =>
                  set('requiredTypes', [...z.requiredTypes, { type: 'water', count: 1 }])
                }
              >
                + Type requis
              </button>
            )}
          </div>
        </Field>
        <Field
          label="Types en affinité"
          hint="Chaque membre ayant l’un de ces types augmente la capture."
        >
          <TypeMultiSelect
            value={z.affinityTypes}
            onChange={(v) => set('affinityTypes', v)}
            disabled={disabled}
          />
        </Field>
        <Field label="Durées disponibles" error={errors.get('durationsMinutes')}>
          <div className="flex flex-wrap gap-3">
            {durations.map((d) => (
              <label key={d} className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={z.durationsMinutes.includes(d)}
                  onChange={(e) =>
                    set(
                      'durationsMinutes',
                      e.target.checked
                        ? [...z.durationsMinutes, d].sort((a, b) => a - b)
                        : z.durationsMinutes.filter((x) => x !== d),
                    )
                  }
                />
                {d < 60 ? `${d} min` : `${d / 60} h`}
              </label>
            ))}
          </div>
        </Field>
      </Section>

      <Section title="Rencontres">
        <EncounterTable
          working={working}
          encounters={z.encounters}
          onChange={(v) => set('encounters', v)}
          errors={errors}
          disabled={disabled}
        />
      </Section>

      <Section title="Butin">
        <Field label="Table de butin" error={errors.get('lootTableId')}>
          <select
            className="input"
            value={z.lootTableId ?? ''}
            disabled={disabled}
            onChange={(e) => set('lootTableId', e.target.value || null)}
          >
            <option value="">Aucune</option>
            {working.content.lootTables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.id})
              </option>
            ))}
          </select>
        </Field>
        {z.lootTableId && (
          <ul className="flex flex-wrap gap-3 text-xs text-slate-500">
            {ctx.lootTable(z.lootTableId)?.entries.map((e) => (
              <li key={e.itemId} className="flex items-center gap-1">
                <ItemIcon ctx={ctx} id={e.itemId} size={20} />
                {ctx.item(e.itemId)?.name ?? e.itemId} · {Math.round(e.chance * 100)} % · {e.min}–
                {e.max}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function EncounterTable({
  working,
  encounters,
  onChange,
  errors,
  disabled,
}: {
  working: WorkingVersion;
  encounters: Encounter[];
  onChange: (v: Encounter[]) => void;
  errors: ReadonlyMap<string, string>;
  disabled: boolean;
}) {
  const { ctx } = working;
  const update = (i: number, patch: Partial<Encounter>) =>
    onChange(encounters.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  // Probabilités réelles (espèces désactivées exclues), recalculées à chaque saisie.
  const active = (e: Encounter) => !!ctx.species(e.speciesId)?.enabled && e.weight > 0;
  const total = encounters.filter(active).reduce((sum, e) => sum + e.weight, 0);

  return (
    <div className="space-y-2">
      {errors.get('encounters') && (
        <p className="text-xs text-red-600">{errors.get('encounters')}</p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="py-1 font-normal">Espèce</th>
              <th className="py-1 font-normal">Poids</th>
              <th className="py-1 font-normal">Niv. min</th>
              <th className="py-1 font-normal">Niv. max</th>
              <th className="py-1 text-right font-normal">Apparition</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {encounters.map((e, i) => {
              const species = ctx.species(e.speciesId);
              const rowErrors = errorsUnder(errors as Map<string, string>, `encounters.${i}`);
              return (
                <tr key={i} className="border-t border-slate-100 align-top dark:border-slate-800">
                  <td className="py-1 pr-2">
                    <SpeciesSelect
                      ctx={ctx}
                      value={e.speciesId}
                      disabled={disabled}
                      onChange={(speciesId) => update(i, { speciesId, formId: null })}
                    />
                    <FormSelect
                      speciesId={e.speciesId}
                      value={e.formId}
                      disabled={disabled}
                      onChange={(formId) => update(i, { formId })}
                    />
                    {species && !species.enabled && (
                      <p className="text-xs text-amber-600">Espèce désactivée</p>
                    )}
                    {rowErrors.map((m) => (
                      <p key={m} className="text-xs text-red-600">
                        {m}
                      </p>
                    ))}
                  </td>
                  <td className="w-24 py-1 pr-2">
                    <NumberInput
                      value={e.weight}
                      min={0}
                      step={1}
                      disabled={disabled}
                      onChange={(weight) => update(i, { weight })}
                    />
                  </td>
                  <td className="w-24 py-1 pr-2">
                    <NumberInput
                      value={e.minLevel}
                      min={1}
                      max={100}
                      disabled={disabled}
                      onChange={(minLevel) => update(i, { minLevel })}
                    />
                  </td>
                  <td className="w-24 py-1 pr-2">
                    <NumberInput
                      value={e.maxLevel}
                      min={1}
                      max={100}
                      disabled={disabled}
                      onChange={(maxLevel) => update(i, { maxLevel })}
                    />
                  </td>
                  <td className="py-2 text-right font-mono">
                    {active(e) && total > 0 ? `${((e.weight / total) * 100).toFixed(1)} %` : '—'}
                  </td>
                  <td className="py-2 pl-2">
                    {!disabled && (
                      <button
                        type="button"
                        className="text-slate-400 hover:text-red-600"
                        onClick={() => onChange(encounters.filter((_, j) => j !== i))}
                      >
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!disabled && (
        <button
          type="button"
          className="btn-ghost py-1 text-xs"
          onClick={() =>
            onChange([...encounters, { speciesId: 19, weight: 10, minLevel: 2, maxLevel: 5 }])
          }
        >
          + Rencontre
        </button>
      )}
    </div>
  );
}

/** Simule N expéditions avec le contenu de la version affichée (brouillon compris). */
function ZoneSimulator({ zone, working }: { zone: Zone; working: WorkingVersion }) {
  const { ctx } = working;
  const durations = zone.durationsMinutes;
  const balls = working.content.items.filter((i) => ctx.itemEffect(i.id, 'ball'));
  const [duration, setDuration] = useState(durations[0] ?? 60);
  const [ballId, setBallId] = useState<string | null>(balls[0]?.id ?? null);
  const [berryId, setBerryId] = useState<string | null>(null);
  const [affinity, setAffinity] = useState(0);
  const [runs, setRuns] = useState(1000);
  const [result, setResult] = useState<ZoneSimulation | { error: string } | null>(null);
  const stored = ctx.zone(zone.id);

  function run() {
    try {
      setResult(
        simulateZone(ctx, {
          zoneId: zone.id,
          durationMinutes: duration,
          ballItemId: ballId,
          berryItemId: berryId,
          affinityCount: affinity,
          runs,
          seed: Math.floor(Math.random() * 2 ** 32),
        }),
      );
    } catch (err) {
      setResult({ error: (err as Error).message });
    }
  }

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="font-semibold">Simulateur</h2>
        <p className="text-xs text-slate-500">
          Simule des expéditions avec la version enregistrée de la zone (enregistrez d’abord vos
          modifications). Moyennes par expédition.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-5">
        <Field label="Durée">
          <select
            className="input"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          >
            {durations.map((d) => (
              <option key={d} value={d}>
                {d < 60 ? `${d} min` : `${d / 60} h`}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ball">
          <ItemSelect
            ctx={ctx}
            value={ballId}
            allowNone
            onChange={setBallId}
            filter={(id) => !!ctx.itemEffect(id, 'ball')}
          />
        </Field>
        <Field label="Baie">
          <ItemSelect
            ctx={ctx}
            value={berryId}
            allowNone
            onChange={setBerryId}
            filter={(id) => !!ctx.itemEffect(id, 'captureBoost')}
          />
        </Field>
        <Field label="Membres en affinité">
          <NumberInput value={affinity} min={0} max={6} onChange={setAffinity} />
        </Field>
        <Field label="Expéditions">
          <NumberInput value={runs} min={1} max={20000} step={100} onChange={setRuns} />
        </Field>
      </div>
      <button className="btn-primary" disabled={!stored || !(runs > 0)} onClick={run}>
        Lancer la simulation
      </button>
      {!stored && <p className="text-xs text-slate-500">Zone pas encore enregistrée.</p>}

      {result && 'error' in result && <p className="text-sm text-red-600">{result.error}</p>}
      {result && !('error' in result) && (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-sm">
              <strong>{result.encountersPerRun.toFixed(1)}</strong> rencontres,{' '}
              <strong>{result.capturesPerRun.toFixed(2)}</strong> captures,{' '}
              <strong>{Math.round(result.xpPerMemberPerRun)}</strong> XP par membre —{' '}
              {result.shiniesSeen} shiny vu(s) sur {result.runs} expéditions.
            </p>
            <table className="mt-2 w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="font-normal">Espèce</th>
                  <th className="text-right font-normal">Part</th>
                  <th className="text-right font-normal">Taux de capture</th>
                  <th className="text-right font-normal">Captures / exp.</th>
                </tr>
              </thead>
              <tbody>
                {result.species.map((s) => (
                  <tr key={s.speciesId} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="flex items-center gap-1 py-0.5">
                      <Sprite id={s.speciesId} size={28} />
                      {ctx.species(s.speciesId)?.nameFr}
                    </td>
                    <td className="text-right font-mono">
                      {(s.encounterShare * 100).toFixed(1)} %
                    </td>
                    <td className="text-right font-mono">{(s.captureRate * 100).toFixed(0)} %</td>
                    <td className="text-right font-mono">{s.capturesPerRun.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <p className="text-sm font-medium">Butin moyen</p>
            <table className="mt-2 w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="font-normal">Objet</th>
                  <th className="text-right font-normal">Quantité / exp.</th>
                  <th className="text-right font-normal">Expéditions avec</th>
                </tr>
              </thead>
              <tbody>
                {result.loot.map((l) => (
                  <tr key={l.itemId} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="flex items-center gap-1 py-0.5">
                      <ItemIcon ctx={ctx} id={l.itemId} size={20} />
                      {ctx.item(l.itemId)?.name ?? l.itemId}
                    </td>
                    <td className="text-right font-mono">{l.quantityPerRun.toFixed(2)}</td>
                    <td className="text-right font-mono">{(l.dropRate * 100).toFixed(0)} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result.loot.length === 0 && <p className="text-sm text-slate-500">Aucun butin.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
