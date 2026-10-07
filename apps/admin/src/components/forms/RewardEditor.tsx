import type { PermanentBonus, PermanentBonusType, ProgressReward } from '@poke/content';
import type { GameContext } from '@poke/game-core';
import { Field, NumberInput, SelectInput } from './fields';
import type { FieldErrors } from './fields';
import { ItemSelect } from './pickers';

export const BONUS_LABELS: Record<PermanentBonusType, string> = {
  capture: 'Capture en expédition',
  xp: 'XP gagnée (expéditions et combats)',
  money: 'Poké Dollars gagnés en combat',
};

export const emptyReward = (): ProgressReward => ({
  currency: 0,
  items: [],
  expeditionSlots: 0,
  battleSlots: 0,
  daycareSlots: 0,
  bonuses: [],
});

/** Résumé d'une récompense pour les listes : « 3 000 ₽ · +1 exp. · 2 objets · +5 % capture ». */
export function rewardSummary(r: ProgressReward): string {
  const parts = [
    r.currency > 0 && `${r.currency.toLocaleString('fr-FR')} ₽`,
    r.items.length > 0 && `${r.items.length} objet(s)`,
    r.expeditionSlots > 0 && `+${r.expeditionSlots} exp.`,
    r.battleSlots > 0 && `+${r.battleSlots} combat`,
    r.daycareSlots > 0 && `+${r.daycareSlots} pension`,
    ...r.bonuses.map((b) => `+${b.percent} % ${b.type === 'capture' ? 'capture' : b.type}`),
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'aucune récompense';
}

/**
 * Récompense d'un palier ou d'une collection : argent, objets, emplacements supplémentaires
 * et bonus permanents (briques génériques).
 */
export function RewardEditor({
  ctx,
  value,
  onChange,
  errors,
  prefix,
  disabled,
}: {
  ctx: GameContext;
  value: ProgressReward;
  onChange: (v: ProgressReward) => void;
  errors: FieldErrors;
  /** Chemin du champ dans l'entité (`rewards`), pour les messages d'erreur. */
  prefix: string;
  disabled: boolean;
}) {
  const set = <K extends keyof ProgressReward>(key: K, v: ProgressReward[K]) =>
    onChange({ ...value, [key]: v });
  const err = (path: string) => errors.get(`${prefix}.${path}`);
  const { balance } = ctx;
  const setBonus = (i: number, patch: Partial<PermanentBonus>) =>
    set(
      'bonuses',
      value.bonuses.map((b, j) => (j === i ? ({ ...b, ...patch } as PermanentBonus) : b)),
    );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Poké Dollars" error={err('currency')}>
          <NumberInput
            value={value.currency}
            min={0}
            step={100}
            unit="₽"
            onChange={(v) => set('currency', v)}
            disabled={disabled}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Emplacements d’expédition"
          hint={`Départ ${balance.expeditions.initialSlots}, max ${balance.expeditions.maxSlots}`}
          error={err('expeditionSlots')}
        >
          <NumberInput
            value={value.expeditionSlots}
            min={0}
            max={6}
            unit="+"
            onChange={(v) => set('expeditionSlots', v)}
            disabled={disabled}
          />
        </Field>
        <Field
          label="Emplacements de combat"
          hint={`Départ ${balance.battles.initialSlots}, max ${balance.battles.maxSlots}`}
          error={err('battleSlots')}
        >
          <NumberInput
            value={value.battleSlots}
            min={0}
            max={6}
            unit="+"
            onChange={(v) => set('battleSlots', v)}
            disabled={disabled}
          />
        </Field>
        <Field
          label="Pensions"
          hint={`Départ ${balance.daycare.initialSlots}, max ${balance.daycare.maxSlots}`}
          error={err('daycareSlots')}
        >
          <NumberInput
            value={value.daycareSlots}
            min={0}
            max={10}
            unit="+"
            onChange={(v) => set('daycareSlots', v)}
            disabled={disabled}
          />
        </Field>
      </div>

      <Field label="Objets">
        <div className="space-y-2">
          {value.items.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <ItemSelect
                ctx={ctx}
                value={s.itemId}
                disabled={disabled}
                onChange={(itemId) =>
                  itemId &&
                  set(
                    'items',
                    value.items.map((x, j) => (j === i ? { ...x, itemId } : x)),
                  )
                }
              />
              <NumberInput
                className="w-32"
                value={s.quantity}
                min={1}
                unit="×"
                disabled={disabled}
                onChange={(quantity) =>
                  set(
                    'items',
                    value.items.map((x, j) => (j === i ? { ...x, quantity } : x)),
                  )
                }
              />
              {!disabled && (
                <button
                  type="button"
                  className="text-slate-400 hover:text-red-600"
                  onClick={() =>
                    set(
                      'items',
                      value.items.filter((_, j) => j !== i),
                    )
                  }
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {!disabled && ctx.content.items.length > 0 && (
            <button
              type="button"
              className="btn-ghost py-1 text-xs"
              onClick={() =>
                set('items', [...value.items, { itemId: ctx.content.items[0]!.id, quantity: 1 }])
              }
            >
              + Objet
            </button>
          )}
        </div>
      </Field>

      <Field
        label="Bonus permanents"
        hint="Actifs dès que le joueur réclame la récompense ; les bonus de même type s’additionnent."
      >
        <div className="space-y-2">
          {value.bonuses.map((b, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <SelectInput
                value={b.type}
                disabled={disabled}
                onChange={(type) => setBonus(i, { type })}
                options={(Object.keys(BONUS_LABELS) as PermanentBonusType[]).map((t) => ({
                  value: t,
                  label: BONUS_LABELS[t],
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
                  onClick={() =>
                    set(
                      'bonuses',
                      value.bonuses.filter((_, j) => j !== i),
                    )
                  }
                >
                  ✕
                </button>
              )}
              {err(`bonuses.${i}.percent`) && (
                <span className="text-xs text-red-600">{err(`bonuses.${i}.percent`)}</span>
              )}
            </div>
          ))}
          {!disabled && (
            <button
              type="button"
              className="btn-ghost py-1 text-xs"
              onClick={() => set('bonuses', [...value.bonuses, { type: 'capture', percent: 5 }])}
            >
              + Bonus
            </button>
          )}
        </div>
      </Field>
    </div>
  );
}
