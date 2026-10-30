import { useState } from 'react';
import { expeditionCompletionSchema } from '@poke/content';
import type { ExpeditionCompletion, ExpeditionCompletionScope } from '@poke/content';
import { completableZones, completionTargets } from '@poke/game-core';
import { VersionBanner } from '../../components/EntityPage';
import { Field, SelectInput, TextInput, Toggle, validate } from '../../components/forms/fields';
import { RewardEditor, emptyReward, rewardSummary } from '../../components/forms/RewardEditor';
import type { WorkingVersion } from '../../lib/content';
import { errorMessage, useSaveBalance, useWorkingVersion } from '../../lib/content';

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
  const working = useWorkingVersion();
  if (working.isPending) return <p className="text-slate-500">Chargement…</p>;
  if (!working.data) return <p className="text-red-600">{errorMessage(working.error)}</p>;
  return <CompletionsEditor key={working.data.version.id} working={working.data} />;
}

function CompletionsEditor({ working }: { working: WorkingVersion }) {
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
      },
    ]);
  }

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Progression : complétion d’expédition</h1>
          <p className="mt-1 text-slate-500">
            Une expédition est complétée quand chaque Pokémon de ses rencontres (espèce, ou forme
            pour une rencontre de forme) est capturé, en version chromatique pour une complétion
            chromatique. Chaque récompense se réclame une fois par expédition ou par région
            complétée, dans le Pokédex du joueur (onglet « Expéditions »).
          </p>
        </div>
        {editable && (
          <div className="flex gap-2">
            <button className="btn-ghost" disabled={!dirty} onClick={() => setDraft(initial)}>
              Annuler
            </button>
            <button
              className="btn-primary"
              disabled={!dirty || !valid || save.isPending}
              onClick={() =>
                save.mutate({
                  ...balance,
                  expeditionCompletions: draft.length > 0 || initial.length > 0 ? draft : undefined,
                })
              }
            >
              Enregistrer
            </button>
          </div>
        )}
      </div>
      <VersionBanner working={working} />
      {save.error && <p className="text-sm text-red-600">{errorMessage(save.error)}</p>}
      {duplicate && (
        <p className="text-sm text-red-600">Deux récompenses ont le même identifiant.</p>
      )}
      {draft.length === 0 && (
        <p className="text-slate-500">Aucune récompense de complétion pour le moment.</p>
      )}

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
          </fieldset>
        );
      })}
      {editable && (
        <button className="btn-ghost" onClick={add}>
          + Ajouter une récompense de complétion
        </button>
      )}
    </div>
  );
}
