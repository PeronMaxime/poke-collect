import { DEFAULT_LEGENDARY_BATTLE, DEFAULT_ROAMING_CHANCE } from '@poke/content';
import type { LegendaryBattle, QuestPokemon } from '@poke/content';
import { pokemonTypes, typeWeaknesses } from '@poke/data';
import type { GameContext } from '@poke/game-core';
import { Field, NumberInput } from '../../components/forms/fields';
import type { FieldErrors } from '../../components/forms/fields';
import { FormSelect, SpeciesSelect, TypeSelect } from '../../components/forms/pickers';

/**
 * Pokémon de la récompense d'une quête : espèce, niveau, IV parfaits garantis, et le combat
 * légendaire qui permet de le capturer, ou son réglage de fuyard.
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
  const err = (i: number) =>
    errors.get(`rewards.pokemon.${i}.level`) ??
    errors.get(`rewards.pokemon.${i}.perfectIvs`) ??
    errors.get(`rewards.pokemon.${i}.roaming`);

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Une fois la récompense réclamée, chaque Pokémon s’affronte en combat légendaire, lancé
        depuis l’onglet Quêtes : un combat en temps réel contre l’équipe du joueur (six membres au
        plus, du Pokédex de la région de la quête). Le légendaire est renforcé (PV et statistiques
        multipliés) et se déchaîne sous le seuil de PV indiqué. Une victoire permet de lancer une
        Ball, qui le capture à la chance indiquée (Master Ball : toujours). Défaite, fuite ou Ball
        ratée : nouveau combat après le délai des réglages (Équilibrage → Légendaires). IV
        aléatoires, dont au moins le nombre indiqué à 31 ; le taux chromatique habituel s’applique,
        chaque tentative allongeant la chaîne. Un fuyard, lui, n’a pas de combat : il change de zone
        à chaque heure parmi les zones ordinaires débloquées par le joueur dans la région de la
        quête, et chaque rencontre d’une expédition dans sa zone a le pourcentage indiqué de chances
        d’être lui (une fois au plus). Une Ball lui est toujours lancée, quel que soit le filtre de
        capture.
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
                onChange={(speciesId) => update(i, { speciesId, formId: null })}
                disabled={disabled}
              />
              <FormSelect
                speciesId={p.speciesId}
                value={p.formId}
                disabled={disabled}
                onChange={(formId) => update(i, { formId })}
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
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={p.roaming != null}
                disabled={disabled}
                onChange={(e) =>
                  update(i, { roaming: e.target.checked ? DEFAULT_ROAMING_CHANCE : null })
                }
              />
              Fuyard
            </label>
            {p.roaming != null && (
              <NumberInput
                className="w-48"
                value={p.roaming}
                min={0.1}
                max={100}
                step={0.5}
                unit="% par rencontre"
                disabled={disabled}
                onChange={(roaming) => update(i, { roaming })}
              />
            )}
          </div>
          {p.roaming == null && (
            <LegendaryBattleEditor
              value={p.battle}
              rewardLevel={p.level}
              weaknesses={typeWeaknesses(pokemonTypes(p.speciesId, p.formId))}
              onChange={(battle) => update(i, { battle })}
              errors={errors}
              prefix={`rewards.pokemon.${i}.battle`}
              disabled={disabled}
            />
          )}
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
                formId: null,
                level: 70,
                perfectIvs: 3,
                battle: { ...DEFAULT_LEGENDARY_BATTLE, requiredTypes: [] },
                roaming: null,
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

/** Props de l'éditeur d'un combat légendaire, que reçoivent aussi ses pièces. */
interface LegendaryBattleEditorProps {
  value: LegendaryBattle;
  rewardLevel: number;
  /** Faiblesses du Pokémon : type proposé pour un nouveau type requis. */
  weaknesses: string[];
  onChange: (v: LegendaryBattle) => void;
  errors: FieldErrors;
  prefix: string;
  disabled: boolean;
}

/** Combat légendaire d'un Pokémon : renforcement, phase déchaînée, conditions, capture. */
function LegendaryBattleEditor({
  value,
  rewardLevel,
  weaknesses,
  onChange,
  errors,
  prefix,
  disabled,
}: LegendaryBattleEditorProps) {
  return (
    <div className="space-y-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
      <p className="text-xs font-semibold text-slate-500">Combat légendaire</p>
      <LegendaryStatsFields
        value={value}
        rewardLevel={rewardLevel}
        weaknesses={weaknesses}
        onChange={onChange}
        errors={errors}
        prefix={prefix}
        disabled={disabled}
      />
      <LegendaryEnrageFields
        value={value}
        rewardLevel={rewardLevel}
        weaknesses={weaknesses}
        onChange={onChange}
        errors={errors}
        prefix={prefix}
        disabled={disabled}
      />
      <LegendaryRequiredTypes
        value={value}
        rewardLevel={rewardLevel}
        weaknesses={weaknesses}
        onChange={onChange}
        errors={errors}
        prefix={prefix}
        disabled={disabled}
      />
    </div>
  );
}

/** Niveau, IV, multiplicateurs de PV et de statistiques, durée maximale du combat. */
function LegendaryStatsFields({
  value,
  rewardLevel,
  onChange,
  errors,
  prefix,
  disabled,
}: LegendaryBattleEditorProps) {
  const set = <K extends keyof LegendaryBattle>(key: K, v: LegendaryBattle[K]) =>
    onChange({ ...value, [key]: v });
  const err = (path: string) => errors.get(`${prefix}.${path}`);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field
        label="Niveau en combat"
        hint={value.level == null ? `Niveau de la récompense (${rewardLevel}).` : undefined}
        error={err('level')}
      >
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={value.level == null}
              disabled={disabled}
              onChange={(e) => set('level', e.target.checked ? null : rewardLevel)}
            />
            Récompense
          </label>
          {value.level != null && (
            <NumberInput
              className="w-28"
              value={value.level}
              min={1}
              max={100}
              unit="niveau"
              disabled={disabled}
              onChange={(v) => set('level', v)}
            />
          )}
        </div>
      </Field>
      <Field label="IV en combat" error={err('iv')}>
        <NumberInput
          className="w-24"
          value={value.iv}
          min={0}
          max={31}
          disabled={disabled}
          onChange={(v) => set('iv', v)}
        />
      </Field>
      <Field label="PV" error={err('hpMultiplier')}>
        <NumberInput
          className="w-24"
          value={value.hpMultiplier}
          min={1}
          max={100}
          step={0.5}
          unit="×"
          disabled={disabled}
          onChange={(v) => set('hpMultiplier', v)}
        />
      </Field>
      <Field label="Statistiques (hors PV)" error={err('statMultiplier')}>
        <NumberInput
          className="w-24"
          value={value.statMultiplier}
          min={0.1}
          max={10}
          step={0.05}
          unit="×"
          disabled={disabled}
          onChange={(v) => set('statMultiplier', v)}
        />
      </Field>
      <Field label="Durée maximale" error={err('timeLimitSeconds')}>
        <NumberInput
          className="w-28"
          value={value.timeLimitSeconds}
          min={30}
          max={3600}
          step={30}
          unit="s"
          disabled={disabled}
          onChange={(v) => set('timeLimitSeconds', v)}
        />
      </Field>
    </div>
  );
}

/** Déchaînement (seuil de PV, gain de statistiques), chance de capture, PE minimale de l'équipe. */
function LegendaryEnrageFields({
  value,
  onChange,
  errors,
  prefix,
  disabled,
}: LegendaryBattleEditorProps) {
  const set = <K extends keyof LegendaryBattle>(key: K, v: LegendaryBattle[K]) =>
    onChange({ ...value, [key]: v });
  const err = (path: string) => errors.get(`${prefix}.${path}`);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="Se déchaîne sous" hint="0 % = jamais." error={err('enrageHpFraction')}>
        <NumberInput
          className="w-28"
          value={Math.round(value.enrageHpFraction * 100)}
          min={0}
          max={100}
          step={5}
          unit="% PV"
          disabled={disabled}
          onChange={(v) => set('enrageHpFraction', v / 100)}
        />
      </Field>
      <Field label="Gain de statistiques" error={err('enragePercent')}>
        <NumberInput
          className="w-28"
          value={value.enragePercent}
          min={0}
          max={500}
          step={5}
          unit="%"
          disabled={disabled}
          onChange={(v) => set('enragePercent', v)}
        />
      </Field>
      <Field label="Chance de capture" error={err('captureChance')}>
        <NumberInput
          className="w-28"
          value={value.captureChance}
          min={0.1}
          max={100}
          step={1}
          unit="%"
          disabled={disabled}
          onChange={(v) => set('captureChance', v)}
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
  );
}

/** Types requis dans l'équipe. */
function LegendaryRequiredTypes({
  value,
  weaknesses,
  onChange,
  disabled,
}: LegendaryBattleEditorProps) {
  const set = <K extends keyof LegendaryBattle>(key: K, v: LegendaryBattle[K]) =>
    onChange({ ...value, [key]: v });
  const setRequired = (requiredTypes: LegendaryBattle['requiredTypes']) =>
    set('requiredTypes', requiredTypes);

  return (
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
  );
}
