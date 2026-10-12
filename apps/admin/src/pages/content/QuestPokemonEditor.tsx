import { defaultLegendaryExpedition } from '@poke/content';
import type { LegendaryExpedition, QuestPokemon } from '@poke/content';
import { pokemonTypes, typeWeaknesses } from '@poke/data';
import type { GameContext } from '@poke/game-core';
import { Field, NumberInput } from '../../components/forms/fields';
import type { FieldErrors } from '../../components/forms/fields';
import {
  FormSelect,
  SpeciesSelect,
  TypeMultiSelect,
  TypeSelect,
} from '../../components/forms/pickers';

/**
 * Pokémon de la récompense d'une quête : espèce, niveau, IV parfaits garantis, et l'expédition
 * légendaire qui permet de le capturer (une seule Ball lancée).
 */
export function PokemonRewardsEditor({
  ctx,
  value,
  onChange,
  errors,
  disabled,
}: {
  ctx: GameContext;
  value: QuestPokemon[];
  onChange: (v: QuestPokemon[]) => void;
  errors: FieldErrors;
  disabled: boolean;
}) {
  const update = (i: number, patch: Partial<QuestPokemon>) =>
    onChange(value.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  /** Changement d'espèce ou de forme : les affinités reprennent ses faiblesses. */
  const setSpecies = (i: number, speciesId: number, formId: number | null) =>
    update(i, {
      speciesId,
      formId,
      expedition: {
        ...value[i]!.expedition,
        affinityTypes: typeWeaknesses(pokemonTypes(speciesId, formId)),
      },
    });
  const err = (i: number) =>
    errors.get(`rewards.pokemon.${i}.level`) ?? errors.get(`rewards.pokemon.${i}.perfectIvs`);

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Une fois la récompense réclamée, chaque Pokémon se capture lors d’une expédition légendaire
        (lancée depuis les quêtes, sur un emplacement d’expédition) : une seule Ball est lancée,
        avec la formule de capture habituelle. Les membres de l’équipe d’un type d’affinité
        augmentent la chance de capture ; par défaut, les faiblesses du Pokémon. L’équipe doit venir
        du Pokédex de la région de la quête. IV aléatoires, dont au moins le nombre indiqué à 31 ;
        le taux shiny habituel s’applique (Charme Chroma compris).
      </p>
      {value.map((p, i) => (
        <div
          key={i}
          className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800"
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-64">
              <SpeciesSelect
                ctx={ctx}
                value={p.speciesId}
                onChange={(speciesId) => setSpecies(i, speciesId, null)}
                disabled={disabled}
              />
              <FormSelect
                speciesId={p.speciesId}
                value={p.formId}
                disabled={disabled}
                onChange={(formId) => setSpecies(i, p.speciesId, formId)}
              />
            </div>
            <NumberInput
              className="w-28"
              value={p.level}
              min={1}
              max={100}
              unit="niveau"
              disabled={disabled}
              onChange={(level) => update(i, { level })}
            />
            <NumberInput
              className="w-36"
              value={p.perfectIvs}
              min={0}
              max={6}
              unit="IV parfaits"
              disabled={disabled}
              onChange={(perfectIvs) => update(i, { perfectIvs })}
            />
            {!disabled && (
              <button
                type="button"
                className="text-slate-400 hover:text-red-600"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            )}
            {err(i) && <span className="text-xs text-red-600">{err(i)}</span>}
          </div>
          <LegendaryExpeditionEditor
            value={p.expedition}
            weaknesses={typeWeaknesses(pokemonTypes(p.speciesId, p.formId))}
            onChange={(expedition) => update(i, { expedition })}
            errors={errors}
            prefix={`rewards.pokemon.${i}.expedition`}
            disabled={disabled}
          />
        </div>
      ))}
      {!disabled && value.length < 6 && (
        <button
          type="button"
          className="btn-ghost py-1 text-xs"
          onClick={() =>
            onChange([
              ...value,
              {
                speciesId: 150,
                level: 70,
                perfectIvs: 3,
                expedition: defaultLegendaryExpedition(150),
              },
            ])
          }
        >
          + Pokémon
        </button>
      )}
    </div>
  );
}

/** Expédition légendaire d'un Pokémon : durée, PE minimale, types requis, affinités. */
function LegendaryExpeditionEditor({
  value,
  weaknesses,
  onChange,
  errors,
  prefix,
  disabled,
}: {
  value: LegendaryExpedition;
  /** Faiblesses du Pokémon : affinités par défaut. */
  weaknesses: string[];
  onChange: (v: LegendaryExpedition) => void;
  errors: FieldErrors;
  prefix: string;
  disabled: boolean;
}) {
  const set = <K extends keyof LegendaryExpedition>(key: K, v: LegendaryExpedition[K]) =>
    onChange({ ...value, [key]: v });
  const err = (path: string) => errors.get(`${prefix}.${path}`);
  const setRequired = (requiredTypes: LegendaryExpedition['requiredTypes']) =>
    set('requiredTypes', requiredTypes);
  const isDefault =
    value.affinityTypes.length === weaknesses.length &&
    weaknesses.every((t) => value.affinityTypes.includes(t));

  return (
    <div className="space-y-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
      <p className="text-xs font-semibold text-slate-500">Expédition légendaire</p>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Durée" error={err('durationMinutes')}>
          <NumberInput
            className="w-32"
            value={value.durationMinutes}
            min={1}
            step={30}
            unit="min"
            disabled={disabled}
            onChange={(v) => set('durationMinutes', v)}
          />
        </Field>
        <Field label="PE minimale de l’équipe" error={err('minPower')}>
          <NumberInput
            className="w-36"
            value={value.minPower}
            min={0}
            step={100}
            unit="PE"
            disabled={disabled}
            onChange={(v) => set('minPower', v)}
          />
        </Field>
      </div>
      <Field label="Types requis">
        <div className="space-y-2">
          {value.requiredTypes.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <NumberInput
                className="w-24"
                value={r.count}
                min={1}
                max={6}
                unit="×"
                disabled={disabled}
                onChange={(count) =>
                  setRequired(value.requiredTypes.map((x, j) => (j === i ? { ...x, count } : x)))
                }
              />
              <TypeSelect
                value={r.type}
                disabled={disabled}
                onChange={(type) =>
                  setRequired(value.requiredTypes.map((x, j) => (j === i ? { ...x, type } : x)))
                }
              />
              {!disabled && (
                <button
                  type="button"
                  className="text-slate-400 hover:text-red-600"
                  onClick={() => setRequired(value.requiredTypes.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {!disabled && (
            <button
              type="button"
              className="btn-ghost py-1 text-xs"
              onClick={() =>
                setRequired([...value.requiredTypes, { type: weaknesses[0] ?? 'water', count: 1 }])
              }
            >
              + Type requis
            </button>
          )}
        </div>
      </Field>
      <Field
        label="Affinités"
        hint={
          isDefault
            ? 'Faiblesses du Pokémon (par défaut).'
            : 'Modifiées : différentes des faiblesses du Pokémon.'
        }
        error={err('affinityTypes')}
      >
        <div className="space-y-1">
          <TypeMultiSelect
            value={value.affinityTypes}
            onChange={(v) => set('affinityTypes', v)}
            disabled={disabled}
          />
          {!disabled && !isDefault && (
            <button
              type="button"
              className="btn-ghost py-1 text-xs"
              onClick={() => set('affinityTypes', weaknesses)}
            >
              Revenir aux faiblesses
            </button>
          )}
        </div>
      </Field>
    </div>
  );
}
