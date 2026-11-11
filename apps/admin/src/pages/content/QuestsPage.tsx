import { IMPOSED_WEATHERS, questSchema, unlockParts } from '@poke/content';
import type { Quest, QuestCondition, QuestExpeditionCondition, QuestStep } from '@poke/content';
import { types } from '@poke/data';
import { WEATHER_LABELS } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import { EntityPage } from '../../components/EntityPage';
import type { EntityFormProps } from '../../components/EntityPage';
import {
  Field,
  NullableTextInput,
  NumberInput,
  Section,
  TextInput,
  Toggle,
} from '../../components/forms/fields';
import type { FieldErrors } from '../../components/forms/fields';
import { emptyReward, rewardSummary, RewardEditor } from '../../components/forms/RewardEditor';
import { ItemSelect, SpeciesSelect, Sprite, UnlockEditor } from '../../components/forms/pickers';
import type { WorkingVersion } from '../../lib/content';
import { PokemonRewardsEditor } from './QuestPokemonEditor';

/** Quêtes : étapes ordonnées (conditions déclaratives) et récompenses, dont les légendaires. */

const newStep = (): QuestStep => ({
  name: 'Nouvelle étape',
  description: '',
  condition: { type: 'speciesCaught', count: 10 },
  outcome: '',
});

export function QuestsPage() {
  return (
    <EntityPage<Quest>
      title="Quêtes"
      description="Chaînes de quêtes : condition d’apparition, étapes validées dans l’ordre, récompenses ; les Pokémon (IV parfaits garantis) s’affrontent ensuite en combat légendaire, lancé depuis les Quêtes."
      collection="quests"
      entityKind="quest"
      schema={questSchema}
      list={(w) => [...w.ctx.quests]}
      getKey={(q) => q.id}
      searchText={(q, w) =>
        `${q.id} ${q.name} ${q.rewards.pokemon.map((p) => w.ctx.species(p.speciesId)?.nameFr).join(' ')}`
      }
      renderListItem={(q, w) => (
        <span className="flex items-center gap-2">
          {q.rewards.pokemon[0] ? (
            <Sprite
              id={q.rewards.pokemon[0].speciesId}
              formId={q.rewards.pokemon[0].formId}
              size={32}
            />
          ) : (
            <span className="inline-block w-8 text-center">📜</span>
          )}
          <span className="min-w-0">
            <span
              className={`block truncate font-medium ${q.enabled && (q.regionId === null || w.ctx.region(q.regionId)?.enabled !== false) ? '' : 'line-through'}`}
            >
              {q.name}
            </span>
            <span className="block text-xs text-slate-500">{q.steps.length} étape(s)</span>
          </span>
        </span>
      )}
      create={(w) => ({
        id: '',
        order: w.ctx.quests.length,
        name: '',
        description: '',
        image: null,
        regionId: w.ctx.regions[0]?.id ?? null,
        enabled: true,
        unlock: { type: 'always' },
        steps: [newStep()],
        rewards: { ...emptyReward(), pokemon: [] },
      })}
      duplicate={(q) => ({ ...structuredClone(q), id: `${q.id}-copie`, name: `${q.name} (copie)` })}
      renderForm={(p) => <QuestForm {...p} />}
      renderExtra={(q, w) => <QuestOverview quest={q} working={w} />}
      newLabel="Nouvelle quête"
    />
  );
}

function QuestForm({
  value: q,
  onChange,
  errors,
  isNew,
  editable,
  working,
}: EntityFormProps<Quest>) {
  const set = <K extends keyof Quest>(key: K, v: Quest[K]) => onChange({ ...q, [key]: v });
  const disabled = !editable;
  const { ctx } = working;
  const others = ctx.quests.filter((x) => x.id !== q.id);

  return (
    <div className="space-y-6">
      <QuestIdentityFields
        value={q}
        onChange={onChange}
        errors={errors}
        isNew={isNew}
        editable={editable}
        working={working}
      />
      <Toggle
        checked={q.enabled}
        onChange={(v) => set('enabled', v)}
        label="Quête activée (désactivée : cachée aux joueurs, elle ne progresse plus et sa récompense n’est plus réclamable)"
        disabled={disabled}
      />

      <Section title="Apparition">
        <p className="text-xs text-slate-500">
          La quête apparaît (et commence) quand la condition est remplie ; une quête commencée le
          reste même si la condition change.
        </p>
        <UnlockEditor
          value={q.unlock}
          onChange={(v) => set('unlock', v)}
          regions={ctx.regions}
          trainers={ctx.trainers}
          quests={others}
          disabled={disabled}
        />
      </Section>

      <QuestStepsSection
        value={q}
        onChange={onChange}
        errors={errors}
        isNew={isNew}
        editable={editable}
        working={working}
      />

      <Section title="Pokémon à capturer (combats légendaires)">
        <PokemonRewardsEditor
          ctx={ctx}
          value={q.rewards.pokemon}
          onChange={(pokemon) => set('rewards', { ...q.rewards, pokemon })}
          errors={errors}
          disabled={disabled}
        />
      </Section>

      <Section title="Autres récompenses">
        <RewardEditor
          ctx={ctx}
          value={q.rewards}
          onChange={(v) => set('rewards', { ...v, pokemon: q.rewards.pokemon })}
          errors={errors}
          prefix="rewards"
          disabled={disabled}
        />
      </Section>
    </div>
  );
}

/** Identité de la quête : identifiant, nom, description, région, ordre, illustration. */
function QuestIdentityFields({
  value: q,
  onChange,
  errors,
  isNew,
  editable,
  working,
}: EntityFormProps<Quest>) {
  const set = <K extends keyof Quest>(key: K, v: Quest[K]) => onChange({ ...q, [key]: v });
  const disabled = !editable;
  const { ctx } = working;

  return (
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
      <Field label="Description" error={errors.get('description')} className="sm:col-span-2">
        <TextInput
          value={q.description}
          onChange={(v) => set('description', v)}
          disabled={disabled}
          multiline
        />
      </Field>
      <Field
        label="Région"
        hint="Affichage, et région d’origine des Pokémon offerts."
        error={errors.get('regionId')}
      >
        <select
          className="input"
          value={q.regionId ?? ''}
          disabled={disabled}
          onChange={(e) => set('regionId', e.target.value || null)}
        >
          <option value="">Aucune</option>
          {ctx.regions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Ordre" error={errors.get('order')}>
        <NumberInput
          value={q.order}
          min={0}
          onChange={(v) => set('order', v)}
          disabled={disabled}
        />
      </Field>
      <Field
        label="Illustration (URL)"
        hint="Par défaut : artwork du premier Pokémon offert."
        error={errors.get('image')}
        className="sm:col-span-2"
      >
        <NullableTextInput value={q.image} onChange={(v) => set('image', v)} disabled={disabled} />
      </Field>
    </div>
  );
}

/** Étapes de la quête, dans l'ordre : condition et dénouement de chacune, ajout, déplacement, retrait. */
function QuestStepsSection({
  value: q,
  onChange,
  errors,
  editable,
  working,
}: EntityFormProps<Quest>) {
  const set = <K extends keyof Quest>(key: K, v: Quest[K]) => onChange({ ...q, [key]: v });
  const disabled = !editable;
  const { ctx } = working;
  const setStep = (i: number, step: QuestStep) =>
    set(
      'steps',
      q.steps.map((s, j) => (j === i ? step : s)),
    );
  const moveStep = (i: number, delta: number) => {
    const steps = [...q.steps];
    const [moved] = steps.splice(i, 1);
    steps.splice(i + delta, 0, moved!);
    set('steps', steps);
  };

  return (
    <Section title="Étapes">
      <p className="text-xs text-slate-500">
        Validées dans l’ordre. Une condition d’état (Pokédex, dresseur battu…) se valide dès qu’elle
        est remplie ; une action (captures, expédition, objet de quête) ne compte qu’à partir du
        début de l’étape, à la récupération des expéditions. Un objet de quête ne se trouve que
        pendant son étape.
      </p>
      {q.steps.map((step, i) => (
        <div
          key={i}
          className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-500">Étape {i + 1}</span>
            <div className="min-w-48 flex-1">
              <TextInput
                value={step.name}
                onChange={(name) => setStep(i, { ...step, name })}
                disabled={disabled}
              />
            </div>
            {editable && (
              <div className="flex gap-1">
                <button
                  type="button"
                  className="btn-ghost px-2 py-1 text-xs"
                  disabled={i === 0}
                  onClick={() => moveStep(i, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn-ghost px-2 py-1 text-xs"
                  disabled={i === q.steps.length - 1}
                  onClick={() => moveStep(i, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="px-2 text-slate-400 hover:text-red-600"
                  disabled={q.steps.length === 1}
                  onClick={() =>
                    set(
                      'steps',
                      q.steps.filter((_, j) => j !== i),
                    )
                  }
                >
                  ✕
                </button>
              </div>
            )}
          </div>
          {errors.get(`steps.${i}.name`) && (
            <p className="text-xs text-red-600">{errors.get(`steps.${i}.name`)}</p>
          )}
          <TextInput
            value={step.description}
            placeholder="Texte affiché au joueur"
            onChange={(description) => setStep(i, { ...step, description })}
            disabled={disabled}
          />
          <QuestConditionEditor
            ctx={ctx}
            questId={q.id}
            value={step.condition}
            onChange={(condition) => setStep(i, { ...step, condition })}
            errors={errors}
            prefix={`steps.${i}.condition`}
            disabled={disabled}
          />
          <Field
            label="Dénouement"
            hint="Affiché une fois l’étape validée : la suite de l’histoire (facultatif)."
            error={errors.get(`steps.${i}.outcome`)}
          >
            <TextInput
              value={step.outcome}
              onChange={(outcome) => setStep(i, { ...step, outcome })}
              disabled={disabled}
              multiline
            />
          </Field>
        </div>
      ))}
      {errors.get('steps') && <p className="text-xs text-red-600">{errors.get('steps')}</p>}
      {editable && (
        <button
          type="button"
          className="btn-ghost py-1 text-xs"
          onClick={() => set('steps', [...q.steps, newStep()])}
        >
          + Étape
        </button>
      )}
    </Section>
  );
}

type ConditionMode = 'catchPokemon' | 'expedition' | 'questItem' | 'state';

/** Props de l'éditeur de condition d'étape, que reçoivent aussi ses pièces. */
interface QuestConditionEditorProps {
  ctx: GameContext;
  questId: string;
  value: QuestCondition;
  onChange: (v: QuestCondition) => void;
  errors: FieldErrors;
  prefix: string;
  disabled: boolean;
}

/**
 * Condition d'une étape : action (captures, expédition, objet de quête) ou condition d'état
 * (brique de déblocage).
 */
function QuestConditionEditor({
  ctx,
  questId,
  value,
  onChange,
  errors,
  prefix,
  disabled,
}: QuestConditionEditorProps) {
  const mode: ConditionMode =
    value.type === 'catchPokemon' || value.type === 'expedition' || value.type === 'questItem'
      ? value.type
      : 'state';
  const initial = (m: ConditionMode): QuestCondition => {
    switch (m) {
      case 'catchPokemon':
        return { type: m, count: 10, pokemonType: null, speciesId: null, zoneId: null };
      case 'expedition':
        return {
          type: m,
          zoneId: ctx.zones[0]?.id ?? '',
          count: 1,
          memberType: null,
          memberCount: 1,
          minMemberPower: 0,
          speciesIds: [],
          weathers: [],
          timeOfDay: null,
        };
      case 'questItem':
        return {
          type: m,
          itemId: ctx.content.items.find((i) => i.category === 'quest')?.id ?? '',
          count: 1,
          zoneId: ctx.zones[0]?.id ?? '',
          chance: 10,
          memberType: null,
          memberCount: 0,
          minMemberPower: 0,
          speciesIds: [],
          weathers: [],
          timeOfDay: null,
        };
      case 'state':
        return { type: 'speciesCaught', count: 10 };
    }
  };

  return (
    <div className="space-y-2">
      <select
        className="input w-auto"
        value={mode}
        disabled={disabled}
        onChange={(e) => onChange(initial(e.target.value as ConditionMode))}
      >
        <option value="catchPokemon">Capturer des Pokémon (pendant l’étape)</option>
        <option value="expedition">Réussir une expédition (pendant l’étape)</option>
        <option value="questItem">Trouver un objet de quête (pendant l’étape)</option>
        <option value="state">Condition d’état (Pokédex, dresseur, badges, quête…)</option>
      </select>

      <CatchConditionFields
        ctx={ctx}
        questId={questId}
        value={value}
        onChange={onChange}
        errors={errors}
        prefix={prefix}
        disabled={disabled}
      />

      <ExpeditionConditionFields
        ctx={ctx}
        questId={questId}
        value={value}
        onChange={onChange}
        errors={errors}
        prefix={prefix}
        disabled={disabled}
      />

      <QuestItemConditionFields
        ctx={ctx}
        questId={questId}
        value={value}
        onChange={onChange}
        errors={errors}
        prefix={prefix}
        disabled={disabled}
      />

      {(value.type === 'expedition' || value.type === 'questItem') && (
        <ExpeditionRequirementsEditor
          ctx={ctx}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      )}

      {value.type !== 'catchPokemon' &&
        value.type !== 'expedition' &&
        value.type !== 'questItem' && (
          <>
            <p className="basis-full text-xs text-slate-500">
              « Avoir battu un dresseur » : seuls les dresseurs de cette quête (Dresseurs → Dresseur
              de quête) sont proposés ; ils apparaissent aux joueurs quand l’étape est atteinte.
            </p>
            <UnlockEditor
              value={value}
              onChange={onChange}
              regions={ctx.regions}
              trainers={ctx.trainers.filter((t) => t.questId === questId)}
              quests={ctx.quests.filter((q) => q.id !== questId)}
              disabled={disabled}
            />
          </>
        )}
    </div>
  );
}

/** Étape « capturer » : nombre de captures, type ou espèce, zone. */
function CatchConditionFields({
  ctx,
  value,
  onChange,
  errors,
  prefix,
  disabled,
}: QuestConditionEditorProps) {
  const err = (path: string) => errors.get(`${prefix}.${path}`);

  return (
    <>
      {value.type === 'catchPokemon' && (
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Nombre" error={err('count')}>
            <NumberInput
              className="w-32"
              value={value.count}
              min={1}
              unit="capture(s)"
              disabled={disabled}
              onChange={(count) => onChange({ ...value, count })}
            />
          </Field>
          <Field label="Type">
            <TypeOrAny
              value={value.pokemonType}
              onChange={(pokemonType) => onChange({ ...value, pokemonType })}
              disabled={disabled}
            />
          </Field>
          <Field label="Espèce (facultatif)">
            <div className="flex items-center gap-1">
              <SpeciesSelect
                ctx={ctx}
                value={value.speciesId}
                onChange={(speciesId) => onChange({ ...value, speciesId })}
                disabled={disabled}
              />
              {value.speciesId !== null && !disabled && (
                <button
                  type="button"
                  className="px-1 text-slate-400 hover:text-red-600"
                  onClick={() => onChange({ ...value, speciesId: null })}
                >
                  ✕
                </button>
              )}
            </div>
          </Field>
          <Field label="Zone" error={err('zoneId')}>
            <select
              className="input w-auto"
              value={value.zoneId ?? ''}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, zoneId: e.target.value || null })}
            >
              <option value="">Toute la région de la quête</option>
              {value.zoneId && !ctx.zone(value.zoneId) && (
                <option value={value.zoneId}>{value.zoneId} (inconnue)</option>
              )}
              {ctx.zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
    </>
  );
}

/** Étape « expédition » : zone, nombre de réussites, Pokémon exigés dans l'équipe (nombre, type, PE). */
function ExpeditionConditionFields({
  ctx,
  value,
  onChange,
  errors,
  prefix,
  disabled,
}: QuestConditionEditorProps) {
  const err = (path: string) => errors.get(`${prefix}.${path}`);

  return (
    <>
      {value.type === 'expedition' && (
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Zone" error={err('zoneId')}>
            <select
              className="input w-auto"
              value={value.zoneId}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, zoneId: e.target.value })}
            >
              {!ctx.zone(value.zoneId) && (
                <option value={value.zoneId}>{value.zoneId || '—'} (inconnue)</option>
              )}
              {ctx.zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Réussites" error={err('count')}>
            <NumberInput
              className="w-28"
              value={value.count}
              min={1}
              unit="fois"
              disabled={disabled}
              onChange={(count) => onChange({ ...value, count })}
            />
          </Field>
          <Field label="Avec au moins" error={err('memberCount')}>
            <NumberInput
              className="w-28"
              value={value.memberCount}
              min={0}
              max={6}
              unit="Pokémon"
              disabled={disabled}
              onChange={(memberCount) => onChange({ ...value, memberCount })}
            />
          </Field>
          <Field label="de type">
            <TypeOrAny
              value={value.memberType}
              onChange={(memberType) => onChange({ ...value, memberType })}
              disabled={disabled}
            />
          </Field>
          <Field label="PE individuelle ≥" error={err('minMemberPower')}>
            <NumberInput
              className="w-32"
              value={value.minMemberPower}
              min={0}
              step={50}
              unit="PE"
              disabled={disabled}
              onChange={(minMemberPower) => onChange({ ...value, minMemberPower })}
            />
          </Field>
        </div>
      )}
    </>
  );
}

/** Étape « objet de quête » : l'objet, la quantité, la zone, la chance par tirage de butin, l'équipe exigée. */
function QuestItemConditionFields({
  ctx,
  value,
  onChange,
  errors,
  prefix,
  disabled,
}: QuestConditionEditorProps) {
  const err = (path: string) => errors.get(`${prefix}.${path}`);

  return (
    <>
      {value.type === 'questItem' && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Objet" hint="Objets de la catégorie « quête »." error={err('itemId')}>
              <ItemSelect
                ctx={ctx}
                value={value.itemId || null}
                filter={(id) => ctx.item(id)?.category === 'quest'}
                onChange={(itemId) => onChange({ ...value, itemId: itemId ?? '' })}
                disabled={disabled}
              />
            </Field>
            <Field label="Quantité" error={err('count')}>
              <NumberInput
                className="w-24"
                value={value.count}
                min={1}
                max={99}
                unit="×"
                disabled={disabled}
                onChange={(count) => onChange({ ...value, count })}
              />
            </Field>
            <Field label="Zone" error={err('zoneId')}>
              <ZoneSelect
                ctx={ctx}
                value={value.zoneId}
                onChange={(zoneId) => onChange({ ...value, zoneId })}
                disabled={disabled}
              />
            </Field>
            <Field label="Chance par tirage de butin" error={err('chance')}>
              <NumberInput
                className="w-28"
                value={value.chance}
                min={0.1}
                max={100}
                step={1}
                unit="%"
                disabled={disabled}
                onChange={(chance) => onChange({ ...value, chance })}
              />
            </Field>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Avec au moins" error={err('memberCount')}>
              <NumberInput
                className="w-28"
                value={value.memberCount}
                min={0}
                max={6}
                unit="Pokémon"
                disabled={disabled}
                onChange={(memberCount) => onChange({ ...value, memberCount })}
              />
            </Field>
            <Field label="de type">
              <TypeOrAny
                value={value.memberType}
                onChange={(memberType) => onChange({ ...value, memberType })}
                disabled={disabled}
              />
            </Field>
            <Field label="PE individuelle ≥" error={err('minMemberPower')}>
              <NumberInput
                className="w-32"
                value={value.minMemberPower}
                min={0}
                step={50}
                unit="PE"
                disabled={disabled}
                onChange={(minMemberPower) => onChange({ ...value, minMemberPower })}
              />
            </Field>
          </div>
        </div>
      )}
    </>
  );
}

/** Zone d'une condition d'expédition, y compris une zone inconnue (supprimée). */
function ZoneSelect({
  ctx,
  value,
  onChange,
  disabled,
}: {
  ctx: GameContext;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <select
      className="input w-auto"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {!ctx.zone(value) && <option value={value}>{value || '—'} (inconnue)</option>}
      {ctx.zones.map((z) => (
        <option key={z.id} value={z.id}>
          {z.name}
        </option>
      ))}
    </select>
  );
}

/**
 * Conditions de départ d'une expédition de quête : Pokémon précis dans l'équipe, météo de la
 * zone au départ, moment du départ (heure locale du joueur).
 */
function ExpeditionRequirementsEditor<C extends QuestExpeditionCondition>({
  ctx,
  value,
  onChange,
  disabled,
}: {
  ctx: GameContext;
  value: C;
  onChange: (v: C) => void;
  disabled: boolean;
}) {
  const setSpecies = (speciesIds: number[]) => onChange({ ...value, speciesIds });
  const toggleWeather = (w: (typeof IMPOSED_WEATHERS)[number]) =>
    onChange({
      ...value,
      weathers: value.weathers.includes(w)
        ? value.weathers.filter((x) => x !== w)
        : [...value.weathers, w],
    });
  return (
    <div className="space-y-2 rounded-lg bg-slate-50 p-2 dark:bg-slate-900">
      <p className="text-xs font-semibold text-slate-500">Conditions de départ (facultatives)</p>
      <Field label="Pokémon dans l’équipe" hint="Toutes formes ; chacun doit être présent.">
        <div className="flex flex-wrap items-center gap-2">
          {value.speciesIds.map((id, i) => (
            <div key={i} className="flex items-center gap-1">
              <SpeciesSelect
                ctx={ctx}
                value={id}
                onChange={(speciesId) =>
                  setSpecies(value.speciesIds.map((x, j) => (j === i ? speciesId : x)))
                }
                disabled={disabled}
              />
              {!disabled && (
                <button
                  type="button"
                  className="px-1 text-slate-400 hover:text-red-600"
                  onClick={() => setSpecies(value.speciesIds.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {!disabled && value.speciesIds.length < 6 && (
            <button
              type="button"
              className="btn-ghost py-1 text-xs"
              onClick={() => setSpecies([...value.speciesIds, 25])}
            >
              + Pokémon
            </button>
          )}
        </div>
      </Field>
      <div className="flex flex-wrap items-end gap-4">
        <Field
          label="Météo au départ"
          hint="Aucune cochée : toutes. Celle de la zone, ou celle qu’impose un talent de l’équipe (Crachin, Sécheresse…)."
        >
          <div className="flex flex-wrap gap-3 text-sm">
            {IMPOSED_WEATHERS.map((w) => (
              <label key={w} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={value.weathers.includes(w)}
                  disabled={disabled}
                  onChange={() => toggleWeather(w)}
                />
                {WEATHER_LABELS[w]}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Moment du départ">
          <select
            className="input w-auto"
            value={value.timeOfDay ?? ''}
            disabled={disabled}
            onChange={(e) =>
              onChange({
                ...value,
                timeOfDay: (e.target.value || null) as C['timeOfDay'],
              })
            }
          >
            <option value="">Jour comme nuit</option>
            <option value="day">De jour</option>
            <option value="night">De nuit</option>
          </select>
        </Field>
      </div>
    </div>
  );
}

function TypeOrAny({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  disabled: boolean;
}) {
  return (
    <select
      className="input w-auto"
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">Tous types</option>
      {types.map((t) => (
        <option key={t.name} value={t.name}>
          {t.nameFr}
        </option>
      ))}
    </select>
  );
}

const isEmptyReward = (r: Quest['rewards']) =>
  r.currency === 0 &&
  r.items.length === 0 &&
  r.expeditionSlots + r.daycareSlots === 0 &&
  r.bonuses.length === 0;

/** Résumé : zones et contenus ouverts par la quête, récompense. */
function QuestOverview({ quest, working }: { quest: Quest; working: WorkingVersion }) {
  const { ctx } = working;
  const gated = [
    ...ctx.zones.map((z) => ({ kind: 'Zone', name: z.name, unlock: z.unlock })),
    ...ctx.trainers.map((t) => ({
      kind: 'Dresseur',
      name: `${t.trainerClass} ${t.name}`,
      unlock: t.unlock,
    })),
    ...ctx.quests.map((q) => ({ kind: 'Quête', name: q.name, unlock: q.unlock })),
  ].flatMap(({ unlock, ...e }) =>
    unlockParts(unlock)
      .filter(
        (u) =>
          (u.type === 'questStepsDone' || u.type === 'questCompleted') && u.questId === quest.id,
      )
      .map((u) => ({ ...e, unlock: u })),
  );
  return (
    <div className="card space-y-3 text-sm">
      <h3 className="font-semibold">Aperçu</h3>
      <p>
        <span className="text-slate-500">Récompense : </span>
        {[
          ...quest.rewards.pokemon.map(
            (p) => `${ctx.species(p.speciesId)?.nameFr ?? `#${p.speciesId}`} N.${p.level}`,
          ),
          ...(quest.rewards.pokemon.length === 0 || !isEmptyReward(quest.rewards)
            ? [rewardSummary(quest.rewards)]
            : []),
        ].join(' · ')}
      </p>
      <div>
        <p className="text-slate-500">Débloqué par cette quête :</p>
        {gated.length === 0 ? (
          <p className="text-xs text-slate-500">
            Rien (aucune condition ne dépend de cette quête).
          </p>
        ) : (
          <ul className="mt-1 list-inside list-disc text-xs">
            {gated.map((g, i) => (
              <li key={i}>
                {g.kind} « {g.name} » :{' '}
                {g.unlock.type === 'questCompleted'
                  ? 'quête terminée'
                  : `${'count' in g.unlock ? g.unlock.count : ''} étape(s) validée(s)`}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
