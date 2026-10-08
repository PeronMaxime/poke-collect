import { useMemo, useState } from 'react';
import { PURCHASE_PERIODS, shopCategorySchema, shopEntrySchema } from '@poke/content';
import type { PurchasePeriod, ShopCategory, ShopEntry, UnlockCondition } from '@poke/content';
import { isOnSale, regionDexProgress, shopEntryStatus } from '@poke/game-core';
import type { GameContext, PlayerProgress, ShopEntryState } from '@poke/game-core';
import { EntityPage, VersionBanner } from '../../components/EntityPage';
import type { EntityFormProps } from '../../components/EntityPage';
import {
  Field,
  NullableTextInput,
  NumberInput,
  Section,
  SelectInput,
  TextInput,
  Toggle,
} from '../../components/forms/fields';
import { ItemIcon, ItemSelect, UnlockEditor } from '../../components/forms/pickers';
import { errorMessage, useWorkingVersion } from '../../lib/content';
import type { WorkingVersion } from '../../lib/content';

const VIEWS = [
  { id: 'entries', label: 'Articles' },
  { id: 'categories', label: 'Catégories' },
  { id: 'preview', label: 'Aperçu joueur' },
] as const;
type View = (typeof VIEWS)[number]['id'];

const PERIOD_LABELS: Record<PurchasePeriod, string> = {
  total: 'au total',
  day: 'par 24 h glissantes',
  week: 'par 7 jours glissants',
};

const money = (n: number) => `${n.toLocaleString('fr-FR')} ₽`;

/** Condition d'apparition en clair (liste, aperçu). */
function unlockSummary(ctx: GameContext, u: UnlockCondition): string {
  switch (u.type) {
    case 'always':
      return 'toujours';
    case 'regionDexPercent':
      return `${u.percent} % du Pokédex de ${ctx.region(u.regionId)?.name ?? u.regionId}`;
    case 'trainerDefeated': {
      const t = ctx.trainer(u.trainerId);
      return `victoire contre ${t ? `${t.trainerClass} ${t.name}` : u.trainerId}`;
    }
    case 'badgeCount':
      return `${u.count} badge(s)`;
    case 'speciesCaught':
      return `${u.count} espèce(s) capturée(s)`;
    case 'eggsHatched':
      return `${u.count} œuf(s) éclos`;
    case 'questStepsDone':
      return `${u.count} étape(s) de la quête ${ctx.quest(u.questId)?.name ?? u.questId}`;
    case 'questCompleted':
      return `quête ${ctx.quest(u.questId)?.name ?? u.questId} terminée`;
  }
}

export function ShopPage() {
  const [view, setView] = useState<View>('entries');
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
      {view === 'entries' && <EntriesView />}
      {view === 'categories' && <CategoriesView />}
      {view === 'preview' && <ShopPreview />}
    </div>
  );
}

// --- Articles ----------------------------------------------------------------------------

function EntriesView() {
  return (
    <EntityPage<ShopEntry>
      title="Boutique : articles"
      description="Objet vendu, prix par lot, catégorie, condition d’apparition, visibilité, limite d’achat, dates."
      collection="shop-entries"
      entityKind="shopEntry"
      schema={shopEntrySchema}
      list={(w) => w.ctx.shopEntries as ShopEntry[]}
      getKey={(e) => e.id}
      searchText={(e, w) =>
        `${e.id} ${e.itemId} ${w.ctx.item(e.itemId)?.name ?? ''} ${e.categoryId}`
      }
      renderListItem={(e, w) => (
        <span className="flex items-center gap-2">
          <ItemIcon ctx={w.ctx} id={e.itemId} />
          <span className="min-w-0">
            <span className={`block truncate font-medium ${e.enabled ? '' : 'line-through'}`}>
              {w.ctx.item(e.itemId)?.name ?? e.itemId}
              {e.lotSize > 1 && ` × ${e.lotSize}`}
            </span>
            <span className="block truncate text-xs text-slate-500">
              {money(e.price)} · {w.content.shopCategories.find((c) => c.id === e.categoryId)?.name}
              {e.unlock.type !== 'always' && ` · 🔒 ${unlockSummary(w.ctx, e.unlock)}`}
            </span>
          </span>
        </span>
      )}
      create={(w) => ({
        id: '',
        itemId: w.content.items[0]?.id ?? '',
        categoryId: w.ctx.shopCategories[0]?.id ?? '',
        order: w.content.shopEntries.length,
        price: 100,
        lotSize: 1,
        unlock: { type: 'always' },
        lockedVisibility: 'locked',
        purchaseLimit: null,
        availableFrom: null,
        availableUntil: null,
        enabled: true,
      })}
      duplicate={(e) => ({ ...structuredClone(e), id: `${e.id}-copie` })}
      renderForm={(p) => <EntryForm {...p} />}
      newLabel="Nouvel article"
    />
  );
}

/** ISO → valeur d'un champ `datetime-local` (heure locale du navigateur). */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

function EntryForm({
  value: e,
  onChange,
  errors,
  isNew,
  editable,
  working,
}: EntityFormProps<ShopEntry>) {
  const set = <K extends keyof ShopEntry>(key: K, v: ShopEntry[K]) => onChange({ ...e, [key]: v });
  const { ctx } = working;
  const disabled = !editable;
  const categories = ctx.shopCategories;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Identifiant"
          hint="Minuscules et tirets, non modifiable ensuite."
          error={errors.get('id')}
        >
          <TextInput value={e.id} onChange={(v) => set('id', v)} disabled={disabled || !isNew} />
        </Field>
        <Field label="Objet vendu" error={errors.get('itemId')}>
          <ItemSelect
            ctx={ctx}
            value={e.itemId}
            onChange={(v) => v && set('itemId', v)}
            disabled={disabled}
          />
        </Field>
        <Field
          label="Catégorie (onglet)"
          hint={categories.length === 0 ? 'Créez d’abord une catégorie.' : undefined}
          error={errors.get('categoryId')}
        >
          <select
            className="input"
            value={e.categoryId}
            disabled={disabled}
            onChange={(ev) => set('categoryId', ev.target.value)}
          >
            {!categories.some((c) => c.id === e.categoryId) && (
              <option value={e.categoryId}>{e.categoryId || 'Choisir…'} (inconnue)</option>
            )}
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ordre d’affichage" hint="Dans la catégorie." error={errors.get('order')}>
          <NumberInput
            value={e.order}
            min={0}
            onChange={(v) => set('order', v)}
            disabled={disabled}
          />
        </Field>
        <Field
          label="Prix d’un lot"
          hint={
            e.lotSize > 1 && e.price > 0
              ? `soit ${money(Math.round(e.price / e.lotSize))} l’unité`
              : undefined
          }
          error={errors.get('price')}
        >
          <NumberInput
            value={e.price}
            min={0}
            step={50}
            unit="₽"
            onChange={(v) => set('price', v)}
            disabled={disabled}
          />
        </Field>
        <Field label="Quantité par lot" error={errors.get('lotSize')}>
          <NumberInput
            value={e.lotSize}
            min={1}
            max={999}
            unit="objet(s)"
            onChange={(v) => set('lotSize', v)}
            disabled={disabled}
          />
        </Field>
      </div>
      <Toggle
        checked={e.enabled}
        onChange={(v) => set('enabled', v)}
        label="Article activé (désactivé : invisible pour tous les joueurs)"
        disabled={disabled}
      />

      <Section title="Apparition">
        <Field label="Condition d’apparition">
          <UnlockEditor
            value={e.unlock}
            regions={ctx.regions}
            trainers={ctx.trainers}
            quests={ctx.quests}
            onChange={(v) => set('unlock', v)}
            disabled={disabled}
          />
        </Field>
        <Field
          label="Avant déblocage"
          hint="Verrouillé : visible, grisé, condition affichée (donne un objectif). Caché : n’apparaît qu’une fois la condition remplie."
        >
          <SelectInput
            value={e.lockedVisibility}
            onChange={(v) => set('lockedVisibility', v)}
            disabled={disabled || e.unlock.type === 'always'}
            options={[
              { value: 'locked', label: 'Verrouillé (visible)' },
              { value: 'hidden', label: 'Caché' },
            ]}
          />
        </Field>
      </Section>

      <Section title="Limite d’achat">
        <Toggle
          checked={e.purchaseLimit !== null}
          onChange={(on) => set('purchaseLimit', on ? { lots: 1, period: 'total' } : null)}
          label="Limiter les achats par joueur"
          disabled={disabled}
        />
        {e.purchaseLimit && (
          <div className="flex flex-wrap items-center gap-2">
            <NumberInput
              className="w-36"
              value={e.purchaseLimit.lots}
              min={1}
              unit="lot(s)"
              onChange={(lots) => set('purchaseLimit', { ...e.purchaseLimit!, lots })}
              disabled={disabled}
            />
            <SelectInput
              value={e.purchaseLimit.period}
              onChange={(period) => set('purchaseLimit', { ...e.purchaseLimit!, period })}
              disabled={disabled}
              options={PURCHASE_PERIODS.map((p) => ({ value: p, label: PERIOD_LABELS[p] }))}
            />
          </div>
        )}
        {[...errors].some(([p]) => p.startsWith('purchaseLimit')) && (
          <p className="text-xs text-red-600">Limite invalide.</p>
        )}
      </Section>

      <Section title="Disponibilité dans le temps">
        <p className="text-xs text-slate-500">
          Optionnel, pour les articles temporaires. Heure locale de votre navigateur.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="À partir du" error={errors.get('availableFrom')}>
            <input
              type="datetime-local"
              className="input"
              value={toLocalInput(e.availableFrom)}
              disabled={disabled}
              onChange={(ev) => set('availableFrom', fromLocalInput(ev.target.value))}
            />
          </Field>
          <Field label="Jusqu’au (exclu)" error={errors.get('availableUntil')}>
            <input
              type="datetime-local"
              className="input"
              value={toLocalInput(e.availableUntil)}
              disabled={disabled}
              onChange={(ev) => set('availableUntil', fromLocalInput(ev.target.value))}
            />
          </Field>
        </div>
      </Section>
    </div>
  );
}

// --- Catégories -------------------------------------------------------------------------

function CategoriesView() {
  return (
    <EntityPage<ShopCategory>
      title="Boutique : catégories"
      description="Onglets de la boutique : nom, icône, ordre."
      collection="shop-categories"
      entityKind="shopCategory"
      schema={shopCategorySchema}
      list={(w) => w.ctx.shopCategories as ShopCategory[]}
      getKey={(c) => c.id}
      searchText={(c) => `${c.id} ${c.name}`}
      renderListItem={(c, w) => (
        <>
          <span className="block truncate font-medium">{c.name}</span>
          <span className="block text-xs text-slate-500">
            {w.content.shopEntries.filter((e) => e.categoryId === c.id).length} article(s)
          </span>
        </>
      )}
      create={(w) => ({ id: '', name: '', icon: null, order: w.content.shopCategories.length })}
      duplicate={(c) => ({ ...c, id: `${c.id}-copie`, name: `${c.name} (copie)` })}
      renderForm={(p) => <CategoryForm {...p} />}
      newLabel="Nouvelle catégorie"
    />
  );
}

function CategoryForm({
  value: c,
  onChange,
  errors,
  isNew,
  editable,
  working,
}: EntityFormProps<ShopCategory>) {
  const set = <K extends keyof ShopCategory>(key: K, v: ShopCategory[K]) =>
    onChange({ ...c, [key]: v });
  const disabled = !editable;
  const entries = working.ctx.shopEntries.filter((e) => e.categoryId === c.id);
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
        <Field label="Nom de l’onglet" error={errors.get('name')}>
          <TextInput value={c.name} onChange={(v) => set('name', v)} disabled={disabled} />
        </Field>
        <Field
          label="Icône (URL)"
          hint="Vide : icône du premier article de la catégorie."
          error={errors.get('icon')}
        >
          <NullableTextInput value={c.icon} onChange={(v) => set('icon', v)} disabled={disabled} />
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
      {!isNew && (
        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
          {entries.length === 0
            ? 'Aucun article.'
            : entries.map((e) => (
                <span key={e.id} className="flex items-center gap-1">
                  <ItemIcon ctx={working.ctx} id={e.itemId} size={20} />
                  {working.ctx.item(e.itemId)?.name ?? e.itemId} ({money(e.price)})
                </span>
              ))}
        </div>
      )}
    </div>
  );
}

// --- Aperçu -----------------------------------------------------------------------------

const STATE_STYLES: Record<ShopEntryState, string> = {
  available: '',
  locked: 'opacity-60',
  soldOut: 'opacity-60',
  hidden: 'opacity-30 border-dashed',
};

/** La boutique telle qu'un joueur la voit, selon une progression simulée. */
function ShopPreview() {
  const working = useWorkingVersion();
  if (working.isPending) return <p className="text-slate-500">Chargement…</p>;
  if (!working.data) return <p className="text-red-600">{errorMessage(working.error)}</p>;
  return <ShopPreviewBody working={working.data} />;
}

function ShopPreviewBody({ working }: { working: WorkingVersion }) {
  const { ctx } = working;
  const [defeated, setDefeated] = useState<ReadonlySet<string>>(new Set());
  const [dexPercent, setDexPercent] = useState<Record<string, number>>({});
  const [eggsHatched, setEggsHatched] = useState(0);
  const [date, setDate] = useState(() => toLocalInput(new Date().toISOString()));
  const [showHidden, setShowHidden] = useState(true);

  // Espèces capturées : les N premières de chaque région, selon le pourcentage choisi.
  const progress: PlayerProgress = useMemo(() => {
    const caught = new Set<number>();
    for (const region of ctx.regions) {
      const n = Math.ceil(((dexPercent[region.id] ?? 0) / 100) * region.speciesIds.length);
      for (const id of region.speciesIds.slice(0, n)) caught.add(id);
    }
    return { caughtSpeciesIds: caught, defeatedTrainerIds: defeated, eggsHatched };
  }, [ctx, dexPercent, defeated, eggsHatched]);
  const at = date ? new Date(date) : new Date();

  const statuses = ctx.shopEntries.map((entry) => ({
    entry,
    status: shopEntryStatus(ctx, entry, progress, [], at),
  }));
  const count = (state: ShopEntryState) => statuses.filter((s) => s.status.state === state).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Boutique : aperçu joueur</h1>
        <p className="mt-1 text-slate-500">
          Simulez une progression (badges, Pokédex, œufs, date) pour voir ce que la boutique
          propose.
        </p>
      </div>
      <VersionBanner working={working} />

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <aside className="card space-y-4 p-4">
          <Field label="Date">
            <input
              type="datetime-local"
              className="input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          {ctx.regions.map((region) => (
            <Field
              key={region.id}
              label={`Pokédex de ${region.name}`}
              hint={`${regionDexProgress(ctx, region.id, progress).caught} / ${region.speciesIds.length} espèces`}
            >
              <input
                type="range"
                className="w-full"
                min={0}
                max={100}
                value={dexPercent[region.id] ?? 0}
                onChange={(e) =>
                  setDexPercent((p) => ({ ...p, [region.id]: e.target.valueAsNumber }))
                }
              />
              <span className="text-xs text-slate-500">{dexPercent[region.id] ?? 0} %</span>
            </Field>
          ))}
          <Field label="Œufs éclos">
            <NumberInput value={eggsHatched} min={0} onChange={(v) => setEggsHatched(v || 0)} />
          </Field>
          <div className="space-y-1">
            <p className="text-sm font-medium">Dresseurs battus</p>
            {ctx.trainers.map((t) => (
              <Toggle
                key={t.id}
                checked={defeated.has(t.id)}
                onChange={(on) => {
                  const next = new Set(defeated);
                  if (on) next.add(t.id);
                  else next.delete(t.id);
                  setDefeated(next);
                }}
                label={`${t.trainerClass} ${t.name}${t.badge ? ` (${t.badge.name})` : ''}`}
              />
            ))}
          </div>
        </aside>

        <section className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-slate-500">
              {count('available')} achetable(s) · {count('locked')} verrouillé(s) ·{' '}
              {count('hidden')} invisible(s)
            </span>
            <Toggle checked={showHidden} onChange={setShowHidden} label="Montrer les invisibles" />
          </div>
          {ctx.shopCategories.map((category) => {
            const inCategory = statuses.filter(
              (s) =>
                s.entry.categoryId === category.id && (showHidden || s.status.state !== 'hidden'),
            );
            if (inCategory.length === 0) return null;
            return (
              <div key={category.id}>
                <h2 className="mb-2 font-semibold">{category.name}</h2>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {inCategory.map(({ entry, status }) => (
                    <li
                      key={entry.id}
                      className={`card flex items-center gap-3 p-3 ${STATE_STYLES[status.state]}`}
                    >
                      <ItemIcon ctx={ctx} id={entry.itemId} size={36} />
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="flex justify-between gap-2 font-medium">
                          <span className="truncate">
                            {ctx.item(entry.itemId)?.name ?? entry.itemId}
                            {entry.lotSize > 1 && ` × ${entry.lotSize}`}
                          </span>
                          <span className="shrink-0">{money(entry.price)}</span>
                        </p>
                        <p className="text-xs text-slate-500">
                          {status.state === 'available' && 'Achetable'}
                          {status.state === 'locked' &&
                            `🔒 Verrouillé : ${unlockSummary(ctx, entry.unlock)}`}
                          {status.state === 'hidden' &&
                            (isOnSale(ctx, entry, at)
                              ? `Caché : ${unlockSummary(ctx, entry.unlock)}`
                              : entry.enabled
                                ? 'Hors des dates de disponibilité'
                                : 'Désactivé')}
                          {entry.purchaseLimit &&
                            ` · limite ${entry.purchaseLimit.lots} ${PERIOD_LABELS[entry.purchaseLimit.period]}`}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
