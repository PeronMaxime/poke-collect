import { ITEM_CATEGORIES, RARITIES, itemSchema } from '@poke/content';
import type { Item, ItemCategory, ItemEffect, Rarity } from '@poke/content';
import { items as pokeApiItems } from '@poke/data';
import { EntityPage } from '../../components/EntityPage';
import type { EntityFormProps } from '../../components/EntityPage';
import {
  Field,
  NullableTextInput,
  NumberInput,
  Section,
  SelectInput,
  TextInput,
} from '../../components/forms/fields';
import { ItemIcon } from '../../components/forms/pickers';

export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  ball: 'Ball',
  berry: 'Baie',
  evolution: 'Évolution',
  breeding: 'Élevage',
  endgame: 'Endgame',
  misc: 'Divers',
};

export const RARITY_LABELS: Record<Rarity, string> = {
  common: 'Commun',
  uncommon: 'Peu commun',
  rare: 'Rare',
  epic: 'Épique',
  legendary: 'Légendaire',
};

/** Types d'effets disponibles : en ajouter un nouveau demande du code (game-core). */
const EFFECTS: Record<
  ItemEffect['type'],
  { label: string; help: string; create: () => ItemEffect }
> = {
  ball: {
    label: 'Ball',
    help: 'Utilisable pour capturer ; multiplie la probabilité de capture.',
    create: () => ({ type: 'ball', catchMultiplier: 1 }),
  },
  captureBoost: {
    label: 'Bonus de capture',
    help: 'Consommé à chaque tentative ; multiplie la probabilité de capture.',
    create: () => ({ type: 'captureBoost', multiplier: 1.5 }),
  },
  breedingIvs: {
    label: 'Héritage d’IV',
    help: 'Tenu par un parent en pension : nombre d’IV transmis à l’œuf (Nœud Destin : 5).',
    create: () => ({ type: 'breedingIvs', count: 5 }),
  },
  breedingNature: {
    label: 'Transmission de nature',
    help: 'Tenu par un parent en pension : chance de transmettre sa nature (Pierre Stase).',
    create: () => ({ type: 'breedingNature', chance: 1 }),
  },
  shinyCharm: {
    label: 'Charme Chroma',
    help: 'Possédé dans le sac (non consommé) : multiplie le taux shiny des rencontres et des éclosions. Non cumulable : le meilleur s’applique.',
    create: () => ({ type: 'shinyCharm', multiplier: 3 }),
  },
};

const pokeApiById = new Map(pokeApiItems.map((i) => [i.name, i]));

export function ItemsPage() {
  return (
    <EntityPage<Item>
      title="Objets"
      description="Catalogue : objets PokéAPI et objets maison, rareté, catégorie et effets."
      collection="items"
      entityKind="item"
      schema={itemSchema}
      list={(w) => w.content.items}
      getKey={(i) => i.id}
      searchText={(i) => `${i.id} ${i.name} ${CATEGORY_LABELS[i.category]}`}
      renderListItem={(i, w) => (
        <span className="flex items-center gap-2">
          <ItemIcon ctx={w.ctx} id={i.id} />
          <span className="min-w-0">
            <span className="block truncate font-medium">{i.name}</span>
            <span className="block text-xs text-slate-500">
              {CATEGORY_LABELS[i.category]} · {RARITY_LABELS[i.rarity]}
            </span>
          </span>
        </span>
      )}
      create={() => ({
        id: '',
        name: '',
        description: '',
        icon: null,
        category: 'misc',
        rarity: 'common',
        effects: [],
      })}
      duplicate={(i) => ({ ...structuredClone(i), id: `${i.id}-copie`, name: `${i.name} (copie)` })}
      renderForm={(p) => <ItemForm {...p} />}
      newLabel="Nouvel objet"
    />
  );
}

function ItemForm({
  value: item,
  onChange,
  errors,
  isNew,
  editable,
  working,
}: EntityFormProps<Item>) {
  const set = <K extends keyof Item>(key: K, v: Item[K]) => onChange({ ...item, [key]: v });
  const disabled = !editable;
  const pokeApi = pokeApiById.get(item.id);
  const used = new Set(working.content.items.map((i) => i.id));

  return (
    <div className="space-y-6">
      {isNew && (
        <Field
          label="Partir d’un objet PokéAPI"
          hint="Pré-remplit l’identifiant, le nom, la description et le sprite."
        >
          <select
            className="input"
            value=""
            onChange={(e) => {
              const src = pokeApiById.get(e.target.value);
              if (src)
                onChange({
                  ...item,
                  id: src.name,
                  name: src.nameFr,
                  description: src.descriptionFr ?? '',
                });
            }}
          >
            <option value="">Objet maison (aucun)</option>
            {pokeApiItems
              .filter((i) => !used.has(i.name))
              .map((i) => (
                <option key={i.name} value={i.name}>
                  {i.nameFr} ({i.name})
                </option>
              ))}
          </select>
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Identifiant"
          hint={
            pokeApi
              ? 'Objet PokéAPI : le sprite officiel est utilisé.'
              : 'Objet maison : prévoir une icône.'
          }
          error={errors.get('id')}
        >
          <TextInput value={item.id} onChange={(v) => set('id', v)} disabled={disabled || !isNew} />
        </Field>
        <Field label="Nom" error={errors.get('name')}>
          <TextInput value={item.name} onChange={(v) => set('name', v)} disabled={disabled} />
        </Field>
        <Field label="Catégorie">
          <SelectInput
            value={item.category}
            onChange={(v) => set('category', v)}
            disabled={disabled}
            options={ITEM_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))}
          />
        </Field>
        <Field label="Rareté">
          <SelectInput
            value={item.rarity}
            onChange={(v) => set('rarity', v)}
            disabled={disabled}
            options={RARITIES.map((r) => ({ value: r, label: RARITY_LABELS[r] }))}
          />
        </Field>
        <Field label="Icône personnalisée (URL)" error={errors.get('icon')}>
          <div className="flex items-center gap-2">
            {item.id && <ItemIcon ctx={working.ctx} id={item.id} size={32} />}
            <NullableTextInput
              value={item.icon}
              onChange={(v) => set('icon', v)}
              disabled={disabled}
              placeholder="Sprite PokéAPI par défaut"
            />
          </div>
        </Field>
        <Field label="Description" className="sm:col-span-2" error={errors.get('description')}>
          <TextInput
            multiline
            value={item.description}
            onChange={(v) => set('description', v)}
            disabled={disabled}
            maxLength={500}
          />
        </Field>
      </div>

      <Section title="Effets">
        {item.effects.length === 0 && (
          <p className="text-sm text-slate-500">
            Aucun effet (objet de collection, ou utilisé plus tard).
          </p>
        )}
        {item.effects.map((effect, i) => {
          const update = (e: ItemEffect) =>
            set(
              'effects',
              item.effects.map((x, j) => (j === i ? e : x)),
            );
          return (
            <div
              key={i}
              className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800"
            >
              <div className="min-w-48 flex-1">
                <p className="text-sm font-medium">{EFFECTS[effect.type].label}</p>
                <p className="text-xs text-slate-500">{EFFECTS[effect.type].help}</p>
              </div>
              {effect.type === 'ball' && (
                <Field label="Multiplicateur" error={errors.get(`effects.${i}.catchMultiplier`)}>
                  <NumberInput
                    className="w-32"
                    value={effect.catchMultiplier}
                    min={0}
                    step={0.1}
                    unit="×"
                    disabled={disabled}
                    onChange={(v) => update({ ...effect, catchMultiplier: v })}
                  />
                </Field>
              )}
              {effect.type === 'captureBoost' && (
                <Field label="Multiplicateur" error={errors.get(`effects.${i}.multiplier`)}>
                  <NumberInput
                    className="w-32"
                    value={effect.multiplier}
                    min={0}
                    step={0.1}
                    unit="×"
                    disabled={disabled}
                    onChange={(v) => update({ ...effect, multiplier: v })}
                  />
                </Field>
              )}
              {effect.type === 'breedingIvs' && (
                <Field label="IV transmis" error={errors.get(`effects.${i}.count`)}>
                  <NumberInput
                    className="w-32"
                    value={effect.count}
                    min={0}
                    max={6}
                    unit="IV"
                    disabled={disabled}
                    onChange={(v) => update({ ...effect, count: v })}
                  />
                </Field>
              )}
              {effect.type === 'breedingNature' && (
                <Field label="Chance" error={errors.get(`effects.${i}.chance`)}>
                  <NumberInput
                    className="w-32"
                    value={effect.chance}
                    scale={100}
                    min={0}
                    max={100}
                    unit="%"
                    disabled={disabled}
                    onChange={(v) => update({ ...effect, chance: v })}
                  />
                </Field>
              )}
              {effect.type === 'shinyCharm' && (
                <Field label="Multiplicateur" error={errors.get(`effects.${i}.multiplier`)}>
                  <NumberInput
                    className="w-32"
                    value={effect.multiplier}
                    min={1}
                    max={100}
                    step={0.5}
                    unit="×"
                    disabled={disabled}
                    onChange={(v) => update({ ...effect, multiplier: v })}
                  />
                </Field>
              )}
              {editable && (
                <button
                  type="button"
                  className="text-slate-400 hover:text-red-600"
                  onClick={() =>
                    set(
                      'effects',
                      item.effects.filter((_, j) => j !== i),
                    )
                  }
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
        {editable && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(EFFECTS).map(([type, def]) => (
              <button
                key={type}
                type="button"
                className="btn-ghost py-1 text-xs"
                onClick={() => set('effects', [...item.effects, def.create()])}
              >
                + {def.label}
              </button>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
