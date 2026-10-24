import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ABILITY_PROPOSALS, abilitySchema } from '@poke/content';
import type { GameAbility } from '@poke/content';
import { abilities, forms as allForms, species as allSpecies } from '@poke/data';
import type { Ability, SpeciesAbility } from '@poke/data';
import { abilityEffectText } from '@poke/game-core';
import { searchKey } from '@poke/shared';
import { IssueList, VersionBanner } from '../../components/EntityPage';
import { Field, TextInput, validate } from '../../components/forms/fields';
import { Sprite } from '../../components/forms/pickers';
import type { GameContext } from '@poke/game-core';
import type { WorkingVersion } from '../../lib/content';
import { api } from '../../lib/api';
import {
  errorMessage,
  useDeleteEntity,
  useRefreshContent,
  useSaveEntity,
  useWorkingVersion,
} from '../../lib/content';
import { AbilityEffectEditor } from './AbilityEffectEditor';
import { AbilitySummaryDialog } from './AbilitySummaryDialog';

interface Holder {
  speciesId: number;
  formId: number | null;
  nameFr: string;
  isHidden: boolean;
}

const KIND_FILTERS = [
  { id: 'all', label: 'Tous' },
  { id: 'regular', label: 'Normaux' },
  { id: 'hidden', label: 'Cachés' },
] as const;
type KindFilter = (typeof KIND_FILTERS)[number]['id'];

const EFFECT_FILTERS = [
  { id: 'all', label: 'Tous' },
  { id: 'with', label: 'Avec effet' },
  { id: 'without', label: 'Sans effet' },
] as const;
type EffectFilter = (typeof EFFECT_FILTERS)[number]['id'];

/** Pokémon (espèces et formes) qui possèdent chaque talent, par nom PokéAPI. */
function holdersByAbility(): Map<string, Holder[]> {
  const result = new Map<string, Holder[]>();
  const add = (list: SpeciesAbility[], holder: Omit<Holder, 'isHidden'>) => {
    for (const a of list) {
      let holders = result.get(a.name);
      if (!holders) result.set(a.name, (holders = []));
      // Une même forme peut lister un talent deux fois (normal et caché) : on garde le normal.
      const existing = holders.find(
        (h) => h.speciesId === holder.speciesId && h.formId === holder.formId,
      );
      if (existing) existing.isHidden &&= a.isHidden;
      else holders.push({ ...holder, isHidden: a.isHidden });
    }
  };
  for (const s of allSpecies) add(s.abilities, { speciesId: s.id, formId: null, nameFr: s.nameFr });
  for (const f of allForms) {
    const base = allSpecies.find((s) => s.id === f.speciesId);
    // Une forme qui reprend les talents de l'espèce n'apporte rien au tableau.
    const sameAsBase =
      base &&
      base.abilities.length === f.abilities.length &&
      base.abilities.every(
        (a, i) => a.name === f.abilities[i]!.name && a.isHidden === f.abilities[i]!.isHidden,
      );
    if (!sameAsBase) add(f.abilities, { speciesId: f.speciesId, formId: f.id, nameFr: f.nameFr });
  }
  for (const holders of result.values()) {
    holders.sort((a, b) => a.speciesId - b.speciesId || (a.formId ?? 0) - (b.formId ?? 0));
  }
  return result;
}

const HOLDERS = holdersByAbility();

/** Les descriptions PokéAPI gardent les retours à la ligne du jeu (`\n` littéral). */
const cleanDescription = (text: string | null) => text?.replace(/\\n|\n/g, ' ') ?? null;

const hasEffect = (entry: GameAbility | undefined) => !!entry && entry.effects.length > 0;

/**
 * Talents possédés par au moins un Pokémon de la sélection : 'game' = toutes les régions du jeu,
 * 'all' = tous les Pokémon, sinon l'id d'une région.
 */
function abilityRows(ctx: GameContext, regionFilter: string) {
  const region = ctx.region(regionFilter);
  const inScope =
    regionFilter === 'all'
      ? null
      : new Set(region ? region.speciesIds : ctx.regions.flatMap((r) => r.speciesIds));
  return abilities
    .map((ability) => ({
      ability,
      holders: (HOLDERS.get(ability.name) ?? []).filter(
        (h) => !inScope || inScope.has(h.speciesId),
      ),
      description: cleanDescription(ability.descriptionFr),
      entry: ctx.ability(ability.name),
    }))
    .filter(({ holders }) => holders.length > 0);
}

export function AbilitiesPage() {
  const working = useWorkingVersion();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [effectFilter, setEffectFilter] = useState<EffectFilter>('all');
  // 'game' = toutes les régions du jeu ; 'all' = tous les Pokémon ; sinon l'id d'une région.
  const [regionFilter, setRegionFilter] = useState('game');
  const [selected, setSelected] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  if (working.isPending) return <p className="text-slate-500">Chargement…</p>;
  if (!working.data) return <p className="text-red-600">{errorMessage(working.error)}</p>;
  const w = working.data;
  const { ctx } = w;
  const needle = searchKey(search.trim());

  const allRows = abilityRows(ctx, regionFilter);
  const withEffect = allRows.filter((r) => hasEffect(r.entry)).length;
  const rows = allRows
    .filter(({ holders }) =>
      kind === 'all' ? true : holders.some((h) => h.isHidden === (kind === 'hidden')),
    )
    .filter(({ entry }) => effectFilter === 'all' || hasEffect(entry) === (effectFilter === 'with'))
    .filter(
      ({ ability, holders, description }) =>
        !needle ||
        searchKey(`${ability.nameFr} ${ability.name} ${description ?? ''}`).includes(needle) ||
        holders.some((h) => searchKey(h.nameFr).includes(needle)),
    )
    .sort((a, b) => a.ability.nameFr.localeCompare(b.ability.nameFr, 'fr'));
  const selectedRow = allRows.find((r) => r.ability.name === selected);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Talents</h1>
          <button className="btn-ghost" onClick={() => setSummaryOpen(true)}>
            Récapitulatif
          </button>
        </div>
        <p className="mt-1 text-slate-500">
          Talents PokéAPI et Pokémon qui les possèdent (les formes ne sont listées que si leurs
          talents diffèrent de l’espèce). Un talent peut être caché chez un Pokémon et normal chez
          un autre : les Pokémon qui l’ont en talent caché sont entourés en orange. Cliquez sur un
          talent pour régler son effet en jeu : il s’applique tant que le Pokémon fait partie de
          l’équipe envoyée (pendant une Méga-Évolution, c’est le talent de la forme Méga).
        </p>
      </div>
      <VersionBanner working={w} />
      <PrefillPanel working={w} />
      <div className="flex flex-wrap items-center gap-4">
        <input
          className="input max-w-64"
          placeholder="Filtrer par talent, effet, Pokémon…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <FilterButtons options={KIND_FILTERS} value={kind} onChange={setKind} />
        <FilterButtons options={EFFECT_FILTERS} value={effectFilter} onChange={setEffectFilter} />
        <select
          className="input w-auto"
          value={regionFilter}
          onChange={(e) => setRegionFilter(e.target.value)}
          aria-label="Région"
        >
          <option value="game">Toutes les régions du jeu</option>
          {ctx.regions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
              {r.enabled ? '' : ' (désactivée)'}
            </option>
          ))}
          <option value="all">Tous les Pokémon (hors jeu compris)</option>
        </select>
        <span className="text-sm text-slate-500">
          {rows.length} talent(s) · {withEffect} / {allRows.length} avec un effet
        </span>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="p-2 font-normal">Talent</th>
              <th className="p-2 font-normal">Caché</th>
              <th className="p-2 font-normal">Pokémon</th>
              <th className="p-2 font-normal">Effet (jeux principaux)</th>
              <th className="p-2 font-normal">Effet dans le jeu</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ ability, holders, description, entry }) => {
              const hidden = holders.filter((h) => h.isHidden).length;
              return (
                <tr
                  key={ability.name}
                  onClick={() => setSelected(ability.name)}
                  className="cursor-pointer border-t border-slate-100 align-top hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                >
                  <td className="p-2">
                    <p className="font-medium">{ability.nameFr}</p>
                    <p className="text-xs text-slate-500">{ability.name}</p>
                  </td>
                  <td className="whitespace-nowrap p-2">
                    {hidden === 0 ? (
                      <span className="text-slate-500">Non</span>
                    ) : hidden === holders.length ? (
                      <span className="font-medium text-amber-700 dark:text-amber-400">Oui</span>
                    ) : (
                      <span className="text-amber-700 dark:text-amber-400">
                        Parfois ({hidden}/{holders.length})
                      </span>
                    )}
                  </td>
                  <td className="p-2">
                    <HolderSprites holders={holders} />
                  </td>
                  <td className="max-w-md p-2">
                    {description ?? <span className="text-slate-400">Pas de description</span>}
                  </td>
                  <td className="p-2">
                    <EffectSummary entry={entry} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {selectedRow && (
        <AbilityDialog
          key={selectedRow.ability.name}
          working={w}
          ability={selectedRow.ability}
          holders={selectedRow.holders}
          description={selectedRow.description}
          onClose={() => setSelected(null)}
        />
      )}
      {summaryOpen && (
        <AbilitySummaryDialog
          ctx={ctx}
          initialRegion={regionFilter}
          rowsFor={(r) => abilityRows(ctx, r)}
          onClose={() => setSummaryOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * Ajoute au brouillon les effets proposés (Kanto et Johto) des talents encore sans réglage :
 * un talent déjà réglé, même sans effet, n'est jamais modifié.
 */
function PrefillPanel({ working }: { working: WorkingVersion }) {
  const refresh = useRefreshContent();
  const existing = new Set(working.content.abilities.map((a) => a.id));
  const missing = ABILITY_PROPOSALS.filter((a) => !existing.has(a.id));
  const prefill = useMutation({
    mutationFn: async () => {
      for (const ability of missing) {
        await api(`/api/admin/content/versions/${working.version.id}/abilities`, {
          method: 'POST',
          json: ability,
        });
      }
    },
    onSettled: refresh,
  });
  if (!working.editable || missing.length === 0) return null;
  return (
    <div className="card flex flex-wrap items-center gap-3 p-3 text-sm">
      <p className="min-w-0 flex-1 text-slate-600 dark:text-slate-300">
        {missing.length} talent(s) de Kanto et Johto n’ont encore aucun réglage : une proposition
        d’effet inspirée du jeu d’origine est prête pour chacun. Les talents déjà réglés ne sont pas
        modifiés.
      </p>
      {prefill.error && <p className="text-red-600">{errorMessage(prefill.error)}</p>}
      <button className="btn-primary" disabled={prefill.isPending} onClick={() => prefill.mutate()}>
        {prefill.isPending ? 'Pré-remplissage…' : `Pré-remplir ${missing.length} talent(s)`}
      </button>
    </div>
  );
}

function FilterButtons<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <nav className="flex gap-1">
      {options.map((f) => (
        <button
          key={f.id}
          onClick={() => onChange(f.id)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            value === f.id
              ? 'bg-brand-500 text-white'
              : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          {f.label}
        </button>
      ))}
    </nav>
  );
}

function HolderSprites({ holders }: { holders: readonly Holder[] }) {
  return (
    <>
      <div className="flex max-w-md flex-wrap gap-0.5">
        {holders.map((h) => (
          <span
            key={`${h.speciesId}-${h.formId ?? ''}`}
            title={`#${h.speciesId} ${h.nameFr}${h.isHidden ? ' (talent caché)' : ''}`}
            className={`rounded ${h.isHidden ? 'ring-2 ring-amber-400' : ''}`}
          >
            <Sprite id={h.speciesId} formId={h.formId} size={32} />
          </span>
        ))}
      </div>
      <p className="mt-0.5 text-xs text-slate-500">{holders.length} Pokémon</p>
    </>
  );
}

function EffectSummary({ entry }: { entry: GameAbility | undefined }) {
  if (!entry || !hasEffect(entry)) {
    return <span className="text-slate-400">Aucun</span>;
  }
  return (
    <div className="space-y-0.5">
      {entry.effects.map((e, i) => (
        <p key={i} className="font-medium text-emerald-700 dark:text-emerald-400">
          {abilityEffectText(e)}
        </p>
      ))}
      {entry.description && <p className="text-xs text-slate-500">{entry.description}</p>}
    </div>
  );
}

// --- Popup d'édition ------------------------------------------------------------------------

function AbilityDialog({
  working,
  ability,
  holders,
  description,
  onClose,
}: {
  working: WorkingVersion;
  ability: Ability;
  holders: readonly Holder[];
  description: string | null;
  onClose: () => void;
}) {
  const existing = working.content.abilities.find((a) => a.id === ability.name);
  const initial: GameAbility = existing ?? { id: ability.name, description: '', effects: [] };
  const [value, setValue] = useState(initial);
  const save = useSaveEntity<GameAbility>(working.version.id, 'abilities');
  const reset = useDeleteEntity(working.version.id, 'abilities');
  const { valid, errors } = validate(abilitySchema, value);
  const editable = working.editable;
  const issues = working.issues.filter(
    (i) => i.entity === 'ability' && i.entityId === ability.name,
  );
  const dirty = JSON.stringify(value) !== JSON.stringify(initial);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="card w-full max-w-3xl space-y-5 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">
              {ability.nameFr} <span className="text-sm text-slate-500">({ability.name})</span>
            </h2>
            {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
          </div>
          <button className="btn-ghost px-3 py-1" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </div>

        <HolderSprites holders={holders} />
        <IssueList issues={issues} />

        <AbilityEffectEditor
          effects={value.effects}
          errors={errors}
          editable={editable}
          onChange={(effects) => setValue({ ...value, effects })}
        />

        <Field
          label="Texte affiché au joueur"
          hint={
            value.effects.length > 0
              ? `Vide : « ${value.effects.map(abilityEffectText).join(' · ')} »`
              : 'Affiché sous le talent, dans la fiche du Pokémon au PC.'
          }
          error={errors.get('description')}
        >
          <TextInput
            multiline
            value={value.description}
            onChange={(v) => setValue({ ...value, description: v })}
            disabled={!editable}
            maxLength={500}
          />
        </Field>

        {(save.error || reset.error) && (
          <p className="text-sm text-red-600">{errorMessage(save.error ?? reset.error)}</p>
        )}
        {editable ? (
          <div className="flex justify-end gap-2">
            {existing && (
              <button
                className="btn-ghost"
                disabled={reset.isPending}
                onClick={() => reset.mutate(ability.name, { onSuccess: onClose })}
              >
                Retirer tous les effets
              </button>
            )}
            <button
              className="btn-primary"
              disabled={!valid || save.isPending || !dirty}
              onClick={() =>
                save.mutate(
                  { entity: value, key: existing ? ability.name : null },
                  { onSuccess: onClose },
                )
              }
            >
              Enregistrer
            </button>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            Version publiée en lecture seule : créez un brouillon pour modifier l’effet.
          </p>
        )}
      </div>
    </div>
  );
}
