import { useState } from 'react';
import { evolutionOverrideId, evolutionOverrideSchema } from '@poke/content';
import type { EvolutionMethod, EvolutionOverride, TimeOfDay } from '@poke/content';
import type { EvolutionDetail } from '@poke/data';
import { evolutionOptions, pokeApiEvolutions } from '@poke/game-core';
import type { EvolutionOption, GameContext } from '@poke/game-core';
import { EntityPage, VersionBanner } from '../../components/EntityPage';
import type { EntityFormProps } from '../../components/EntityPage';
import {
  Field,
  NullableNumberInput,
  Section,
  SelectInput,
  Toggle,
} from '../../components/forms/fields';
import { ItemIcon, ItemSelect, SpeciesSelect, Sprite } from '../../components/forms/pickers';
import { errorMessage, useWorkingVersion } from '../../lib/content';

const VIEWS = [
  { id: 'overview', label: 'Toutes les évolutions' },
  { id: 'overrides', label: 'Surcharges' },
] as const;
type View = (typeof VIEWS)[number]['id'];

const TIME_LABELS: Record<TimeOfDay, string> = { day: 'de jour', night: 'de nuit' };

const speciesLabel = (ctx: GameContext, id: number, formId?: number | null) =>
  `#${id} ${ctx.species(id, formId)?.nameFr ?? '?'}`;

function methodText(ctx: GameContext, m: EvolutionMethod): string {
  return (
    [
      m.minLevel !== null && `niveau ${m.minLevel}`,
      m.itemId !== null && (ctx.item(m.itemId)?.name ?? m.itemId),
      m.minHappiness !== null && `bonheur ≥ ${m.minHappiness}`,
      m.timeOfDay !== null && TIME_LABELS[m.timeOfDay],
    ]
      .filter(Boolean)
      .join(' + ') || '—'
  );
}

/** Détail PokéAPI non transposable, en clair (pour savoir quoi surcharger). */
function detailText(d: EvolutionDetail): string {
  const { trigger, ...rest } = d;
  const params = Object.entries(rest)
    .map(([k, v]) => `${k} ${String(v)}`)
    .join(', ');
  return params ? `${trigger} (${params})` : trigger;
}

/** Objets des méthodes absents du catalogue : la méthode ne peut pas servir. */
const missingItems = (ctx: GameContext, methods: readonly EvolutionMethod[]) => [
  ...new Set(methods.flatMap((m) => (m.itemId && !ctx.item(m.itemId) ? [m.itemId] : []))),
];

export function EvolutionsPage() {
  const [view, setView] = useState<View>('overview');
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
      {view === 'overview' && <OverviewView />}
      {view === 'overrides' && <OverridesView />}
    </div>
  );
}

// --- Vue d'ensemble -------------------------------------------------------------------------

function OverviewView() {
  const working = useWorkingVersion();
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [search, setSearch] = useState('');
  if (working.isPending) return <p className="text-slate-500">Chargement…</p>;
  if (!working.data) return <p className="text-red-600">{errorMessage(working.error)}</p>;
  const w = working.data;
  const { ctx } = w;
  const speciesIds = [...new Set(ctx.regions.flatMap((r) => r.speciesIds))].sort((a, b) => a - b);
  const needle = search.trim().toLowerCase();
  const rows = speciesIds
    .flatMap((from) => evolutionOptions(ctx, from).map((option) => ({ from, option })))
    .map((r) => ({ ...r, missing: missingItems(ctx, r.option.methods) }))
    .filter(
      ({ from, option, missing }) =>
        (!onlyProblems || option.methods.length === 0 || missing.length > 0) &&
        (!needle ||
          `${speciesLabel(ctx, from)} ${speciesLabel(ctx, option.toSpeciesId, option.toFormId)}`
            .toLowerCase()
            .includes(needle)),
    );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Évolutions</h1>
        <p className="mt-1 text-slate-500">
          Conditions effectives des espèces des régions : PokéAPI adapté au jeu idle (l’échange
          devient l’objet réglé dans l’Équilibrage), ou surcharge. Les conditions non transposables
          (lieu, attaque, coups critiques…) sont ignorées : surchargez ces évolutions.
        </p>
      </div>
      <VersionBanner working={w} />
      <div className="flex flex-wrap items-center gap-4">
        <input
          className="input max-w-64"
          placeholder="Filtrer par espèce…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Toggle
          checked={onlyProblems}
          onChange={setOnlyProblems}
          label="Seulement les évolutions impossibles ou incomplètes"
        />
        <span className="text-sm text-slate-500">{rows.length} évolution(s)</span>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="p-2 font-normal">Départ</th>
              <th className="p-2 font-normal">Arrivée</th>
              <th className="p-2 font-normal">Méthodes (une seule suffit)</th>
              <th className="p-2 font-normal">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ from, option, missing }) => (
              <OverviewRow
                key={`${from}-${option.toSpeciesId}-${option.toFormId ?? ''}`}
                ctx={ctx}
                from={from}
                option={option}
                missing={missing}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OverviewRow({
  ctx,
  from,
  option,
  missing,
}: {
  ctx: GameContext;
  from: number;
  option: EvolutionOption;
  missing: string[];
}) {
  return (
    <tr className="border-t border-slate-100 align-top dark:border-slate-800">
      <td className="p-2">
        <span className="flex items-center gap-1">
          <Sprite id={from} size={32} />
          {speciesLabel(ctx, from)}
        </span>
      </td>
      <td className="p-2">
        <span className="flex items-center gap-1">
          <Sprite id={option.toSpeciesId} formId={option.toFormId} size={32} />
          {speciesLabel(ctx, option.toSpeciesId, option.toFormId)}
        </span>
      </td>
      <td className="space-y-0.5 p-2">
        {option.methods.length === 0 && (
          <p className="text-red-600">⛔ Aucune méthode utilisable : évolution impossible</p>
        )}
        {option.methods.map((m, i) => (
          <p key={i} className="flex items-center gap-1">
            {m.itemId && <ItemIcon ctx={ctx} id={m.itemId} size={20} />}
            {methodText(ctx, m)}
          </p>
        ))}
        {missing.length > 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            ⚠️ Objet(s) absent(s) du catalogue : {missing.join(', ')}
          </p>
        )}
        {option.unsupported.length > 0 && (
          <p className="text-xs text-slate-500">
            Ignoré : {option.unsupported.map(detailText).join(' ; ')}
          </p>
        )}
      </td>
      <td className="p-2">
        {option.source === 'override' ? (
          <span className="rounded bg-brand-500/10 px-1.5 py-0.5 text-xs text-brand-600">
            Surcharge
          </span>
        ) : (
          <span className="text-xs text-slate-500">PokéAPI</span>
        )}
      </td>
    </tr>
  );
}

// --- Surcharges -----------------------------------------------------------------------------

const emptyMethod = (): EvolutionMethod => ({
  minLevel: 16,
  itemId: null,
  minHappiness: null,
  timeOfDay: null,
});

function OverridesView() {
  return (
    <EntityPage<EvolutionOverride>
      title="Évolutions : surcharges"
      description="Remplace les conditions PokéAPI d’une évolution, en ajoute une (cas exotiques) ou la désactive."
      collection="evolutions"
      entityKind="evolutionOverride"
      schema={evolutionOverrideSchema}
      list={(w) => w.content.evolutionOverrides}
      getKey={(o) => o.id}
      searchText={(o, w) =>
        `${o.id} ${speciesLabel(w.ctx, o.fromSpeciesId)} ${speciesLabel(w.ctx, o.toSpeciesId)}`
      }
      renderListItem={(o, w) => (
        <span className="flex items-center gap-1">
          <Sprite id={o.fromSpeciesId} size={28} />→
          <Sprite id={o.toSpeciesId} size={28} />
          <span className="min-w-0">
            <span className={`block truncate font-medium ${o.enabled ? '' : 'line-through'}`}>
              {w.ctx.species(o.fromSpeciesId)?.nameFr} → {w.ctx.species(o.toSpeciesId)?.nameFr}
            </span>
            <span className="block truncate text-xs text-slate-500">
              {o.enabled ? o.methods.map((m) => methodText(w.ctx, m)).join(' ou ') : 'Désactivée'}
            </span>
          </span>
        </span>
      )}
      create={() => ({
        id: evolutionOverrideId(1, 2),
        fromSpeciesId: 1,
        toSpeciesId: 2,
        enabled: true,
        methods: [emptyMethod()],
      })}
      renderForm={(p) => <OverrideForm {...p} />}
      newLabel="Nouvelle surcharge"
    />
  );
}

function OverrideForm({
  value: o,
  onChange,
  errors,
  isNew,
  editable,
  working,
}: EntityFormProps<EvolutionOverride>) {
  const { ctx } = working;
  const disabled = !editable;
  const setPair = (fromSpeciesId: number, toSpeciesId: number) =>
    onChange({
      ...o,
      fromSpeciesId,
      toSpeciesId,
      id: evolutionOverrideId(fromSpeciesId, toSpeciesId),
    });
  const setMethods = (methods: EvolutionMethod[]) => onChange({ ...o, methods });
  const updateMethod = (i: number, patch: Partial<EvolutionMethod>) =>
    setMethods(o.methods.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const pokeApi = pokeApiEvolutions(ctx, o.fromSpeciesId).find(
    (e) => e.toSpeciesId === o.toSpeciesId,
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Espèce de départ"
          hint={isNew ? undefined : 'Non modifiable : dupliquez via une nouvelle surcharge.'}
          error={errors.get('fromSpeciesId') ?? errors.get('id')}
        >
          <SpeciesSelect
            ctx={ctx}
            value={o.fromSpeciesId}
            onChange={(id) => {
              // Propose la première évolution PokéAPI de la nouvelle espèce.
              const next = pokeApiEvolutions(ctx, id)[0]?.toSpeciesId ?? o.toSpeciesId;
              setPair(id, next);
            }}
            disabled={disabled || !isNew}
          />
        </Field>
        <Field label="Espèce d’arrivée" error={errors.get('toSpeciesId')}>
          <SpeciesSelect
            ctx={ctx}
            value={o.toSpeciesId}
            onChange={(id) => setPair(o.fromSpeciesId, id)}
            disabled={disabled || !isNew}
          />
        </Field>
      </div>
      <Toggle
        checked={o.enabled}
        onChange={(enabled) => onChange({ ...o, enabled })}
        label="Évolution active (décochée : cette évolution n’existe plus dans le jeu)"
        disabled={disabled}
      />

      <Section title="Conditions PokéAPI (référence)">
        {!pokeApi ? (
          <p className="text-sm text-slate-500">
            Évolution absente de PokéAPI : la surcharge l’ajoute au jeu.
          </p>
        ) : (
          <div className="space-y-1 text-sm">
            {pokeApi.methods.map((m, i) => (
              <p key={i}>• {methodText(ctx, m)}</p>
            ))}
            {pokeApi.unsupported.map((d, i) => (
              <p key={`u${i}`} className="text-slate-500">
                • Ignoré : {detailText(d)}
              </p>
            ))}
            {!disabled && pokeApi.methods.length > 0 && (
              <button
                type="button"
                className="btn-ghost mt-2 py-1 text-xs"
                onClick={() => setMethods(structuredClone(pokeApi.methods))}
              >
                Reprendre ces méthodes
              </button>
            )}
          </div>
        )}
      </Section>

      {o.enabled && (
        <Section title="Méthodes (une seule suffit ; toutes ses conditions doivent être remplies)">
          {errors.get('methods') && <p className="text-xs text-red-600">{errors.get('methods')}</p>}
          <div className="space-y-3">
            {o.methods.map((m, i) => (
              <div
                key={i}
                className="grid items-end gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_2fr_1fr_1fr_auto] dark:border-slate-700"
              >
                <Field label="Niveau min." error={errors.get(`methods.${i}.minLevel`)}>
                  <NullableNumberInput
                    value={m.minLevel}
                    min={1}
                    max={100}
                    placeholder="—"
                    onChange={(minLevel) => updateMethod(i, { minLevel })}
                    disabled={disabled}
                  />
                </Field>
                <Field label="Objet consommé" error={errors.get(`methods.${i}.itemId`)}>
                  <ItemSelect
                    ctx={ctx}
                    value={m.itemId}
                    allowNone
                    onChange={(itemId) => updateMethod(i, { itemId })}
                    disabled={disabled}
                  />
                </Field>
                <Field label="Bonheur min." error={errors.get(`methods.${i}.minHappiness`)}>
                  <NullableNumberInput
                    value={m.minHappiness}
                    min={0}
                    max={255}
                    placeholder="—"
                    onChange={(minHappiness) => updateMethod(i, { minHappiness })}
                    disabled={disabled}
                  />
                </Field>
                <Field label="Moment">
                  <SelectInput
                    value={m.timeOfDay ?? 'any'}
                    onChange={(v) => updateMethod(i, { timeOfDay: v === 'any' ? null : v })}
                    disabled={disabled}
                    options={[
                      { value: 'any', label: 'Peu importe' },
                      { value: 'day', label: 'De jour' },
                      { value: 'night', label: 'De nuit' },
                    ]}
                  />
                </Field>
                {!disabled && (
                  <button
                    type="button"
                    className="mb-2 text-slate-400 hover:text-red-600"
                    onClick={() => setMethods(o.methods.filter((_, j) => j !== i))}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {!disabled && o.methods.length < 10 && (
              <button
                type="button"
                className="btn-ghost py-1 text-xs"
                onClick={() => setMethods([...o.methods, emptyMethod()])}
              >
                + Méthode
              </button>
            )}
          </div>
          <p className="text-xs text-slate-500">
            Jour et nuit suivent l’heure locale du joueur (bornes dans l’Équilibrage). Le bonheur
            monte avec les expéditions et les victoires.
          </p>
        </Section>
      )}
    </div>
  );
}
