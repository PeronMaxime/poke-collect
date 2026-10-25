import { useMemo, useState } from 'react';
import {
  CHEST_RARITIES,
  CHEST_RARITY_LABELS,
  chestEntrySchema,
  guildQuestSchema,
} from '@poke/content';
import type {
  ChestEntry,
  ChestRarity,
  GuildObjective,
  GuildObjectiveType,
  GuildQuest,
} from '@poke/content';
import { chestCandidates, guildQuestTarget } from '@poke/game-core';
import type { GameContext, PlayerProgress } from '@poke/game-core';
import { types } from '@poke/data';
import { EntityPage, VersionBanner } from '../../components/EntityPage';
import type { EntityFormProps } from '../../components/EntityPage';
import {
  Field,
  NumberInput,
  Section,
  SelectInput,
  TextInput,
  Toggle,
} from '../../components/forms/fields';
import { ItemIcon, ItemSelect, TypeSelect, UnlockEditor } from '../../components/forms/pickers';
import { errorMessage, useWorkingVersion } from '../../lib/content';
import type { WorkingVersion } from '../../lib/content';
import { unlockSummary } from './ShopPage';

const VIEWS = [
  { id: 'quests', label: 'Quêtes de guilde' },
  { id: 'chests', label: 'Lots des coffres' },
  { id: 'preview', label: 'Aperçu des coffres' },
] as const;
type View = (typeof VIEWS)[number]['id'];

const RARITY_OPTIONS = CHEST_RARITIES.map((r) => ({ value: r, label: CHEST_RARITY_LABELS[r] }));

const OBJECTIVE_LABELS: Record<GuildObjectiveType, string> = {
  catchPokemon: 'Pokémon capturés',
  expeditions: 'Expéditions récupérées',
  battlesWon: 'Combats de dresseurs gagnés',
  dungeonsWon: 'Donjons réussis',
  eggsHatched: 'Œufs éclos',
  moneyEarned: 'Poké Dollars gagnés en combat',
};

const typeName = (type: string) => types.find((t) => t.name === type)?.nameFr ?? type;

function objectiveText(o: GuildObjective): string {
  return o.type === 'catchPokemon' && o.pokemonType
    ? `Pokémon ${typeName(o.pokemonType)} capturés`
    : OBJECTIVE_LABELS[o.type];
}

const newObjective = (type: GuildObjectiveType): GuildObjective =>
  type === 'catchPokemon' ? { type, pokemonType: null } : { type };

export function GuildsPage() {
  const [view, setView] = useState<View>('quests');
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
      {view === 'quests' && <QuestsView />}
      {view === 'chests' && <ChestsView />}
      {view === 'preview' && <ChestPreview />}
    </div>
  );
}

// --- Quêtes de guilde -------------------------------------------------------------------------

function QuestsView() {
  return (
    <EntityPage<GuildQuest>
      title="Guildes : quêtes"
      description="Catalogue des quêtes hebdomadaires. Chaque lundi à minuit (heure de Paris), chaque guilde tire des quêtes actives par rareté (nombre réglé dans l’équilibrage). Objectif = nombre par membre × membres au tirage, sans descendre sous le minimum."
      collection="guild-quests"
      entityKind="guildQuest"
      schema={guildQuestSchema}
      list={(w) =>
        [...w.ctx.guildQuests].sort(
          (a, b) =>
            CHEST_RARITIES.indexOf(a.rarity) - CHEST_RARITIES.indexOf(b.rarity) ||
            a.name.localeCompare(b.name),
        )
      }
      getKey={(q) => q.id}
      searchText={(q) => `${q.id} ${q.name} ${CHEST_RARITY_LABELS[q.rarity]}`}
      renderListItem={(q) => (
        <>
          <span className={`block truncate font-medium ${q.enabled ? '' : 'line-through'}`}>
            {q.name}
          </span>
          <span className="block truncate text-xs text-slate-500">
            {CHEST_RARITY_LABELS[q.rarity]} · {objectiveText(q.objective)} · {q.countPerMember}
            /membre (min. {q.minCount})
          </span>
        </>
      )}
      create={() => ({
        id: '',
        name: '',
        description: '',
        rarity: 'bronze',
        objective: { type: 'catchPokemon', pokemonType: null },
        countPerMember: 10,
        minCount: 20,
        enabled: true,
      })}
      duplicate={(q) => ({ ...structuredClone(q), id: `${q.id}-copie`, name: `${q.name} (copie)` })}
      renderForm={(p) => <QuestForm {...p} />}
      newLabel="Nouvelle quête"
    />
  );
}

function QuestForm({ value: q, onChange, errors, isNew, editable }: EntityFormProps<GuildQuest>) {
  const set = <K extends keyof GuildQuest>(key: K, v: GuildQuest[K]) =>
    onChange({ ...q, [key]: v });
  const disabled = !editable;
  const { objective } = q;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Identifiant"
          hint="Minuscules et tirets, non modifiable ensuite."
          error={errors.get('id')}
        >
          <TextInput value={q.id} onChange={(v) => set('id', v)} disabled={disabled || !isNew} />
        </Field>
        <Field label="Nom" error={errors.get('name')}>
          <TextInput value={q.name} onChange={(v) => set('name', v)} disabled={disabled} />
        </Field>
        <Field label="Description" error={errors.get('description')}>
          <TextInput
            value={q.description}
            onChange={(v) => set('description', v)}
            disabled={disabled}
          />
        </Field>
        <Field label="Difficulté (coffre gagné)" error={errors.get('rarity')}>
          <SelectInput
            value={q.rarity}
            onChange={(v) => set('rarity', v)}
            options={RARITY_OPTIONS}
            disabled={disabled}
          />
        </Field>
      </div>
      <Toggle
        checked={q.enabled}
        onChange={(v) => set('enabled', v)}
        label="Quête active (désactivée : plus tirée, les semaines en cours ne changent pas)"
        disabled={disabled}
      />
      <Section title="Objectif">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="À accomplir">
            <SelectInput
              value={objective.type}
              onChange={(type) => set('objective', newObjective(type))}
              options={Object.entries(OBJECTIVE_LABELS).map(([value, label]) => ({
                value: value as GuildObjectiveType,
                label,
              }))}
              disabled={disabled}
            />
          </Field>
          {objective.type === 'catchPokemon' && (
            <Field label="Type des Pokémon" error={errors.get('objective.pokemonType')}>
              <Toggle
                checked={objective.pokemonType !== null}
                onChange={(on) =>
                  set('objective', { ...objective, pokemonType: on ? 'water' : null })
                }
                label="Seulement un type"
                disabled={disabled}
              />
              {objective.pokemonType !== null && (
                <TypeSelect
                  value={objective.pokemonType}
                  onChange={(pokemonType) => set('objective', { ...objective, pokemonType })}
                  disabled={disabled}
                />
              )}
            </Field>
          )}
          <Field label="Par membre" error={errors.get('countPerMember')}>
            <NumberInput
              value={q.countPerMember}
              min={1}
              onChange={(v) => set('countPerMember', v)}
              disabled={disabled}
            />
          </Field>
          <Field
            label="Minimum"
            hint="Objectif des petites guildes."
            error={errors.get('minCount')}
          >
            <NumberInput
              value={q.minCount}
              min={1}
              onChange={(v) => set('minCount', v)}
              disabled={disabled}
            />
          </Field>
        </div>
        <p className="text-xs text-slate-500">
          Objectif : {[1, 5, 10, 30].map((n) => `${guildQuestTarget(q, n)} à ${n}`).join(' · ')}{' '}
          membre(s).
        </p>
      </Section>
    </div>
  );
}

// --- Lots des coffres --------------------------------------------------------------------------

function ChestsView() {
  return (
    <EntityPage<ChestEntry>
      title="Guildes : lots des coffres"
      description="À l’ouverture, chaque tirage d’un coffre choisit un lot parmi ceux de sa rareté que le joueur a débloqués, selon leur poids. Tirages par coffre : équilibrage."
      collection="chest-entries"
      entityKind="chestEntry"
      schema={chestEntrySchema}
      list={(w) =>
        [...w.ctx.chestEntries].sort(
          (a, b) =>
            CHEST_RARITIES.indexOf(a.rarity) - CHEST_RARITIES.indexOf(b.rarity) ||
            b.weight - a.weight,
        )
      }
      getKey={(e) => e.id}
      searchText={(e, w) =>
        `${e.id} ${e.itemId} ${w.ctx.item(e.itemId)?.name ?? ''} ${CHEST_RARITY_LABELS[e.rarity]}`
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
              {CHEST_RARITY_LABELS[e.rarity]} · poids {e.weight}
              {e.unlock.type !== 'always' && ` · 🔒 ${unlockSummary(w.ctx, e.unlock)}`}
            </span>
          </span>
        </span>
      )}
      create={(w) => ({
        id: '',
        rarity: 'bronze',
        itemId: w.content.items[0]?.id ?? '',
        lotSize: 1,
        weight: 10,
        unlock: { type: 'always' },
        enabled: true,
      })}
      duplicate={(e) => ({ ...structuredClone(e), id: `${e.id}-copie` })}
      renderForm={(p) => <ChestEntryForm {...p} />}
      newLabel="Nouveau lot"
    />
  );
}

function ChestEntryForm({
  value: e,
  onChange,
  errors,
  isNew,
  editable,
  working,
}: EntityFormProps<ChestEntry>) {
  const set = <K extends keyof ChestEntry>(key: K, v: ChestEntry[K]) =>
    onChange({ ...e, [key]: v });
  const { ctx } = working;
  const disabled = !editable;
  const sameRarity = ctx.chestEntries.filter((o) => o.enabled && o.rarity === e.rarity);
  const total =
    sameRarity.filter((o) => o.id !== e.id).reduce((n, o) => n + o.weight, 0) +
    (e.enabled ? e.weight : 0);
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
        <Field label="Coffre" error={errors.get('rarity')}>
          <SelectInput
            value={e.rarity}
            onChange={(v) => set('rarity', v)}
            options={RARITY_OPTIONS}
            disabled={disabled}
          />
        </Field>
        <Field label="Objet" error={errors.get('itemId')}>
          <ItemSelect
            ctx={ctx}
            value={e.itemId}
            onChange={(v) => v && set('itemId', v)}
            disabled={disabled}
          />
        </Field>
        <Field label="Quantité" error={errors.get('lotSize')}>
          <NumberInput
            value={e.lotSize}
            min={1}
            max={999}
            unit="objet(s)"
            onChange={(v) => set('lotSize', v)}
            disabled={disabled}
          />
        </Field>
        <Field
          label="Poids"
          hint={
            e.enabled && total > 0
              ? `${((e.weight / total) * 100).toFixed(1)} % des tirages quand tous les lots ${CHEST_RARITY_LABELS[e.rarity]} sont débloqués`
              : undefined
          }
          error={errors.get('weight')}
        >
          <NumberInput
            value={e.weight}
            min={0.1}
            step={0.5}
            onChange={(v) => set('weight', v)}
            disabled={disabled}
          />
        </Field>
      </div>
      <Toggle
        checked={e.enabled}
        onChange={(v) => set('enabled', v)}
        label="Lot actif"
        disabled={disabled}
      />
      <Section title="Débloqué quand">
        <UnlockEditor
          value={e.unlock}
          regions={ctx.regions}
          trainers={ctx.trainers}
          quests={ctx.quests}
          onChange={(v) => set('unlock', v)}
          disabled={disabled}
        />
      </Section>
    </div>
  );
}

// --- Aperçu -----------------------------------------------------------------------------------

function ChestPreview() {
  const working = useWorkingVersion();
  if (working.isPending) return <p className="text-slate-500">Chargement…</p>;
  if (!working.data) return <p className="text-red-600">{errorMessage(working.error)}</p>;
  return <ChestPreviewBody working={working.data} />;
}

/** Chances de chaque lot selon une progression simulée (dresseurs battus, Pokédex, œufs). */
function ChestPreviewBody({ working }: { working: WorkingVersion }) {
  const { ctx } = working;
  const [defeated, setDefeated] = useState<ReadonlySet<string>>(new Set());
  const [species, setSpecies] = useState(0);
  const [eggsHatched, setEggsHatched] = useState(0);
  const progress: PlayerProgress = useMemo(() => {
    // Espèces capturées : les N premières des régions, dans l'ordre.
    const ids = ctx.regions.flatMap((r) => r.speciesIds).slice(0, species);
    return { caughtSpeciesIds: new Set(ids), defeatedTrainerIds: defeated, eggsHatched };
  }, [ctx, species, defeated, eggsHatched]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Guildes : aperçu des coffres</h1>
        <p className="mt-1 text-slate-500">
          Simulez une progression pour voir ce que chaque coffre peut donner, et avec quelles
          chances par tirage.
        </p>
      </div>
      <VersionBanner working={working} />
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <aside className="card space-y-4 p-4">
          <Field label="Espèces capturées">
            <NumberInput value={species} min={0} onChange={(v) => setSpecies(v || 0)} />
          </Field>
          <Field label="Œufs éclos">
            <NumberInput value={eggsHatched} min={0} onChange={(v) => setEggsHatched(v || 0)} />
          </Field>
          <div className="space-y-1">
            <p className="text-sm font-medium">Dresseurs battus</p>
            {ctx.trainers
              .filter((t) => t.badge || !t.repeatable)
              .map((t) => (
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
        <section className="grid min-w-0 gap-4 xl:grid-cols-3">
          {CHEST_RARITIES.map((rarity) => (
            <ChestOdds key={rarity} ctx={ctx} rarity={rarity} progress={progress} />
          ))}
        </section>
      </div>
    </div>
  );
}

function ChestOdds({
  ctx,
  rarity,
  progress,
}: {
  ctx: GameContext;
  rarity: ChestRarity;
  progress: PlayerProgress;
}) {
  const lots = chestCandidates(ctx, rarity, progress);
  const total = lots.reduce((n, e) => n + e.weight, 0);
  return (
    <div className="card space-y-2 p-4">
      <h2 className="font-semibold">
        Coffre {CHEST_RARITY_LABELS[rarity]}{' '}
        <span className="text-sm font-normal text-slate-500">
          ({ctx.balance.guilds.chestRolls[rarity]} tirage(s))
        </span>
      </h2>
      {lots.length === 0 && <p className="text-sm text-red-600">Aucun lot débloqué.</p>}
      <ul className="space-y-1 text-sm">
        {[...lots]
          .sort((a, b) => b.weight - a.weight)
          .map((e) => (
            <li key={e.id} className="flex items-center gap-2">
              <ItemIcon ctx={ctx} id={e.itemId} size={24} />
              <span className="flex-1 truncate">
                {ctx.item(e.itemId)?.name ?? e.itemId}
                {e.lotSize > 1 && ` × ${e.lotSize}`}
              </span>
              <span className="font-mono text-xs">{((e.weight / total) * 100).toFixed(1)} %</span>
            </li>
          ))}
      </ul>
    </div>
  );
}
