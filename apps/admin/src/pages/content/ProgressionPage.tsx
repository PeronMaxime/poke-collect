import { useState } from 'react';
import { collectionSchema } from '@poke/content';
import type { Collection } from '@poke/content';
import { speciesForms } from '@poke/data';
import { NO_CLAIMS, playerBonuses, playerSlots, sortedCollections } from '@poke/game-core';
import { EntityPage, VersionBanner } from '../../components/EntityPage';
import type { EntityFormProps } from '../../components/EntityPage';
import { Field, NumberInput, Section, TextInput } from '../../components/forms/fields';
import { Sprite, SpeciesSetEditor } from '../../components/forms/pickers';
import {
  BONUS_LABELS,
  RewardEditor,
  emptyReward,
  rewardSummary,
} from '../../components/forms/RewardEditor';
import { errorMessage, useWorkingVersion } from '../../lib/content';
import { ExpeditionCompletionsView } from './ExpeditionCompletionsView';
import { FacilitiesView } from './FacilitiesView';

const VIEWS = [
  { id: 'collections', label: 'Collections' },
  { id: 'completions', label: 'Complétion d’expédition' },
  { id: 'facilities', label: 'Bâtiments' },
  { id: 'summary', label: 'Récapitulatif' },
] as const;
type View = (typeof VIEWS)[number]['id'];

export function ProgressionPage() {
  const [view, setView] = useState<View>('collections');
  return (
    <div className="space-y-4">
      <nav className="flex gap-1">
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
            {v.label}
          </button>
        ))}
      </nav>
      {view === 'collections' && <CollectionsView />}
      {view === 'completions' && <ExpeditionCompletionsView />}
      {view === 'facilities' && <FacilitiesView />}
      {view === 'summary' && <SummaryView />}
    </div>
  );
}

// --- Collections ------------------------------------------------------------------------------

function CollectionsView() {
  return (
    <EntityPage<Collection>
      title="Progression : collections thématiques"
      description="Espèces et formes à capturer (Zarbi, Prismillon…) et récompense, souvent un bonus permanent. Le joueur ne voit que les collections des régions qu’il a débloquées."
      collection="collections"
      entityKind="collection"
      schema={collectionSchema}
      list={(w) => sortedCollections(w.ctx)}
      getKey={(c) => c.id}
      searchText={(c, w) =>
        `${c.id} ${c.name} ${c.description} ${c.regionId ? (w.ctx.region(c.regionId)?.name ?? '') : ''}`
      }
      renderListItem={(c, w) => (
        <span className="flex items-center gap-2">
          {c.speciesIds[0] && <Sprite id={c.speciesIds[0]} size={28} />}
          <span className="min-w-0">
            <span className="block truncate font-medium">{c.name}</span>
            <span className="block truncate text-xs text-slate-500">
              {c.regionId ? (w.ctx.region(c.regionId)?.name ?? c.regionId) : 'Toutes régions'} ·{' '}
              {c.speciesIds.length} espèce(s) · {c.formIds.length} forme(s) ·{' '}
              {rewardSummary(c.rewards)}
            </span>
          </span>
        </span>
      )}
      create={(w) => ({
        id: '',
        order: w.content.collections.length,
        name: '',
        description: '',
        speciesIds: [],
        rewards: emptyReward(),
        regionId: w.ctx.regions[0]?.id ?? null,
        formIds: [],
      })}
      duplicate={(c) => ({ ...structuredClone(c), id: `${c.id}-copie`, name: `${c.name} (copie)` })}
      renderForm={(p) => <CollectionForm {...p} />}
      newLabel="Nouvelle collection"
    />
  );
}

function CollectionForm({
  value: c,
  onChange,
  errors,
  isNew,
  editable,
  working,
}: EntityFormProps<Collection>) {
  const set = <K extends keyof Collection>(key: K, v: Collection[K]) =>
    onChange({ ...c, [key]: v });
  const { ctx } = working;
  const disabled = !editable;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Identifiant"
          hint="Minuscules et tirets, non modifiable ensuite."
          error={errors.get('id')}
        >
          <TextInput value={c.id} onChange={(v) => set('id', v)} disabled={disabled || !isNew} />
        </Field>
        <Field label="Nom" error={errors.get('name')}>
          <TextInput value={c.name} onChange={(v) => set('name', v)} disabled={disabled} />
        </Field>
        <Field label="Description" error={errors.get('description')} className="sm:col-span-2">
          <TextInput
            value={c.description}
            onChange={(v) => set('description', v)}
            disabled={disabled}
          />
        </Field>
        <Field label="Ordre" error={errors.get('order')}>
          <NumberInput
            value={c.order}
            min={0}
            onChange={(v) => set('order', v)}
            disabled={disabled}
          />
        </Field>
        <Field
          label="Région"
          hint="Visible par le joueur une fois la région débloquée."
          error={errors.get('regionId')}
        >
          <select
            className="input"
            value={c.regionId ?? ''}
            disabled={disabled}
            onChange={(e) => set('regionId', e.target.value || null)}
          >
            {ctx.regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
            {c.regionId && !ctx.region(c.regionId) && (
              <option value={c.regionId}>{c.regionId} (inconnue)</option>
            )}
            <option value="">Toutes régions (toujours visible)</option>
          </select>
        </Field>
      </div>
      <Section title="Espèces à capturer (forme par défaut)">
        <SpeciesSetEditor
          ctx={ctx}
          value={c.speciesIds}
          onChange={(v) => set('speciesIds', v)}
          disabled={disabled}
        />
        {errors.get('speciesIds') && (
          <p className="text-xs text-red-600">{errors.get('speciesIds')}</p>
        )}
      </Section>
      <Section title="Formes à capturer">
        <FormSetEditor
          speciesIds={c.speciesIds}
          value={c.formIds}
          onChange={(v) => set('formIds', v)}
          disabled={disabled}
        />
        {errors.get('formIds') && <p className="text-xs text-red-600">{errors.get('formIds')}</p>}
      </Section>
      <Section title="Récompenses">
        <RewardEditor
          ctx={ctx}
          value={c.rewards}
          onChange={(v) => set('rewards', v)}
          errors={errors}
          prefix="rewards"
          disabled={disabled}
        />
      </Section>
    </div>
  );
}

/** Formes des espèces de la collection, à cocher (une forme d'une espèce retirée reste listée). */
function FormSetEditor({
  speciesIds,
  value,
  onChange,
  disabled,
}: {
  speciesIds: number[];
  value: number[];
  onChange: (ids: number[]) => void;
  disabled: boolean;
}) {
  const selected = new Set(value);
  const candidates = [...new Set(speciesIds)].flatMap((id) => speciesForms(id));
  const orphans = value.filter((id) => !candidates.some((f) => f.id === id));
  const set = (next: Set<number>) => onChange([...next].sort((a, b) => a - b));

  if (candidates.length === 0 && orphans.length === 0) {
    return <p className="text-sm text-slate-500">Les espèces choisies n’ont pas d’autre forme.</p>;
  }
  return (
    <div>
      {!disabled && (
        <div className="mb-2 flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            className="btn-ghost px-2 py-1"
            onClick={() => set(new Set([...value, ...candidates.map((f) => f.id)]))}
          >
            Tout
          </button>
          <button type="button" className="btn-ghost px-2 py-1" onClick={() => set(new Set())}>
            Aucune
          </button>
          <span className="self-center text-slate-500">{value.length} sélectionnée(s)</span>
        </div>
      )}
      <div className="grid max-h-72 grid-cols-6 gap-1 overflow-y-auto sm:grid-cols-10 lg:grid-cols-14">
        {candidates.map((f) => {
          const on = selected.has(f.id);
          return (
            <button
              key={f.id}
              type="button"
              disabled={disabled}
              title={f.nameFr}
              onClick={() => {
                const next = new Set(selected);
                if (on) next.delete(f.id);
                else next.add(f.id);
                set(next);
              }}
              className={`rounded-lg border p-0.5 transition ${
                on
                  ? 'border-brand-500 bg-brand-500/10'
                  : 'border-transparent opacity-40 grayscale hover:opacity-80'
              }`}
            >
              <Sprite id={f.speciesId} formId={f.id} size={40} />
            </button>
          );
        })}
      </div>
      {orphans.length > 0 && (
        <p className="mt-2 text-xs text-amber-600">
          Formes d’espèces absentes de la liste : {orphans.join(', ')}
        </p>
      )}
    </div>
  );
}

// --- Récapitulatif ----------------------------------------------------------------------------

/** Emplacements et bonus cumulés quand le joueur réclame les récompenses dans l'ordre. */
function SummaryView() {
  const working = useWorkingVersion();
  if (working.isPending) return <p className="text-slate-500">Chargement…</p>;
  if (!working.data) return <p className="text-red-600">{errorMessage(working.error)}</p>;
  const w = working.data;
  const { ctx } = w;
  const steps = [
    ...sortedCollections(ctx).map((c) => ({
      kind: 'collection' as const,
      id: c.id,
      label: `Collection « ${c.name} »`,
    })),
    ...ctx.quests.map((q) => ({ kind: 'quest' as const, id: q.id, label: `Quête « ${q.name} »` })),
  ];
  const ids = {
    collection: new Set<string>(),
    quest: new Set<string>(),
  };
  const { balance } = ctx;
  const slotsOf = (claimed: typeof NO_CLAIMS) => {
    const slots = playerSlots(ctx, claimed);
    return { ...slots, expeditions: Math.min(balance.expeditions.maxSlots, slots.expeditions) };
  };
  const start = slotsOf(NO_CLAIMS);
  const rows = steps.map((step) => {
    ids[step.kind].add(step.id);
    const claimed = {
      collectionIds: ids.collection,
      questIds: ids.quest,
    };
    return { ...step, slots: slotsOf(claimed), bonuses: playerBonuses(ctx, claimed) };
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Progression : récapitulatif</h1>
        <p className="mt-1 text-slate-500">
          Emplacements et bonus cumulés si le joueur réclame chaque récompense, dans l’ordre
          (collections, puis quêtes), sans les paliers des Bâtiments. Les maxima viennent de
          l’Équilibrage.
        </p>
      </div>
      <VersionBanner working={w} />
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="p-2 font-normal">Récompense réclamée</th>
              <th className="p-2 font-normal">Expéditions (max {balance.expeditions.maxSlots})</th>
              <th className="p-2 font-normal">Pensions</th>
              <th className="p-2 font-normal">Bonus</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-slate-100 dark:border-slate-800">
              <td className="p-2 text-slate-500">Départ</td>
              <td className="p-2">{start.expeditions}</td>
              <td className="p-2">{start.daycare}</td>
              <td className="p-2" />
            </tr>
            {rows.map((r) => (
              <tr
                key={`${r.kind}:${r.id}`}
                className="border-t border-slate-100 dark:border-slate-800"
              >
                <td className="p-2">{r.label}</td>
                <td className="p-2">{r.slots.expeditions}</td>
                <td className="p-2">{r.slots.daycare}</td>
                <td className="p-2 text-xs text-slate-500">
                  {(Object.keys(BONUS_LABELS) as (keyof typeof BONUS_LABELS)[])
                    .filter((t) => r.bonuses[t] > 1)
                    .map((t) => `${BONUS_LABELS[t]} +${Math.round((r.bonuses[t] - 1) * 100)} %`)
                    .join(' · ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
