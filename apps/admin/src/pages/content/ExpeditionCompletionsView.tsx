/**
 * Onglet « Complétion d'expédition » de la page Progression : récompenses quand chaque Pokémon
 * d'une expédition est capturé.
 */
import { useState } from 'react';
import { expeditionCompletionSchema } from '@poke/content';
import type {
  ExpeditionCompletion,
  ExpeditionCompletionScope,
  RegionBonus,
  RegionBonusType,
} from '@poke/content';
import { completableZones, completionTargets } from '@poke/game-core';
import { WithWorkingVersion } from '../../components/EntityPage';
import { SettingsPage } from '../../components/SettingsPage';
import {
  Field,
  NumberInput,
  SelectInput,
  TextInput,
  Toggle,
  validate,
} from '../../components/forms/fields';
import type { FieldErrors } from '../../components/forms/fields';
import { RewardEditor, emptyReward, rewardSummary } from '../../components/forms/RewardEditor';
import type { WorkingVersion } from '../../lib/content';
import { useSaveBalance } from '../../lib/content';

const REGION_BONUS_LABELS: Record<RegionBonusType, string> = {
  xp: 'XP gagnée (toutes sources : expéditions, combats, donjons, pensions, Bonbons)',
};

const REGION_BONUS_SHORT: Record<RegionBonusType, string> = { xp: 'XP' };

const regionBonusSummary = (bonuses: readonly RegionBonus[]) =>
  bonuses.map((b) => ` · +${b.percent} % ${REGION_BONUS_SHORT[b.type]} de la région`).join('');

const SCOPES: { value: ExpeditionCompletionScope; label: string }[] = [
  { value: 'zone', label: 'Chaque expédition complétée' },
  { value: 'region', label: 'Toutes les expéditions d’une région complétées' },
];

/**
 * Onglet « Complétion d'expédition » : récompenses quand le joueur a capturé chaque Pokémon d'une
 * expédition (ou de toutes celles d'une région), en normal ou en chromatique. Le joueur les
 * réclame dans son Pokédex, onglet « Expéditions ».
 */
export function ExpeditionCompletionsView() {
  return (
    <WithWorkingVersion>
      {(w) => <CompletionsEditor key={w.version.id} working={w} />}
    </WithWorkingVersion>
  );
}

/** État de l'éditeur des complétions d'expédition : brouillon, validation, ajout, enregistrement. */
function useCompletionsEditor({ working }: { working: WorkingVersion }) {
  const balance = working.content.balance;
  const initial = balance.expeditionCompletions ?? [];
  const [draft, setDraft] = useState<ExpeditionCompletion[]>(initial);
  const save = useSaveBalance(working.version.id);
  const editable = working.editable;
  const disabled = !editable;
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const { ctx } = working;
  // Un identifiant déjà publié reste fixe : les récompenses réclamées s'y rattachent.
  const savedIds = new Set(initial.map((c) => c.id));
  const checks = draft.map((c) => validate(expeditionCompletionSchema, c));
  const duplicate = draft.some((c, i) => draft.findIndex((d) => d.id === c.id) !== i);
  const valid = !duplicate && checks.every((c) => c.valid);

  const update = (i: number, patch: Partial<ExpeditionCompletion>) =>
    setDraft(draft.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  function add() {
    let n = draft.length + 1;
    while (draft.some((c) => c.id === `completion-${n}`)) n++;
    setDraft([
      ...draft,
      {
        id: `completion-${n}`,
        name: 'Expédition complétée',
        scope: 'zone',
        regionId: null,
        zoneId: null,
        shiny: false,
        rewards: emptyReward(),
        regionBonuses: [],
      },
    ]);
  }

  const cancel = () => setDraft(initial);
  const submit = () =>
    save.mutate({
      ...balance,
      expeditionCompletions: draft.length > 0 || initial.length > 0 ? draft : undefined,
    });

  return {
    cancel,
    submit,
    working,
    draft,
    setDraft,
    save,
    editable,
    disabled,
    dirty,
    ctx,
    savedIds,
    checks,
    duplicate,
    valid,
    update,
    add,
  };
}

/** Ce qu'affichent les pièces de `CompletionsEditor`. */
type CompletionsEditorModel = ReturnType<typeof useCompletionsEditor>;

function CompletionsEditor({ working }: { working: WorkingVersion }) {
  const m = useCompletionsEditor({ working });
  const { draft, save, editable, dirty, valid, duplicate, add, cancel, submit } = m;
  return (
    <SettingsPage
      title="Progression : complétion d’expédition"
      description="Une expédition est complétée quand chaque Pokémon de ses rencontres (espèce, ou forme pour une rencontre de forme) est capturé, en version chromatique pour une complétion chromatique. Chaque récompense se réclame une fois par expédition ou par région complétée, dans le Pokédex du joueur (onglet « Expéditions »)."
      working={working}
      save={save}
      dirty={dirty}
      valid={valid}
      onCancel={cancel}
      onSave={submit}
    >
      {duplicate && (
        <p className="text-sm text-red-600">Deux récompenses ont le même identifiant.</p>
      )}
      {draft.length === 0 && (
        <p className="text-slate-500">Aucune récompense de complétion pour le moment.</p>
      )}

      <CompletionsList m={m} />
      {editable && (
        <button className="btn-ghost" onClick={add}>
          + Ajouter une récompense de complétion
        </button>
      )}
    </SettingsPage>
  );
}

/** Chaque complétion : identifiant, nom, condition (région, expédition, chromatique), récompenses et bonus de région, retrait. */
function CompletionsList({ m }: { m: CompletionsEditorModel }) {
  const { draft, setDraft, editable, disabled, ctx, savedIds, checks, update } = m;
  return (
    <>
      {draft.map((c, i) => {
        const { errors } = checks[i]!;
        const targets = completionTargets(ctx, c).length;
        const zones = completableZones(ctx, c.regionId);
        return (
          <fieldset key={i} className="card space-y-4">
            <legend className="sr-only">{c.name}</legend>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold">
                  {c.name || 'Sans nom'} {c.shiny && <span className="text-amber-400">★</span>}
                </h2>
                <p className="text-xs text-slate-500">
                  {targets} {c.scope === 'zone' ? 'expédition(s)' : 'région(s)'} concernée(s) ·{' '}
                  {rewardSummary(c.rewards)}
                  {regionBonusSummary(c.regionBonuses)}
                  {c.scope === 'zone' && targets > 1 && ' (chacune)'}
                </p>
              </div>
              {editable && (
                <button
                  className="btn-ghost text-red-600"
                  onClick={() => setDraft(draft.filter((_, j) => j !== i))}
                >
                  Retirer
                </button>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Identifiant"
                hint="Minuscules et tirets, non modifiable une fois enregistré."
                error={errors.get('id')}
              >
                <TextInput
                  value={c.id}
                  onChange={(v) => update(i, { id: v })}
                  disabled={disabled || savedIds.has(c.id)}
                />
              </Field>
              <Field label="Nom" error={errors.get('name')}>
                <TextInput
                  value={c.name}
                  onChange={(v) => update(i, { name: v })}
                  disabled={disabled}
                />
              </Field>
              <Field label="Condition">
                <SelectInput
                  value={c.scope}
                  disabled={disabled}
                  options={SCOPES}
                  onChange={(scope) => update(i, { scope, zoneId: null })}
                />
                <div className="mt-2">
                  <Toggle
                    checked={c.shiny}
                    onChange={(shiny) => update(i, { shiny })}
                    disabled={disabled}
                    label="Chromatique (chaque Pokémon capturé en version chromatique)"
                  />
                </div>
              </Field>
              <Field
                label="Région"
                hint={
                  c.scope === 'region'
                    ? 'Toutes les régions : une récompense pour chaque région complétée.'
                    : 'Toutes les régions : une récompense pour chaque expédition complétée.'
                }
                error={errors.get('regionId')}
              >
                <select
                  className="input"
                  value={c.regionId ?? ''}
                  disabled={disabled}
                  onChange={(e) => update(i, { regionId: e.target.value || null, zoneId: null })}
                >
                  <option value="">Toutes les régions</option>
                  {ctx.regions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                  {c.regionId && !ctx.region(c.regionId) && (
                    <option value={c.regionId}>{c.regionId} (inconnue)</option>
                  )}
                </select>
              </Field>
              {c.scope === 'zone' && (
                <Field
                  label="Expédition"
                  hint="Une expédition précise, ou chacune de la région."
                  error={errors.get('zoneId')}
                >
                  <select
                    className="input"
                    value={c.zoneId ?? ''}
                    disabled={disabled}
                    onChange={(e) => update(i, { zoneId: e.target.value || null })}
                  >
                    <option value="">Chaque expédition</option>
                    {zones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {c.regionId ? '' : `${ctx.region(z.regionId)?.name ?? z.regionId} · `}
                        {z.name}
                      </option>
                    ))}
                    {c.zoneId && !zones.some((z) => z.id === c.zoneId) && (
                      <option value={c.zoneId}>{c.zoneId} (inconnue)</option>
                    )}
                  </select>
                </Field>
              )}
            </div>
            <RewardEditor
              ctx={ctx}
              value={c.rewards}
              onChange={(rewards) => update(i, { rewards })}
              errors={errors}
              prefix="rewards"
              disabled={disabled}
            />
            <RegionBonusEditor
              value={c.regionBonuses}
              onChange={(regionBonuses) => update(i, { regionBonuses })}
              errors={errors}
              disabled={disabled}
            />
          </fieldset>
        );
      })}
    </>
  );
}

/**
 * Bonus permanents pour la région de l'expédition (ou la région complétée) : ils ne valent que
 * pour les Pokémon du Pokédex de cette région.
 */
function RegionBonusEditor({
  value,
  onChange,
  errors,
  disabled,
}: {
  value: RegionBonus[];
  onChange: (v: RegionBonus[]) => void;
  errors: FieldErrors;
  disabled: boolean;
}) {
  const setBonus = (i: number, patch: Partial<RegionBonus>) =>
    onChange(value.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  return (
    <Field
      label="Bonus de région"
      hint="Pour les Pokémon du Pokédex de la région de l’expédition (ou de la région complétée), dès que le joueur réclame la récompense. Cumulés entre eux (+2 % par expédition), multipliés avec les autres bonus d’XP."
    >
      <div className="space-y-2">
        {value.map((b, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <SelectInput
              value={b.type}
              disabled={disabled}
              onChange={(type) => setBonus(i, { type })}
              options={(Object.keys(REGION_BONUS_LABELS) as RegionBonusType[]).map((t) => ({
                value: t,
                label: REGION_BONUS_LABELS[t],
              }))}
            />
            <NumberInput
              className="w-32"
              value={b.percent}
              min={0}
              step={1}
              unit="%"
              disabled={disabled}
              onChange={(percent) => setBonus(i, { percent })}
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
            {errors.get(`regionBonuses.${i}.percent`) && (
              <span className="text-xs text-red-600">
                {errors.get(`regionBonuses.${i}.percent`)}
              </span>
            )}
          </div>
        ))}
        {!disabled && (
          <button
            type="button"
            className="btn-ghost py-1 text-xs"
            onClick={() => onChange([...value, { type: 'xp', percent: 2 }])}
          >
            + Bonus de région
          </button>
        )}
      </div>
    </Field>
  );
}
