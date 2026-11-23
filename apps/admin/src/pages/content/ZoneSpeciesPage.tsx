/**
 * Page « Espèces par zone » : la grille des espèces d'une région (Pokédex régional, formes
 * rencontrées) et de ses zones dans l'ordre, pour voir où chaque espèce apparaît, la première fois,
 * une seule fois ou plusieurs, et lesquelles manquent. Un clic sur une case ouvre un petit menu à
 * l'endroit de la souris : « Modifier » (popup du poids et des niveaux) et « Supprimer » sur une
 * rencontre, « Ajouter » (même popup) sur une case vide ; tout s'écrit dans le brouillon.
 */
import { useEffect, useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import type { Zone } from '@poke/content';
import { searchKey } from '@poke/shared';
import { VersionBanner } from '../../components/EntityPage';
import { NumberInput } from '../../components/forms/fields';
import { Sprite } from '../../components/forms/pickers';
import { errorMessage, useSaveEntity, useWorkingVersion } from '../../lib/content';
import type { WorkingVersion } from '../../lib/content';
import {
  ROW_FILTERS,
  filterCounts,
  matchesFilter,
  suggestedLevels,
  withEncounter,
  zoneSpeciesReport,
} from '../../lib/zone-species';
import type {
  Availability,
  RowFilter,
  SpeciesCell,
  SpeciesRow,
  ZoneColumn,
} from '../../lib/zone-species';
import { useStored } from '../ExpeditionSimulatorPage';

/** Page « Espèces par zone » (voir l'en-tête du fichier). */
export function ZoneSpeciesPage() {
  const { data: w, isPending, error } = useWorkingVersion();
  if (isPending) return <p className="text-sm text-slate-500">Chargement…</p>;
  if (!w) return <p className="text-sm text-red-600">{errorMessage(error)}</p>;
  return <ZoneSpecies w={w} />;
}

/**
 * Case choisie dans la grille : une zone et une ligne, avec le menu ouvert à `menu` (coordonnées
 * de la fenêtre, en pixels), ou la popup d'édition quand `menu` est null.
 */
interface Selection {
  zoneId: string;
  rowKey: string;
  menu: { x: number; y: number } | null;
}

/** État de la page : région et options gardées dans le navigateur, filtre, recherche, case choisie. */
function useZoneSpecies(w: WorkingVersion) {
  const { ctx } = w;
  const [storedRegion, setRegionId] = useStored<string | null>('zone-species-region', null);
  const [includeDisabled, setIncludeDisabled] = useStored('zone-species-disabled', false);
  const [filter, setFilter] = useState<RowFilter>('all');
  const [search, setSearch] = useState('');
  const [selection, setSelection] = useState<Selection | null>(null);
  const region = ctx.region(storedRegion ?? '') ?? ctx.regions[0];
  const report = useMemo(
    () => zoneSpeciesReport(ctx, region?.id ?? '', { includeDisabled }),
    [ctx, region?.id, includeDisabled],
  );
  const needle = searchKey(search.trim());
  const rows = report.rows.filter(
    (r) =>
      matchesFilter(r, filter) &&
      (!needle || String(r.speciesId) === needle || searchKey(r.name).includes(needle)),
  );
  const selectedColumn = report.zones.find((c) => c.zone.id === selection?.zoneId);
  const selectedRow = report.rows.find((r) => r.key === selection?.rowKey);
  return {
    region,
    setRegionId: (id: string) => {
      setRegionId(id);
      setSelection(null);
    },
    includeDisabled,
    setIncludeDisabled,
    filter,
    setFilter,
    search,
    setSearch,
    report,
    rows,
    counts: filterCounts(report.rows),
    selection,
    setSelection,
    selected:
      selectedColumn && selectedRow ? { column: selectedColumn, row: selectedRow } : undefined,
  };
}

function ZoneSpecies({ w }: { w: WorkingVersion }) {
  const page = useZoneSpecies(w);
  const { report, selected, selection } = page;
  const remove = useSaveEntity<Zone>(w.version.id, 'zones');
  const close = () => page.setSelection(null);
  const present = report.rows.filter((r) => r.inDex && r.availability === 'present').length;
  const dexSize = report.rows.filter((r) => r.inDex && r.formId === null).length;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Espèces par zone</h1>
        <p className="mt-1 text-slate-500">
          Où apparaît chaque espèce d’une région, zone par zone dans l’ordre : première apparition,
          zone unique ou doublons, espèces absentes. Cliquez une case pour ajouter, modifier ou
          supprimer la rencontre.
        </p>
      </div>
      <VersionBanner working={w} />
      <Toolbar w={w} page={page} />
      <p className="text-sm text-slate-500">
        {present} espèce(s) du Pokédex régional sur {dexSize} dans {report.zones.length} zone(s) ·{' '}
        {page.rows.length} ligne(s) affichée(s).
      </p>
      <Legend />
      {remove.error && <p className="text-sm text-red-600">{errorMessage(remove.error)}</p>}
      {selected && selection?.menu && (
        <CellMenu
          at={selection.menu}
          column={selected.column}
          row={selected.row}
          editable={w.editable}
          onEdit={() => page.setSelection({ ...selection, menu: null })}
          onRemove={(cell) => {
            remove.mutate({
              entity: withEncounter(selected.column.zone, cell.encounterIndex, null),
              key: selected.column.zone.id,
            });
            close();
          }}
          onClose={close}
        />
      )}
      {selected && selection && !selection.menu && (
        <EncounterDialog w={w} column={selected.column} row={selected.row} onClose={close} />
      )}
      {report.zones.length === 0 ? (
        <div className="card text-sm text-slate-500">Aucune zone dans cette région.</div>
      ) : (
        <Matrix
          zones={report.zones}
          rows={page.rows}
          selection={page.selection}
          onSelect={page.setSelection}
        />
      )}
    </div>
  );
}

function Toolbar({ w, page }: { w: WorkingVersion; page: ReturnType<typeof useZoneSpecies> }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        className="input w-auto"
        aria-label="Région"
        value={page.region?.id ?? ''}
        onChange={(e) => page.setRegionId(e.target.value)}
      >
        {w.ctx.regions.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
            {r.enabled ? '' : ' (désactivée)'}
          </option>
        ))}
      </select>
      <select
        className="input w-auto"
        aria-label="Filtre"
        value={page.filter}
        onChange={(e) => page.setFilter(e.target.value as RowFilter)}
      >
        {(Object.keys(ROW_FILTERS) as RowFilter[]).map((f) => (
          <option key={f} value={f}>
            {ROW_FILTERS[f]} ({page.counts[f]})
          </option>
        ))}
      </select>
      <input
        className="input w-56"
        placeholder="Nom ou numéro…"
        value={page.search}
        onChange={(e) => page.setSearch(e.target.value)}
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={page.includeDisabled}
          onChange={(e) => page.setIncludeDisabled(e.target.checked)}
        />
        Zones désactivées
      </label>
    </div>
  );
}

const AVAILABILITY: Record<Exclude<Availability, 'present'>, { label: string; title: string }> = {
  evolution: {
    label: 'par évolution',
    title: 'Absente des zones, mais une pré-évolution y est : on l’obtient en la faisant évoluer.',
  },
  egg: {
    label: 'à l’œuf',
    title: 'Absente des zones ; seule une évolution y est : on l’obtient à l’œuf, en pension.',
  },
  missing: {
    label: 'introuvable',
    title: 'Aucune espèce de sa lignée n’est dans les zones de la région.',
  },
};

/** Couleur d'une case selon la chance d'apparition. */
function cellClass(cell: SpeciesCell): string {
  if (cell.special) return 'bg-amber-200 text-amber-900 dark:bg-amber-900/60 dark:text-amber-100';
  if (cell.chance >= 0.15) return 'bg-brand-500 text-white';
  if (cell.chance >= 0.07) return 'bg-brand-500/60 text-white';
  return 'bg-brand-500/25 text-brand-700 dark:text-brand-200';
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
      <span className="flex items-center gap-1">
        <span className="inline-block h-4 w-6 rounded bg-brand-500" /> ≥ 15 %
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-4 w-6 rounded bg-brand-500/60" /> 7 à 15 %
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-4 w-6 rounded bg-brand-500/25" /> &lt; 7 %
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-4 w-6 rounded bg-amber-200 dark:bg-amber-900/60" />{' '}
        rencontre spéciale
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-4 w-6 rounded ring-2 ring-emerald-500" /> première
        apparition
      </span>
      <span>Le nombre dans une case : chance d’apparition dans la zone, en %.</span>
    </div>
  );
}

function Matrix({
  zones,
  rows,
  selection,
  onSelect,
}: {
  zones: ZoneColumn[];
  rows: SpeciesRow[];
  selection: Selection | null;
  onSelect: (s: Selection) => void;
}) {
  return (
    <div className="max-h-[75vh] overflow-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <table className="border-separate border-spacing-0 text-xs">
        <thead className="sticky top-0 z-20 bg-white dark:bg-slate-900">
          <tr>
            <th className="sticky left-0 z-30 min-w-64 border-b border-slate-200 bg-white px-2 py-1 text-left align-bottom font-normal text-slate-500 dark:border-slate-800 dark:bg-slate-900">
              Espèce · stade · zones · 1re apparition
            </th>
            {zones.map((c) => (
              <ZoneHeader key={c.zone.id} column={c} />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <MatrixRow
              key={row.key}
              row={row}
              zones={zones}
              selectedZoneId={selection?.rowKey === row.key ? selection.zoneId : null}
              onSelect={(zoneId, menu) => onSelect({ zoneId, rowKey: row.key, menu })}
            />
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="p-4 text-sm text-slate-500">Aucune espèce.</p>}
    </div>
  );
}

function ZoneHeader({ column: c }: { column: ZoneColumn }) {
  return (
    <th
      className="border-b border-l border-slate-200 px-0.5 pt-1 pb-1 align-bottom font-normal dark:border-slate-800"
      title={`${c.index}. ${c.zone.name} : ${c.encounterCount} rencontre(s), ${c.newCount} nouvelle(s) espèce(s) pour la région`}
    >
      <div
        className={`mx-auto max-h-40 overflow-hidden text-left whitespace-nowrap [writing-mode:vertical-rl] rotate-180 ${c.zone.enabled ? '' : 'text-slate-400 line-through'}`}
      >
        {c.index}. {c.zone.name}
      </div>
      <div className="mt-1 text-center text-[10px] text-emerald-600" aria-label="Nouvelles espèces">
        +{c.newCount}
      </div>
    </th>
  );
}

function RowLabel({ row }: { row: SpeciesRow }) {
  const { stage } = row;
  const finalEvolved = stage.evolved && !stage.canEvolve;
  const missing = row.availability !== 'present' ? AVAILABILITY[row.availability] : null;
  return (
    <div className="flex items-center gap-2">
      <Sprite id={row.speciesId} formId={row.formId} size={32} />
      <div className="min-w-0">
        <div className="truncate font-medium">
          #{row.speciesId} {row.name}
          {!row.inDex && (
            <span className="ml-1 text-[10px] text-amber-600" title="Hors Pokédex de la région">
              hors Pokédex
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-x-2 text-[11px] text-slate-500">
          <span
            title={
              stage.fromBaby ? 'Évolution d’un bébé' : finalEvolved ? 'Ne peut plus évoluer' : ''
            }
          >
            {stage.stage === 0 ? 'Bébé' : `Stade ${stage.stage}`}
            {finalEvolved && ' · final'}
            {stage.fromBaby && ' · de bébé'}
          </span>
          {row.zoneCount > 0 && (
            <span className={row.zoneCount === 1 ? 'text-sky-600' : ''}>
              {row.zoneCount} zone{row.zoneCount > 1 ? 's' : ''}
            </span>
          )}
          {row.first && (
            <span>
              dès {row.first.index}. {row.first.zone.name}
            </span>
          )}
          {missing && (
            <span
              className={row.availability === 'missing' ? 'text-red-600' : 'text-amber-600'}
              title={missing.title}
            >
              {missing.label}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function MatrixRow({
  row,
  zones,
  selectedZoneId,
  onSelect,
}: {
  row: SpeciesRow;
  zones: ZoneColumn[];
  selectedZoneId: string | null;
  onSelect: (zoneId: string, menu: { x: number; y: number }) => void;
}) {
  return (
    <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
      <td className="sticky left-0 z-10 border-b border-slate-100 bg-white px-2 py-1 dark:border-slate-800 dark:bg-slate-900">
        <RowLabel row={row} />
      </td>
      {zones.map((c) => {
        const cell = row.cells.get(c.zone.id);
        const first = row.first?.zone.id === c.zone.id;
        const selected = selectedZoneId === c.zone.id;
        return (
          <td
            key={c.zone.id}
            className="border-b border-l border-slate-100 p-0.5 text-center dark:border-slate-800"
          >
            <button
              type="button"
              className={`h-7 w-8 rounded font-mono text-[11px] ${
                cell ? cellClass(cell) : 'text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              } ${first ? 'ring-2 ring-emerald-500' : ''} ${selected ? 'outline-2 outline-offset-1 outline-slate-900 dark:outline-white' : ''}`}
              title={cellTitle(row, c, cell)}
              aria-label={`${row.name} dans ${c.zone.name}`}
              aria-haspopup="menu"
              onClick={(e) => onSelect(c.zone.id, menuPosition(e))}
            >
              {cell ? (cell.special ? '★' : percent(cell.chance)) : '·'}
            </button>
          </td>
        );
      })}
    </tr>
  );
}

/**
 * Où ouvrir le menu d'une case : sous la souris, ou sous la case quand elle est activée au clavier
 * (`detail` vaut 0 et la souris n'a pas de position).
 */
function menuPosition(e: MouseEvent<HTMLButtonElement>): { x: number; y: number } {
  if (e.detail > 0) return { x: e.clientX, y: e.clientY };
  const rect = e.currentTarget.getBoundingClientRect();
  return { x: rect.left, y: rect.bottom };
}

const percent = (chance: number) =>
  chance === 0 ? '0' : chance < 0.01 ? '<1' : String(Math.round(chance * 100));

function cellTitle(row: SpeciesRow, c: ZoneColumn, cell: SpeciesCell | undefined): string {
  const where = `${row.name} · ${c.index}. ${c.zone.name}`;
  if (!cell) return `${where} : absent`;
  const levels = `niv. ${cell.minLevel}-${cell.maxLevel}`;
  if (cell.special) return `${where} : rencontre spéciale, ${levels}`;
  return `${where} : poids ${cell.weight}, ${(cell.chance * 100).toFixed(1)} %, ${levels}`;
}

/** Ferme un menu ou une popup à la touche Échap. */
function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}

const MENU_WIDTH = 208;
const MENU_HEIGHT = 140;
const MENU_ITEM =
  'block w-full rounded px-2 py-1.5 text-left hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-slate-800';

/**
 * Menu d'une case, ouvert à l'endroit du clic (gardé dans la fenêtre) : « Modifier » et
 * « Supprimer » sur une rencontre, « Ajouter » sur une case vide. Une rencontre spéciale se règle
 * dans la page Zones ; sans brouillon, les entrées sont grisées. Un clic à côté ou Échap le ferme.
 */
function CellMenu({
  at,
  column,
  row,
  editable,
  onEdit,
  onRemove,
  onClose,
}: {
  at: { x: number; y: number };
  column: ZoneColumn;
  row: SpeciesRow;
  editable: boolean;
  onEdit: () => void;
  onRemove: (cell: SpeciesCell) => void;
  onClose: () => void;
}) {
  useEscape(onClose);
  const cell = row.cells.get(column.zone.id);
  const left = Math.max(8, Math.min(at.x, window.innerWidth - MENU_WIDTH - 8));
  const top = Math.max(8, Math.min(at.y, window.innerHeight - MENU_HEIGHT - 8));
  const item = (label: string, onClick: () => void, danger = false) => (
    <button
      type="button"
      role="menuitem"
      className={`${MENU_ITEM} ${danger ? 'text-red-600' : ''}`}
      disabled={!editable}
      onClick={onClick}
    >
      {label}
    </button>
  );
  return (
    <div
      className="fixed inset-0 z-50"
      onMouseDown={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        role="menu"
        aria-label={`${row.name} dans ${column.zone.name}`}
        className="absolute rounded-lg border border-slate-200 bg-white p-1 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900"
        style={{ left, top, width: MENU_WIDTH }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="truncate px-2 py-1 text-xs text-slate-500">
          {row.name} · {column.index}. {column.zone.name}
        </div>
        {cell?.special ? (
          <p className="px-2 py-1.5 text-xs text-slate-500">
            Rencontre spéciale : elle se règle dans la page Zones.
          </p>
        ) : cell ? (
          <>
            {item('Modifier', onEdit)}
            {item('Supprimer', () => onRemove(cell), true)}
          </>
        ) : (
          item('Ajouter', onEdit)
        )}
        {!editable && !cell?.special && (
          <p className="px-2 py-1 text-xs text-slate-500">
            Créez un brouillon pour modifier les rencontres.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Popup d'une rencontre ordinaire : régler son poids et ses niveaux, ou l'ajouter à la zone avec
 * des niveaux proposés d'après ses autres rencontres. Se ferme une fois enregistrée.
 */
function EncounterDialog({
  w,
  column,
  row,
  onClose,
}: {
  w: WorkingVersion;
  column: ZoneColumn;
  row: SpeciesRow;
  onClose: () => void;
}) {
  useEscape(onClose);
  const { zone } = column;
  const cell = row.cells.get(zone.id);
  const suggested = suggestedLevels(zone);
  const [weight, setWeight] = useState(cell?.weight ?? 10);
  const [minLevel, setMinLevel] = useState(cell?.minLevel ?? suggested.minLevel);
  const [maxLevel, setMaxLevel] = useState(cell?.maxLevel ?? suggested.maxLevel);
  const save = useSaveEntity<Zone>(w.version.id, 'zones');
  const valid = weight > 0 && minLevel >= 1 && maxLevel <= 100 && maxLevel >= minLevel;
  const submit = () =>
    save.mutate(
      {
        entity: withEncounter(zone, cell?.encounterIndex ?? null, {
          speciesId: row.speciesId,
          formId: row.formId,
          weight,
          minLevel,
          maxLevel,
        }),
        key: zone.id,
      },
      { onSuccess: onClose },
    );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 sm:p-8"
      onClick={onClose}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label={`${row.name} dans ${zone.name}`}
        className="card w-full max-w-md space-y-4 p-5"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !save.isPending) submit();
        }}
      >
        <div className="flex items-center gap-3">
          <Sprite id={row.speciesId} formId={row.formId} size={40} />
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">
              {row.name} · {column.index}. {zone.name}
            </h2>
            <div className="text-xs text-slate-500">
              {cell
                ? `Présent : ${(cell.chance * 100).toFixed(1)} % des rencontres de la zone.`
                : `Absent de cette zone (${zone.encounters.length} rencontre(s)).`}
            </div>
          </div>
          <button
            type="button"
            className="btn-ghost px-3 py-1"
            onClick={onClose}
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <LabeledNumber label="Poids" value={weight} min={1} onChange={setWeight} />
          <LabeledNumber
            label="Niv. min"
            value={minLevel}
            min={1}
            max={100}
            onChange={setMinLevel}
          />
          <LabeledNumber
            label="Niv. max"
            value={maxLevel}
            min={1}
            max={100}
            onChange={setMaxLevel}
          />
        </div>
        {save.error && <p className="text-sm text-red-600">{errorMessage(save.error)}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost py-1.5" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn-primary py-1.5" disabled={!valid || save.isPending}>
            {cell ? 'Enregistrer' : 'Ajouter à la zone'}
          </button>
        </div>
      </form>
    </div>
  );
}

function LabeledNumber({
  label,
  ...input
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="w-24 text-xs text-slate-500">
      {label}
      <NumberInput {...input} />
    </label>
  );
}
