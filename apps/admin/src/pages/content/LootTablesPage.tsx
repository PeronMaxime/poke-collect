import { lootTableSchema } from '@poke/content';
import type { LootEntry, LootTable } from '@poke/content';
import { EntityPage } from '../../components/EntityPage';
import type { EntityFormProps, ListFilter } from '../../components/EntityPage';
import { Field, NumberInput, Section, TextInput, errorsUnder } from '../../components/forms/fields';
import { ItemIcon, ItemSelect } from '../../components/forms/pickers';
import type { WorkingVersion } from '../../lib/content';

/** Valeur du filtre pour les tables utilisées par aucune zone ni aucun donjon. */
const NO_REGION = '-';

/** Régions des zones et donjons qui utilisent la table. */
function tableRegions(t: LootTable, w: WorkingVersion): Set<string> {
  return new Set(
    [...w.content.zones, ...w.content.dungeons]
      .filter((e) => e.lootTableId === t.id)
      .map((e) => e.regionId),
  );
}

const regionFilter: ListFilter<LootTable> = {
  label: 'Région',
  allLabel: 'Toutes les régions',
  options: (w) => [
    ...w.ctx.regions.map((r) => ({ value: r.id, label: r.name })),
    { value: NO_REGION, label: 'Non utilisées' },
  ],
  matches: (t, value, w) => {
    const regions = tableRegions(t, w);
    return value === NO_REGION ? regions.size === 0 : regions.has(value);
  },
};

/**
 * Ordre des expéditions : celui de la première zone qui utilise la table (région, puis ordre de la
 * zone) ; les tables sans zone viennent ensuite, dans leur ordre d'origine.
 */
function byExpeditionOrder(w: WorkingVersion): LootTable[] {
  const rank = new Map<string, number>();
  w.ctx.zones.forEach((z, i) => {
    if (z.lootTableId && !rank.has(z.lootTableId)) rank.set(z.lootTableId, i);
  });
  const rankOf = (t: LootTable) => rank.get(t.id) ?? Number.MAX_SAFE_INTEGER;
  return [...w.content.lootTables].sort((a, b) => rankOf(a) - rankOf(b));
}

export function LootTablesPage() {
  return (
    <EntityPage<LootTable>
      title="Tables de butin"
      description="Tables réutilisables : à chaque tirage, chaque entrée tombe selon sa probabilité."
      collection="loot-tables"
      entityKind="lootTable"
      schema={lootTableSchema}
      list={byExpeditionOrder}
      listFilter={regionFilter}
      getKey={(t) => t.id}
      searchText={(t) => `${t.id} ${t.name}`}
      renderListItem={(t, w) => (
        <>
          <span className="block truncate font-medium">{t.name}</span>
          <span className="block text-xs text-slate-500">
            {[...tableRegions(t, w)].map((id) => w.ctx.region(id)?.name ?? id).join(', ') ||
              'Non utilisée'}{' '}
            · {t.entries.length} entrée(s) ·{' '}
            {w.content.zones.filter((z) => z.lootTableId === t.id).length} zone(s)
          </span>
        </>
      )}
      create={() => ({ id: '', name: '', entries: [] })}
      duplicate={(t) => ({ ...structuredClone(t), id: `${t.id}-copie`, name: `${t.name} (copie)` })}
      renderForm={(p) => <LootTableForm {...p} />}
      newLabel="Nouvelle table"
    />
  );
}

function LootTableForm({
  value: t,
  onChange,
  errors,
  isNew,
  editable,
  working,
}: EntityFormProps<LootTable>) {
  const disabled = !editable;
  const { ctx } = working;
  const update = (i: number, patch: Partial<LootEntry>) =>
    onChange({ ...t, entries: t.entries.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  const usedBy = working.content.zones.filter((z) => z.lootTableId === t.id);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Identifiant"
          hint="Minuscules et tirets, non modifiable ensuite."
          error={errors.get('id')}
        >
          <TextInput
            value={t.id}
            onChange={(id) => onChange({ ...t, id })}
            disabled={disabled || !isNew}
          />
        </Field>
        <Field label="Nom" error={errors.get('name')}>
          <TextInput
            value={t.name}
            onChange={(name) => onChange({ ...t, name })}
            disabled={disabled}
          />
        </Field>
      </div>
      {!isNew && (
        <p className="text-xs text-slate-500">
          Utilisée par : {usedBy.length ? usedBy.map((z) => z.name).join(', ') : 'aucune zone'}.
        </p>
      )}

      <Section title="Entrées">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="py-1 font-normal">Objet</th>
                <th className="py-1 font-normal">Probabilité</th>
                <th className="py-1 font-normal">Min</th>
                <th className="py-1 font-normal">Max</th>
                <th className="py-1 text-right font-normal">Moyenne / tirage</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {t.entries.map((e, i) => (
                <tr key={i} className="border-t border-slate-100 align-top dark:border-slate-800">
                  <td className="py-1 pr-2">
                    <ItemSelect
                      ctx={ctx}
                      value={e.itemId}
                      disabled={disabled}
                      onChange={(itemId) => itemId && update(i, { itemId })}
                    />
                    {errorsUnder(errors, `entries.${i}`).map((m) => (
                      <p key={m} className="text-xs text-red-600">
                        {m}
                      </p>
                    ))}
                  </td>
                  <td className="w-32 py-1 pr-2">
                    <NumberInput
                      value={e.chance}
                      scale={100}
                      min={0}
                      max={100}
                      step={1}
                      unit="%"
                      disabled={disabled}
                      onChange={(chance) => update(i, { chance })}
                    />
                  </td>
                  <td className="w-24 py-1 pr-2">
                    <NumberInput
                      value={e.min}
                      min={1}
                      disabled={disabled}
                      onChange={(min) => update(i, { min })}
                    />
                  </td>
                  <td className="w-24 py-1 pr-2">
                    <NumberInput
                      value={e.max}
                      min={1}
                      disabled={disabled}
                      onChange={(max) => update(i, { max })}
                    />
                  </td>
                  <td className="py-2 text-right font-mono">
                    {((e.chance * (e.min + e.max)) / 2).toFixed(2)}
                  </td>
                  <td className="py-2 pl-2">
                    {!disabled && (
                      <button
                        type="button"
                        className="text-slate-400 hover:text-red-600"
                        onClick={() =>
                          onChange({ ...t, entries: t.entries.filter((_, j) => j !== i) })
                        }
                      >
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!disabled && (
          <button
            type="button"
            className="btn-ghost py-1 text-xs"
            disabled={working.content.items.length === 0}
            onClick={() =>
              onChange({
                ...t,
                entries: [
                  ...t.entries,
                  { itemId: working.content.items[0]!.id, chance: 0.5, min: 1, max: 1 },
                ],
              })
            }
          >
            + Entrée
          </button>
        )}
        {t.entries.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2 text-xs text-slate-500">
            {t.entries.map((e, i) => (
              <span key={i} className="flex items-center gap-1">
                <ItemIcon ctx={ctx} id={e.itemId} size={20} />{' '}
                {ctx.item(e.itemId)?.name ?? e.itemId}
              </span>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
