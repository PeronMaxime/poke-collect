import { useState } from 'react';
import { collectionSchema, dexMilestoneSchema } from '@poke/content';
import type { Collection, DexMilestone } from '@poke/content';
import {
  NO_CLAIMS,
  dexSpeciesIds,
  playerBonuses,
  playerSlots,
  sortedCollections,
  sortedMilestones,
} from '@poke/game-core';
import { EntityPage, VersionBanner } from '../../components/EntityPage';
import type { EntityFormProps } from '../../components/EntityPage';
import { Field, NumberInput, Section, TextInput, Toggle } from '../../components/forms/fields';
import { Sprite, SpeciesSetEditor } from '../../components/forms/pickers';
import {
  BONUS_LABELS,
  RewardEditor,
  emptyReward,
  rewardSummary,
} from '../../components/forms/RewardEditor';
import { errorMessage, useWorkingVersion } from '../../lib/content';
import type { WorkingVersion } from '../../lib/content';

const VIEWS = [
  { id: 'milestones', label: 'Paliers du Pokédex' },
  { id: 'collections', label: 'Collections' },
  { id: 'summary', label: 'Récapitulatif' },
] as const;
type View = (typeof VIEWS)[number]['id'];

export function ProgressionPage() {
  const [view, setView] = useState<View>('milestones');
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
      {view === 'milestones' && <MilestonesView />}
      {view === 'collections' && <CollectionsView />}
      {view === 'summary' && <SummaryView />}
    </div>
  );
}

const dexName = (w: WorkingVersion, regionId: string | null, shiny = false) =>
  `${regionId ? (w.ctx.region(regionId)?.name ?? regionId) : 'National'}${shiny ? ' ★ shiny' : ''}`;

// --- Paliers --------------------------------------------------------------------------------

function MilestonesView() {
  return (
    <EntityPage<DexMilestone>
      title="Progression : paliers du Pokédex"
      description="Seuil (% du Pokédex d’une région ou national, normal ou shiny) et récompenses : objets, argent, emplacements, bonus permanents."
      collection="dex-milestones"
      entityKind="dexMilestone"
      schema={dexMilestoneSchema}
      list={(w) => sortedMilestones(w.ctx)}
      getKey={(m) => m.id}
      searchText={(m, w) => `${m.id} ${m.name} ${dexName(w, m.regionId, m.shiny)}`}
      renderListItem={(m, w) => (
        <>
          <span className="block truncate font-medium">{m.name}</span>
          <span className="block truncate text-xs text-slate-500">
            {m.percent} % · {dexName(w, m.regionId, m.shiny)} · {rewardSummary(m.rewards)}
          </span>
        </>
      )}
      create={(w) => ({
        id: '',
        order: w.content.dexMilestones.length,
        name: '',
        regionId: w.ctx.regions[0]?.id ?? null,
        shiny: false,
        percent: 10,
        rewards: emptyReward(),
      })}
      duplicate={(m) => ({ ...structuredClone(m), id: `${m.id}-copie`, name: `${m.name} (copie)` })}
      renderForm={(p) => <MilestoneForm {...p} />}
      newLabel="Nouveau palier"
    />
  );
}

function MilestoneForm({
  value: m,
  onChange,
  errors,
  isNew,
  editable,
  working,
}: EntityFormProps<DexMilestone>) {
  const set = <K extends keyof DexMilestone>(key: K, v: DexMilestone[K]) =>
    onChange({ ...m, [key]: v });
  const { ctx } = working;
  const disabled = !editable;
  const total = dexSpeciesIds(ctx, m.regionId).length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Identifiant"
          hint="Minuscules et tirets, non modifiable ensuite."
          error={errors.get('id')}
        >
          <TextInput value={m.id} onChange={(v) => set('id', v)} disabled={disabled || !isNew} />
        </Field>
        <Field label="Nom" error={errors.get('name')}>
          <TextInput value={m.name} onChange={(v) => set('name', v)} disabled={disabled} />
        </Field>
        <Field
          label="Pokédex"
          hint="National : espèces de toutes les régions."
          error={errors.get('regionId')}
        >
          <select
            className="input"
            value={m.regionId ?? ''}
            disabled={disabled}
            onChange={(e) => set('regionId', e.target.value || null)}
          >
            {ctx.regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
            {m.regionId && !ctx.region(m.regionId) && (
              <option value={m.regionId}>{m.regionId} (inconnue)</option>
            )}
            <option value="">Pokédex national</option>
          </select>
          <div className="mt-2">
            <Toggle
              checked={m.shiny}
              onChange={(v) => set('shiny', v)}
              disabled={disabled}
              label="Pokédex shiny (ne compte que les captures shiny)"
            />
          </div>
        </Field>
        <Field
          label="Seuil"
          hint={
            Number.isFinite(m.percent)
              ? `soit ${Math.ceil((m.percent / 100) * total)} espèce(s) sur ${total}`
              : undefined
          }
          error={errors.get('percent')}
        >
          <NumberInput
            value={m.percent}
            min={0}
            max={100}
            step={1}
            unit="%"
            onChange={(v) => set('percent', v)}
            disabled={disabled}
          />
        </Field>
        <Field label="Ordre" error={errors.get('order')}>
          <NumberInput
            value={m.order}
            min={0}
            onChange={(v) => set('order', v)}
            disabled={disabled}
          />
        </Field>
      </div>
      <Section title="Récompenses">
        <RewardEditor
          ctx={ctx}
          value={m.rewards}
          onChange={(v) => set('rewards', v)}
          errors={errors}
          prefix="rewards"
          disabled={disabled}
        />
      </Section>
    </div>
  );
}

// --- Collections ------------------------------------------------------------------------------

function CollectionsView() {
  return (
    <EntityPage<Collection>
      title="Progression : collections thématiques"
      description="Liste d’espèces à capturer (starters, lignées, types…) et récompense, souvent un bonus permanent."
      collection="collections"
      entityKind="collection"
      schema={collectionSchema}
      list={(w) => sortedCollections(w.ctx)}
      getKey={(c) => c.id}
      searchText={(c) => `${c.id} ${c.name} ${c.description}`}
      renderListItem={(c) => (
        <span className="flex items-center gap-2">
          {c.speciesIds[0] && <Sprite id={c.speciesIds[0]} size={28} />}
          <span className="min-w-0">
            <span className="block truncate font-medium">{c.name}</span>
            <span className="block truncate text-xs text-slate-500">
              {c.speciesIds.length} espèce(s) · {rewardSummary(c.rewards)}
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
      </div>
      <Section title="Espèces à capturer">
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

// --- Récapitulatif ----------------------------------------------------------------------------

/** Emplacements et bonus cumulés quand le joueur réclame les récompenses dans l'ordre. */
function SummaryView() {
  const working = useWorkingVersion();
  if (working.isPending) return <p className="text-slate-500">Chargement…</p>;
  if (!working.data) return <p className="text-red-600">{errorMessage(working.error)}</p>;
  const w = working.data;
  const { ctx } = w;
  const steps = [
    ...sortedMilestones(ctx).map((m) => ({
      kind: 'milestone' as const,
      id: m.id,
      label: `${m.name} (${m.percent} % ${dexName(w, m.regionId, m.shiny)})`,
    })),
    ...sortedCollections(ctx).map((c) => ({
      kind: 'collection' as const,
      id: c.id,
      label: `Collection « ${c.name} »`,
    })),
    ...ctx.quests.map((q) => ({ kind: 'quest' as const, id: q.id, label: `Quête « ${q.name} »` })),
  ];
  const ids = {
    milestone: new Set<string>(),
    collection: new Set<string>(),
    quest: new Set<string>(),
  };
  const start = playerSlots(ctx, NO_CLAIMS);
  const rows = steps.map((step) => {
    ids[step.kind].add(step.id);
    const claimed = {
      milestoneIds: ids.milestone,
      collectionIds: ids.collection,
      questIds: ids.quest,
    };
    return { ...step, slots: playerSlots(ctx, claimed), bonuses: playerBonuses(ctx, claimed) };
  });
  const { balance } = ctx;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Progression : récapitulatif</h1>
        <p className="mt-1 text-slate-500">
          Emplacements et bonus cumulés si le joueur réclame chaque récompense, dans l’ordre
          (paliers, collections, puis quêtes). Les maxima viennent de l’Équilibrage.
        </p>
      </div>
      <VersionBanner working={w} />
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="p-2 font-normal">Récompense réclamée</th>
              <th className="p-2 font-normal">Expéditions (max {balance.expeditions.maxSlots})</th>
              <th className="p-2 font-normal">Combats (max {balance.battles.maxSlots})</th>
              <th className="p-2 font-normal">Pensions (max {balance.daycare.maxSlots})</th>
              <th className="p-2 font-normal">Bonus</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-slate-100 dark:border-slate-800">
              <td className="p-2 text-slate-500">Départ</td>
              <td className="p-2">{start.expeditions}</td>
              <td className="p-2">{start.battles}</td>
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
                <td className="p-2">{r.slots.battles}</td>
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
