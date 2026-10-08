import { useState } from 'react';
import { trainerSchema } from '@poke/content';
import type { BattleRules, Trainer, TrainerPokemon } from '@poke/content';
import { natures } from '@poke/data';
import {
  battleCooldownMinutes,
  battleDurationMinutes,
  battleKoMinutes,
  trainerMemberPower,
  trainerPower,
  winProbabilityForRatio,
} from '@poke/game-core';
import { EntityPage } from '../../components/EntityPage';
import type { EntityFormProps } from '../../components/EntityPage';
import { WinCurveChart } from '../../components/WinCurveChart';
import {
  Field,
  NullableNumberInput,
  NullableTextInput,
  NumberInput,
  Section,
  TextInput,
  Toggle,
  errorsUnder,
} from '../../components/forms/fields';
import {
  ItemIcon,
  FormSelect,
  SpeciesSelect,
  Sprite,
  TypeMultiSelect,
  TypeSelect,
  UnlockEditor,
} from '../../components/forms/pickers';
import type { WorkingVersion } from '../../lib/content';

export function TrainersPage() {
  return (
    <EntityPage<Trainer>
      title="Dresseurs"
      description="Équipe (PE calculée), conditions d’équipe, durée, récompenses, badge, rejouabilité, déblocage."
      collection="trainers"
      entityKind="trainer"
      schema={trainerSchema}
      list={(w) => w.ctx.trainers as Trainer[]}
      getKey={(t) => t.id}
      searchText={(t) => `${t.id} ${t.name} ${t.trainerClass}`}
      renderListItem={(t, w) => (
        <span className="flex items-center gap-2">
          {t.sprite ? (
            <img src={t.sprite} alt="" className="h-8 w-8 shrink-0 object-contain" />
          ) : (
            <span className="h-8 w-8 shrink-0" />
          )}
          <span className="min-w-0">
            <span
              className={`block truncate font-medium ${t.enabled && w.ctx.region(t.regionId)?.enabled !== false ? '' : 'line-through'}`}
            >
              {t.trainerClass} {t.name}
            </span>
            <span className="block truncate text-xs text-slate-500">
              PE {trainerPower(w.ctx, t)} · {t.team.length} Pokémon ·{' '}
              {t.repeatable ? 'répétable' : 'unique'}
              {t.badge ? ' · badge' : ''}
            </span>
          </span>
        </span>
      )}
      create={(w) => ({
        id: '',
        regionId: w.ctx.regions[0]?.id ?? '',
        zoneId: null,
        order: w.content.trainers.length,
        name: '',
        trainerClass: 'Gamin',
        sprite: null,
        team: [{ speciesId: 19, level: 5, iv: null, nature: null }],
        durationMinutes: null,
        rules: {
          teamSize: null,
          maxLevel: null,
          requiredTypes: [],
          forbiddenTypes: [],
          minPower: 0,
        },
        money: 100,
        lootTableId: null,
        lootRolls: 1,
        badge: null,
        repeatable: true,
        cooldownMinutes: null,
        koMinutes: null,
        enabled: true,
        unlock: { type: 'always' },
      })}
      duplicate={(t) => ({ ...structuredClone(t), id: `${t.id}-copie`, name: `${t.name} (copie)` })}
      renderForm={(p) => <TrainerForm {...p} />}
      renderExtra={(t, w) => <WinSimulator trainer={t} working={w} />}
      newLabel="Nouveau dresseur"
    />
  );
}

function TrainerForm({
  value: t,
  onChange,
  errors,
  isNew,
  editable,
  working,
}: EntityFormProps<Trainer>) {
  const set = <K extends keyof Trainer>(key: K, v: Trainer[K]) => onChange({ ...t, [key]: v });
  const setRule = <K extends keyof BattleRules>(key: K, v: BattleRules[K]) =>
    set('rules', { ...t.rules, [key]: v });
  const { ctx } = working;
  const disabled = !editable;
  const battles = ctx.balance.battles;
  const zones = ctx.zones.filter((z) => z.regionId === t.regionId);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Identifiant"
          hint="Minuscules et tirets, non modifiable ensuite."
          error={errors.get('id')}
        >
          <TextInput value={t.id} onChange={(v) => set('id', v)} disabled={disabled || !isNew} />
        </Field>
        <Field label="Nom" error={errors.get('name')}>
          <TextInput value={t.name} onChange={(v) => set('name', v)} disabled={disabled} />
        </Field>
        <Field
          label="Classe"
          hint="Gamin, Montagnard, Champion d’arène…"
          error={errors.get('trainerClass')}
        >
          <TextInput
            value={t.trainerClass}
            onChange={(v) => set('trainerClass', v)}
            disabled={disabled}
          />
        </Field>
        <Field
          label="Sprite (URL)"
          error={errors.get('sprite')}
          hint="URL complète, ou image du dépôt : /api/sprites/trainers/<nom>.png"
        >
          <div className="flex items-center gap-2">
            {t.sprite && <img src={t.sprite} alt="" className="h-10 w-10 object-contain" />}
            <NullableTextInput
              value={t.sprite}
              onChange={(v) => set('sprite', v)}
              disabled={disabled}
              placeholder="https://…"
            />
          </div>
        </Field>
        <Field label="Région" error={errors.get('regionId')}>
          <select
            className="input"
            value={t.regionId}
            disabled={disabled}
            onChange={(e) => onChange({ ...t, regionId: e.target.value, zoneId: null })}
          >
            {ctx.regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Zone de rattachement"
          hint="Optionnelle, pour l’affichage."
          error={errors.get('zoneId')}
        >
          <select
            className="input"
            value={t.zoneId ?? ''}
            disabled={disabled}
            onChange={(e) => set('zoneId', e.target.value || null)}
          >
            <option value="">Aucune</option>
            {t.zoneId && !zones.some((z) => z.id === t.zoneId) && (
              <option value={t.zoneId}>{t.zoneId} (inconnue)</option>
            )}
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ordre d’affichage" error={errors.get('order')}>
          <NumberInput
            value={t.order}
            min={0}
            onChange={(v) => set('order', v)}
            disabled={disabled}
          />
        </Field>
      </div>
      <Toggle
        checked={t.enabled}
        onChange={(v) => set('enabled', v)}
        label="Dresseur activé (désactivé : caché aux joueurs, plus aucun combat ne peut être lancé)"
        disabled={disabled}
      />

      <Section title={`Équipe — PE ${trainerPower(ctx, t)}`}>
        <TeamEditor
          working={working}
          team={t.team}
          onChange={(team) => set('team', team)}
          errors={errors}
          disabled={disabled}
        />
      </Section>

      <Section title="Combat">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Durée"
            hint={`Vide = ${battles.defaultDurationMinutes} min (équilibrage).`}
            error={errors.get('durationMinutes')}
          >
            <NullableNumberInput
              value={t.durationMinutes}
              min={1}
              unit="min"
              placeholder={String(battles.defaultDurationMinutes)}
              onChange={(v) => set('durationMinutes', v)}
              disabled={disabled}
            />
          </Field>
          <Field
            label="Nombre de Pokémon imposé"
            hint="Vide = libre."
            error={errors.get('rules.teamSize')}
          >
            <NullableNumberInput
              value={t.rules.teamSize}
              min={1}
              max={6}
              placeholder="Libre"
              onChange={(v) => setRule('teamSize', v)}
              disabled={disabled}
            />
          </Field>
          <Field label="Niveau maximum" hint="Vide = aucun." error={errors.get('rules.maxLevel')}>
            <NullableNumberInput
              value={t.rules.maxLevel}
              min={1}
              max={100}
              placeholder="Aucun"
              onChange={(v) => setRule('maxLevel', v)}
              disabled={disabled}
            />
          </Field>
          <Field label="PE minimale pour lancer" error={errors.get('rules.minPower')}>
            <NumberInput
              value={t.rules.minPower}
              min={0}
              unit="PE"
              onChange={(v) => setRule('minPower', v)}
              disabled={disabled}
            />
          </Field>
        </div>
        <Field label="Types imposés">
          <div className="space-y-2">
            {t.rules.requiredTypes.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <NumberInput
                  className="w-24"
                  value={r.count}
                  min={1}
                  max={6}
                  unit="×"
                  disabled={disabled}
                  onChange={(count) =>
                    setRule(
                      'requiredTypes',
                      t.rules.requiredTypes.map((x, j) => (j === i ? { ...x, count } : x)),
                    )
                  }
                />
                <TypeSelect
                  value={r.type}
                  disabled={disabled}
                  onChange={(type) =>
                    setRule(
                      'requiredTypes',
                      t.rules.requiredTypes.map((x, j) => (j === i ? { ...x, type } : x)),
                    )
                  }
                />
                {!disabled && (
                  <button
                    type="button"
                    className="text-slate-400 hover:text-red-600"
                    onClick={() =>
                      setRule(
                        'requiredTypes',
                        t.rules.requiredTypes.filter((_, j) => j !== i),
                      )
                    }
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
                  setRule('requiredTypes', [...t.rules.requiredTypes, { type: 'water', count: 1 }])
                }
              >
                + Type imposé
              </button>
            )}
          </div>
        </Field>
        <Field label="Types interdits">
          <TypeMultiSelect
            value={t.rules.forbiddenTypes}
            onChange={(v) => setRule('forbiddenTypes', v)}
            disabled={disabled}
          />
        </Field>
      </Section>

      <Section title="Récompenses de victoire">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Argent" error={errors.get('money')}>
            <NumberInput
              value={t.money}
              min={0}
              unit="₽"
              onChange={(v) => set('money', v)}
              disabled={disabled}
            />
          </Field>
          <Field label="Table de butin" error={errors.get('lootTableId')}>
            <select
              className="input"
              value={t.lootTableId ?? ''}
              disabled={disabled}
              onChange={(e) => set('lootTableId', e.target.value || null)}
            >
              <option value="">Aucune</option>
              {working.content.lootTables.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.id})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tirages de butin" error={errors.get('lootRolls')}>
            <NumberInput
              value={t.lootRolls}
              min={0}
              max={20}
              onChange={(v) => set('lootRolls', v)}
              disabled={disabled}
            />
          </Field>
        </div>
        {t.lootTableId && (
          <ul className="flex flex-wrap gap-3 text-xs text-slate-500">
            {ctx.lootTable(t.lootTableId)?.entries.map((e) => (
              <li key={e.itemId} className="flex items-center gap-1">
                <ItemIcon ctx={ctx} id={e.itemId} size={20} />
                {ctx.item(e.itemId)?.name ?? e.itemId} · {Math.round(e.chance * 100)} %
              </li>
            ))}
          </ul>
        )}
        <Toggle
          label="Donne un badge à la première victoire"
          checked={t.badge !== null}
          disabled={disabled}
          onChange={(on) =>
            set('badge', on ? { name: `Badge de ${t.name || '…'}`, image: null } : null)
          }
        />
        {t.badge && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nom du badge" error={errors.get('badge.name')}>
              <TextInput
                value={t.badge.name}
                onChange={(name) => set('badge', { ...t.badge!, name })}
                disabled={disabled}
              />
            </Field>
            <Field label="Image du badge (URL)" error={errors.get('badge.image')}>
              <NullableTextInput
                value={t.badge.image}
                onChange={(image) => set('badge', { ...t.badge!, image })}
                disabled={disabled}
                placeholder="Médaille par défaut"
              />
            </Field>
          </div>
        )}
      </Section>

      <Section title="Rejouabilité et défaite">
        <Toggle
          label="Répétable (sinon : une seule victoire possible)"
          checked={t.repeatable}
          disabled={disabled}
          onChange={(v) => set('repeatable', v)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {t.repeatable && (
            <Field
              label="Temps de recharge après une victoire"
              hint={`Vide = ${battles.cooldownMinutes} min (équilibrage).`}
              error={errors.get('cooldownMinutes')}
            >
              <NullableNumberInput
                value={t.cooldownMinutes}
                min={0}
                unit="min"
                placeholder={String(battles.cooldownMinutes)}
                onChange={(v) => set('cooldownMinutes', v)}
                disabled={disabled}
              />
            </Field>
          )}
          <Field
            label="Durée de K.O. après une défaite"
            hint={`Vide = ${battles.koMinutes} min (équilibrage).`}
            error={errors.get('koMinutes')}
          >
            <NullableNumberInput
              value={t.koMinutes}
              min={0}
              unit="min"
              placeholder={String(battles.koMinutes)}
              onChange={(v) => set('koMinutes', v)}
              disabled={disabled}
            />
          </Field>
        </div>
        <Field label="Condition de déblocage" error={errorsUnder(errors, 'unlock')[0]}>
          <UnlockEditor
            value={t.unlock}
            regions={ctx.regions}
            trainers={ctx.trainers.filter((x) => x.id !== t.id)}
            quests={ctx.quests}
            onChange={(v) => set('unlock', v)}
            disabled={disabled}
          />
        </Field>
      </Section>
    </div>
  );
}

function TeamEditor({
  working,
  team,
  onChange,
  errors,
  disabled,
}: {
  working: WorkingVersion;
  team: TrainerPokemon[];
  onChange: (v: TrainerPokemon[]) => void;
  errors: ReadonlyMap<string, string>;
  disabled: boolean;
}) {
  const { ctx } = working;
  const update = (i: number, patch: Partial<TrainerPokemon>) =>
    onChange(team.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const defaultIv = ctx.balance.battles.defaultTrainerIv;

  return (
    <div className="space-y-2">
      {errors.get('team') && <p className="text-xs text-red-600">{errors.get('team')}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="py-1 font-normal">Espèce</th>
              <th className="py-1 font-normal">Niveau</th>
              <th className="py-1 font-normal">IV (×6)</th>
              <th className="py-1 font-normal">Nature</th>
              <th className="py-1 text-right font-normal">PE</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {team.map((m, i) => (
              <tr key={i} className="border-t border-slate-100 align-top dark:border-slate-800">
                <td className="py-1 pr-2">
                  <SpeciesSelect
                    ctx={ctx}
                    value={m.speciesId}
                    disabled={disabled}
                    onChange={(speciesId) => update(i, { speciesId, formId: null })}
                  />
                  <FormSelect
                    speciesId={m.speciesId}
                    value={m.formId}
                    disabled={disabled}
                    onChange={(formId) => update(i, { formId })}
                  />
                  {errorsUnder(errors, `team.${i}`).map((msg) => (
                    <p key={msg} className="text-xs text-red-600">
                      {msg}
                    </p>
                  ))}
                </td>
                <td className="w-24 py-1 pr-2">
                  <NumberInput
                    value={m.level}
                    min={1}
                    max={100}
                    disabled={disabled}
                    onChange={(level) => update(i, { level })}
                  />
                </td>
                <td className="w-28 py-1 pr-2">
                  <NullableNumberInput
                    value={m.iv}
                    min={0}
                    max={31}
                    placeholder={`${defaultIv}`}
                    disabled={disabled}
                    onChange={(iv) => update(i, { iv })}
                  />
                </td>
                <td className="w-40 py-1 pr-2">
                  <select
                    className="input"
                    value={m.nature ?? ''}
                    disabled={disabled}
                    onChange={(e) => update(i, { nature: e.target.value || null })}
                  >
                    <option value="">Neutre</option>
                    {natures.map((n) => (
                      <option key={n.name} value={n.name}>
                        {n.nameFr}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2 text-right font-mono">{trainerMemberPower(ctx, m)}</td>
                <td className="py-2 pl-2">
                  {!disabled && team.length > 1 && (
                    <button
                      type="button"
                      className="text-slate-400 hover:text-red-600"
                      onClick={() => onChange(team.filter((_, j) => j !== i))}
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
      {!disabled && team.length < 6 && (
        <button
          type="button"
          className="btn-ghost py-1 text-xs"
          onClick={() => onChange([...team, { speciesId: 19, level: 5, iv: null, nature: null }])}
        >
          + Pokémon
        </button>
      )}
      <div className="flex flex-wrap gap-1">
        {team.map((m, i) => (
          <Sprite key={i} id={m.speciesId} size={48} />
        ))}
      </div>
    </div>
  );
}

/** Probabilité de victoire contre ce dresseur selon la PE d'une équipe (courbe + essai). */
function WinSimulator({ trainer, working }: { trainer: Trainer; working: WorkingVersion }) {
  const { ctx } = working;
  const power = trainerPower(ctx, trainer);
  const [playerPower, setPlayerPower] = useState(power);
  const [advantage, setAdvantage] = useState(0);
  const factor = 1 + ctx.balance.battles.typeAdvantageWeight * advantage;
  const ratio = power > 0 ? playerPower / power : 0;
  const chance = winProbabilityForRatio(ctx, ratio * factor);

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="font-semibold">Simulateur de victoire</h2>
        <p className="text-xs text-slate-500">
          Avec les réglages de combat et l’équipe affichée (y compris les modifications non
          enregistrées). Durée {battleDurationMinutes(ctx, trainer)} min · K.O.{' '}
          {battleKoMinutes(ctx, trainer)} min
          {trainer.repeatable && ` · recharge ${battleCooldownMinutes(ctx, trainer)} min`}.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="PE de l’équipe du joueur">
          <NumberInput value={playerPower} min={0} unit="PE" onChange={setPlayerPower} />
        </Field>
        <Field label="Avantage de types" hint="−1 très défavorable, +1 très favorable.">
          <input
            type="range"
            className="w-full accent-brand-500"
            min={-1}
            max={1}
            step={0.1}
            value={advantage}
            onChange={(e) => setAdvantage(e.target.valueAsNumber)}
          />
          <span className="text-xs text-slate-500">
            {advantage > 0 ? '+' : ''}
            {advantage.toFixed(1)} → PE effective × {factor.toFixed(2)}
          </span>
        </Field>
        <div className="text-sm">
          <p className="text-slate-500">Probabilité de victoire</p>
          <p className="text-3xl font-bold">{(chance * 100).toFixed(1)} %</p>
          <p className="text-xs text-slate-500">
            PE {playerPower} contre {power} (×{ratio.toFixed(2)})
          </p>
        </div>
      </div>
      <WinCurveChart ctx={ctx} trainerPower={power} advantage={advantage} marker={ratio} />
    </div>
  );
}
