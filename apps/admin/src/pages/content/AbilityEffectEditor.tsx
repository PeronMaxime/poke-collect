import {
  ABILITY_EFFECT_TYPES,
  ABILITY_PARAM_IDS,
  DUNGEON_STATS,
  IMPOSED_WEATHERS,
  STATUSES,
  WEATHERS,
} from '@poke/content';
import type {
  AbilityCondition,
  AbilityConditionType,
  AbilityEffect,
  AbilityEffectType,
  AbilityParam,
  ImposedWeather,
  Status,
} from '@poke/content';
import {
  ABILITY_ACTIVITY_LABELS,
  ABILITY_CONDITION_LABELS,
  ABILITY_EFFECT_LABELS,
  ABILITY_PARAMS,
  DUNGEON_STAT_LABELS,
  STATE_CONDITION_TYPES,
  STATE_STAT_PARAMS,
  STATUS_LABELS,
  WEATHER_LABELS,
} from '@poke/game-core';
import { Field, NumberInput, SelectInput } from '../../components/forms/fields';
import type { FieldErrors } from '../../components/forms/fields';
import { TypeMultiSelect, TypeSelect } from '../../components/forms/pickers';

/** Paramètres groupés pour la liste déroulante (Général, Expéditions…). */
const PARAM_GROUPS = [...new Set(ABILITY_PARAM_IDS.map((p) => ABILITY_PARAMS[p].group))].map(
  (group) => ({
    group,
    params: ABILITY_PARAM_IDS.filter((p) => ABILITY_PARAMS[p].group === group),
  }),
);

const EFFECT_HELP: Record<AbilityEffectType, string> = {
  modifier: 'Modifie un paramètre du jeu.',
  attractType: 'Expédition : les Pokémon de ce type apparaissent plus (ou moins) souvent.',
  syncNature: 'Expédition : chance que chaque sauvage ait la nature de ce Pokémon.',
  attractGender: 'Expédition : chance que chaque sauvage soit du genre opposé à ce Pokémon.',
  immunity:
    'Donjon : insensible aux attaques de ce type, et soigne une part de ses PV max à chaque attaque absorbée (Lévitation, Absorbe-Eau).',
  sturdy:
    'Donjon : survit à 1 PV à un coup fatal reçu PV au maximum, une fois par combat (Fermeté).',
  regenerator: 'Donjon : soigne une part de ses PV max quand le joueur le rappelle (Régé-Force).',
  speedBoost: 'Donjon : Vitesse augmentée après chacune de ses attaques, jusqu’à ×3 (Turbo).',
  moxie: 'Donjon : Attaque et Attaque Spéciale augmentées après chaque K.O. infligé (Impudence).',
  intimidate:
    'Donjon : à son entrée en combat, baisse les statistiques choisies du Pokémon en face (Intimidation).',
  contactDamage:
    'Donjon : l’attaquant perd une part de ses PV max à chaque attaque physique reçue (Peau Dure, Épine de Fer).',
  aftermath:
    'Donjon : mis K.O. par une attaque physique, inflige une part des PV max de l’attaquant (Boom Final).',
  setWeather:
    'Impose sa météo à l’expédition ou au donjon, ou le temps clair pour annuler celle du lieu (le premier de l’équipe qui en impose une l’emporte).',
  inflictStatus:
    'Donjon : chance d’infliger un statut, à qui le frappe d’une attaque physique (Statik) ou au Pokémon qu’il frappe (Toxitouche).',
  statusImmunity:
    'Donjon : insensible à ces statuts (Insomnia, Vaccin, Échauffement), ou toute l’équipe (Voile Aroma).',
  naturalCure: 'Donjon : guéri de son statut quand le joueur le rappelle (Médic Nature).',
  critImmunity: 'Donjon : ne subit jamais de coup critique (Armurbaston, Coque Armure).',
  copyZoneAffinity:
    'Expédition et légendaires : compte comme ayant le type d’affinité de la zone, donc donne le bonus de capture d’affinité (Calque).',
  suppressAbility:
    'Donjon : tant qu’il est sur le terrain, le Pokémon en face perd son talent et les bonus d’équipe reçus (Gaz Inhibiteur). Seulement utile si les talents des adversaires sont activés (Équilibrage).',
  weatherImmunity:
    'Donjon : insensible aux dégâts de la tempête de sable et de la grêle (Envelocape).',
};

/** Choix multiple parmi des valeurs (météos, statuts). */
function ChipsSelect<T extends string>({
  options,
  labels,
  value,
  onChange,
  disabled,
}: {
  options: readonly T[];
  labels: Record<T, string>;
  value: readonly T[];
  onChange: (v: T[]) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button
            key={o}
            type="button"
            disabled={disabled}
            onClick={() => onChange(on ? value.filter((v) => v !== o) : [...value, o])}
            className={`rounded-full px-2 py-0.5 text-xs font-medium transition ${
              on ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
            }`}
          >
            {labels[o]}
          </button>
        );
      })}
    </div>
  );
}

/** Conditions « de l'instant » : évaluées à chaque attaque, seulement pour les dégâts en donjon. */
const DUNGEON_ONLY_CONDITIONS = new Set<AbilityConditionType>([
  'hpBelow',
  'fullHp',
  'attackType',
  'attackCategory',
  'statused',
  'superEffective',
  'notVeryEffective',
]);
const NO_CONDITIONS: ReadonlySet<AbilityConditionType> = new Set();

function newEffect(type: AbilityEffectType): AbilityEffect {
  switch (type) {
    case 'modifier':
      return { type, param: 'power', value: 10, scope: 'self', conditions: [] };
    case 'attractType':
      return { type, pokemonType: 'electric', percent: 50, conditions: [] };
    case 'syncNature':
    case 'attractGender':
      return { type, chance: 0.5, conditions: [] };
    case 'immunity':
      return { type, attackType: 'ground', heal: 0, conditions: [] };
    case 'sturdy':
      return { type, conditions: [] };
    case 'regenerator':
      return { type, fraction: 0.33, conditions: [] };
    case 'speedBoost':
    case 'moxie':
      return { type, percent: 10, conditions: [] };
    case 'intimidate':
      return { type, percent: 25, stats: ['attack', 'special-attack'], conditions: [] };
    case 'contactDamage':
      return { type, fraction: 0.125, conditions: [] };
    case 'aftermath':
      return { type, fraction: 0.25, conditions: [] };
    case 'setWeather':
      return { type, weather: 'sun', conditions: [] };
    case 'inflictStatus':
      return { type, status: 'paralysis', chance: 0.3, trigger: 'contact', conditions: [] };
    case 'statusImmunity':
      return { type, statuses: ['sleep'], scope: 'self', conditions: [] };
    case 'naturalCure':
    case 'weatherImmunity':
    case 'critImmunity':
    case 'copyZoneAffinity':
    case 'suppressAbility':
      return { type, conditions: [] };
  }
}

const CONDITION_TYPES = Object.keys(ABILITY_CONDITION_LABELS) as AbilityConditionType[];

function newCondition(type: AbilityConditionType): AbilityCondition {
  switch (type) {
    case 'zoneType':
    case 'opponentType':
    case 'teamHasType':
      return { type, types: [] };
    case 'timeOfDay':
      return { type, time: 'night' };
    case 'leader':
    case 'solo':
    case 'fullHp':
    case 'statused':
    case 'superEffective':
    case 'notVeryEffective':
      return { type };
    case 'weather':
      return { type, weathers: ['sun'] };
    case 'hpBelow':
      return { type, fraction: 1 / 3 };
    case 'attackType':
      return { type, types: [] };
    case 'attackCategory':
      return { type, category: 'special' };
  }
}

export function AbilityEffectEditor({
  effects,
  onChange,
  errors,
  editable,
}: {
  effects: AbilityEffect[];
  onChange: (effects: AbilityEffect[]) => void;
  errors: FieldErrors;
  editable: boolean;
}) {
  return (
    <section className="space-y-3">
      <h3 className="font-semibold">Effets en jeu</h3>
      {effects.length === 0 && (
        <p className="text-sm text-slate-500">Aucun effet pour l’instant.</p>
      )}
      {effects.map((effect, i) => (
        <EffectRow
          key={i}
          effect={effect}
          errors={errors}
          path={`effects.${i}`}
          editable={editable}
          onChange={(e) => onChange(effects.map((x, j) => (j === i ? e : x)))}
          onRemove={() => onChange(effects.filter((_, j) => j !== i))}
        />
      ))}
      {editable && (
        <div className="flex flex-wrap gap-2">
          {ABILITY_EFFECT_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className="btn-ghost py-1 text-xs"
              onClick={() => onChange([...effects, newEffect(type)])}
            >
              + {ABILITY_EFFECT_LABELS[type]}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function EffectRow({
  effect,
  errors,
  path,
  editable,
  onChange,
  onRemove,
}: {
  effect: AbilityEffect;
  errors: FieldErrors;
  path: string;
  editable: boolean;
  onChange: (e: AbilityEffect) => void;
  onRemove: () => void;
}) {
  const disabled = !editable;
  const param = effect.type === 'modifier' ? ABILITY_PARAMS[effect.param] : null;
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{ABILITY_EFFECT_LABELS[effect.type]}</p>
          <p className="text-xs text-slate-500">
            {param
              ? `${param.help} (${param.activities.map((a) => ABILITY_ACTIVITY_LABELS[a]).join(', ')})`
              : EFFECT_HELP[effect.type]}
          </p>
        </div>
        {editable && (
          <button
            type="button"
            className="text-slate-400 hover:text-red-600"
            aria-label="Retirer cet effet"
            onClick={onRemove}
          >
            ✕
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {effect.type === 'modifier' && (
          <>
            <Field label="Paramètre">
              <select
                className="input"
                value={effect.param}
                disabled={disabled}
                onChange={(e) => {
                  const p = e.target.value as AbilityParam;
                  onChange({
                    ...effect,
                    param: p,
                    scope: ABILITY_PARAMS[p].selfScope ? effect.scope : 'team',
                  });
                }}
              >
                {PARAM_GROUPS.map(({ group, params }) => (
                  <optgroup key={group} label={group}>
                    {params.map((p) => (
                      <option key={p} value={p}>
                        {ABILITY_PARAMS[p].label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </Field>
            <Field label="Valeur" error={errors.get(`${path}.value`)}>
              <NumberInput
                className="w-32"
                value={effect.value}
                unit={param!.unit}
                disabled={disabled}
                onChange={(value) => onChange({ ...effect, value })}
              />
            </Field>
            {param!.selfScope && (
              <Field label="Pour">
                <SelectInput
                  value={effect.scope}
                  disabled={disabled}
                  options={[
                    { value: 'self', label: 'Le Pokémon seul' },
                    { value: 'team', label: 'Toute l’équipe' },
                  ]}
                  onChange={(scope) => onChange({ ...effect, scope })}
                />
              </Field>
            )}
          </>
        )}
        {effect.type === 'attractType' && (
          <>
            <Field label="Type">
              <TypeSelect
                value={effect.pokemonType}
                disabled={disabled}
                onChange={(pokemonType) => onChange({ ...effect, pokemonType })}
              />
            </Field>
            <Field label="Poids des rencontres" error={errors.get(`${path}.percent`)}>
              <NumberInput
                className="w-32"
                value={effect.percent}
                unit="%"
                disabled={disabled}
                onChange={(percent) => onChange({ ...effect, percent })}
              />
            </Field>
          </>
        )}
        {effect.type === 'immunity' && (
          <>
            <Field label="Type d’attaque">
              <TypeSelect
                value={effect.attackType}
                disabled={disabled}
                onChange={(attackType) => onChange({ ...effect, attackType })}
              />
            </Field>
            <Field label="Soin par attaque absorbée" error={errors.get(`${path}.heal`)}>
              <NumberInput
                className="w-32"
                value={effect.heal}
                scale={100}
                min={0}
                max={100}
                unit="% PV"
                disabled={disabled}
                onChange={(heal) => onChange({ ...effect, heal })}
              />
            </Field>
          </>
        )}
        {(effect.type === 'regenerator' ||
          effect.type === 'contactDamage' ||
          effect.type === 'aftermath') && (
          <Field label="Part des PV max" error={errors.get(`${path}.fraction`)}>
            <NumberInput
              className="w-32"
              value={effect.fraction}
              scale={100}
              min={0}
              max={100}
              unit="%"
              disabled={disabled}
              onChange={(fraction) => onChange({ ...effect, fraction })}
            />
          </Field>
        )}
        {(effect.type === 'speedBoost' ||
          effect.type === 'moxie' ||
          effect.type === 'intimidate') && (
          <Field label="Variation" error={errors.get(`${path}.percent`)}>
            <NumberInput
              className="w-32"
              value={effect.percent}
              min={1}
              max={100}
              unit="%"
              disabled={disabled}
              onChange={(percent) => onChange({ ...effect, percent })}
            />
          </Field>
        )}
        {effect.type === 'intimidate' && (
          <Field label="Statistiques baissées" error={errors.get(`${path}.stats`)}>
            <ChipsSelect
              options={DUNGEON_STATS}
              labels={DUNGEON_STAT_LABELS}
              value={effect.stats}
              disabled={disabled}
              onChange={(stats) => onChange({ ...effect, stats })}
            />
          </Field>
        )}
        {effect.type === 'setWeather' && (
          <Field label="Météo">
            <SelectInput<ImposedWeather>
              value={effect.weather}
              disabled={disabled}
              options={IMPOSED_WEATHERS.map((w) => ({ value: w, label: WEATHER_LABELS[w] }))}
              onChange={(weather) => onChange({ ...effect, weather })}
            />
          </Field>
        )}
        {effect.type === 'inflictStatus' && (
          <>
            <Field label="Statut">
              <SelectInput<Status>
                value={effect.status}
                disabled={disabled}
                options={STATUSES.map((st) => ({ value: st, label: STATUS_LABELS[st] }))}
                onChange={(status) => onChange({ ...effect, status })}
              />
            </Field>
            <Field label="Déclencheur">
              <SelectInput
                value={effect.trigger}
                disabled={disabled}
                options={[
                  { value: 'contact', label: 'Quand il est frappé (physique)' },
                  { value: 'attack', label: 'Quand il frappe' },
                ]}
                onChange={(trigger) => onChange({ ...effect, trigger })}
              />
            </Field>
            <Field label="Chance" error={errors.get(`${path}.chance`)}>
              <NumberInput
                className="w-28"
                value={effect.chance}
                scale={100}
                min={0}
                max={100}
                unit="%"
                disabled={disabled}
                onChange={(chance) => onChange({ ...effect, chance })}
              />
            </Field>
          </>
        )}
        {effect.type === 'statusImmunity' && (
          <>
            <Field label="Statuts" error={errors.get(`${path}.statuses`)}>
              <ChipsSelect
                options={STATUSES}
                labels={STATUS_LABELS}
                value={effect.statuses}
                disabled={disabled}
                onChange={(statuses) => onChange({ ...effect, statuses })}
              />
            </Field>
            <Field label="Pour">
              <SelectInput
                value={effect.scope ?? 'self'}
                disabled={disabled}
                options={[
                  { value: 'self', label: 'Le Pokémon seul' },
                  { value: 'team', label: 'Toute l’équipe' },
                ]}
                onChange={(scope) => onChange({ ...effect, scope })}
              />
            </Field>
          </>
        )}
        {(effect.type === 'syncNature' || effect.type === 'attractGender') && (
          <Field label="Chance" error={errors.get(`${path}.chance`)}>
            <NumberInput
              className="w-32"
              value={effect.chance}
              scale={100}
              min={0}
              max={100}
              unit="%"
              disabled={disabled}
              onChange={(chance) => onChange({ ...effect, chance })}
            />
          </Field>
        )}
      </div>

      <ConditionsEditor
        conditions={effect.conditions}
        errors={errors}
        path={`${path}.conditions`}
        editable={editable}
        instantAllowed={
          effect.type !== 'modifier'
            ? NO_CONDITIONS
            : effect.param === 'damageDealt' || effect.param === 'damageTaken'
              ? DUNGEON_ONLY_CONDITIONS
              : STATE_STAT_PARAMS.has(effect.param)
                ? STATE_CONDITION_TYPES
                : NO_CONDITIONS
        }
        onChange={(conditions) => onChange({ ...effect, conditions })}
      />
    </div>
  );
}

function ConditionsEditor({
  conditions,
  errors,
  path,
  editable,
  instantAllowed,
  onChange,
}: {
  conditions: AbilityCondition[];
  errors: FieldErrors;
  path: string;
  editable: boolean;
  /** Conditions de l'instant acceptées : toutes pour les dégâts, PV et statut pour les statistiques. */
  instantAllowed: ReadonlySet<AbilityConditionType>;
  onChange: (c: AbilityCondition[]) => void;
}) {
  const disabled = !editable;
  const misplaced = conditions.some(
    (c) => DUNGEON_ONLY_CONDITIONS.has(c.type) && !instantAllowed.has(c.type),
  );
  return (
    <div className="space-y-2 border-t border-slate-100 pt-2 dark:border-slate-800">
      <p className="text-xs font-medium text-slate-500">
        {conditions.length === 0 ? 'Toujours actif' : 'Seulement si (toutes les conditions) :'}
      </p>
      {misplaced && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          ⚠️ Les conditions de l’instant ne jouent qu’en donjon : PV et statut pour les dégâts et
          les statistiques (hors PV max), type, catégorie et efficacité d’attaque pour les dégâts
          seulement. Ici, l’effet ne s’activera jamais.
        </p>
      )}
      {conditions.map((condition, i) => {
        const update = (c: AbilityCondition) =>
          onChange(conditions.map((x, j) => (j === i ? c : x)));
        return (
          <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{ABILITY_CONDITION_LABELS[condition.type]}</span>
            {(condition.type === 'zoneType' ||
              condition.type === 'opponentType' ||
              condition.type === 'teamHasType' ||
              condition.type === 'attackType') && (
              <div className="min-w-0 flex-1">
                <TypeMultiSelect
                  value={condition.types}
                  disabled={disabled}
                  onChange={(types) => update({ ...condition, types })}
                />
                {errors.get(`${path}.${i}.types`) && (
                  <p className="text-xs text-red-600">Choisissez au moins un type.</p>
                )}
              </div>
            )}
            {condition.type === 'weather' && (
              <ChipsSelect
                options={WEATHERS}
                labels={WEATHER_LABELS}
                value={condition.weathers}
                disabled={disabled}
                onChange={(weathers) => update({ ...condition, weathers })}
              />
            )}
            {condition.type === 'hpBelow' && (
              <NumberInput
                className="w-28"
                value={condition.fraction}
                scale={100}
                min={1}
                max={100}
                unit="%"
                disabled={disabled}
                onChange={(fraction) => update({ ...condition, fraction })}
              />
            )}
            {condition.type === 'attackCategory' && (
              <SelectInput
                value={condition.category}
                disabled={disabled}
                options={[
                  { value: 'physical', label: 'Physique' },
                  { value: 'special', label: 'Spéciale' },
                ]}
                onChange={(category) => update({ ...condition, category })}
              />
            )}
            {condition.type === 'timeOfDay' && (
              <SelectInput
                value={condition.time}
                disabled={disabled}
                options={[
                  { value: 'day', label: 'De jour' },
                  { value: 'night', label: 'De nuit' },
                ]}
                onChange={(time) => update({ ...condition, time })}
              />
            )}
            {editable && (
              <button
                type="button"
                className="text-slate-400 hover:text-red-600"
                aria-label="Retirer cette condition"
                onClick={() => onChange(conditions.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            )}
          </div>
        );
      })}
      {editable && (
        <select
          className="input w-auto py-1 text-xs"
          value=""
          onChange={(e) => {
            if (e.target.value) {
              onChange([...conditions, newCondition(e.target.value as AbilityConditionType)]);
            }
          }}
        >
          <option value="">+ Ajouter une condition…</option>
          {CONDITION_TYPES.map((t) => (
            <option key={t} value={t}>
              {ABILITY_CONDITION_LABELS[t]}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
