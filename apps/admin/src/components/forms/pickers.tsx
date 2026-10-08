import { useState } from 'react';
import type { BaseUnlockCondition, Quest, Region, Trainer, UnlockCondition } from '@poke/content';
import {
  TYPE_COLORS,
  itemSpriteUrl,
  pokemonSprite,
  pokemonSpriteUrl,
  species as allSpecies,
  speciesForms,
  types,
} from '@poke/data';
import type { FormKind } from '@poke/data';
import type { GameContext } from '@poke/game-core';
import { NumberInput } from './fields';

/** Sélecteurs avec recherche et aperçu (sprites, icônes, couleurs de type). */

/** Catégories de formes, dans l'ordre d'affichage du sélecteur. */
const FORM_KINDS: [FormKind, string][] = [
  ['regional', 'Formes régionales'],
  ['alternate', 'Formes alternatives'],
  ['cosmetic', 'Apparences'],
  ['mega', 'Méga-Évolutions'],
  ['primal', 'Primo-Résurgences'],
  ['gmax', 'Gigamax'],
  ['battle', 'Formes de combat'],
  ['totem', 'Pokémon Dominants'],
];

const typeNames = new Map(types.map((t) => [t.name, t.nameFr]));
export const typeLabel = (t: string) => typeNames.get(t) ?? t;

export function Sprite({
  id,
  formId = null,
  size = 40,
  className = '',
}: {
  id: number;
  /** Forme de l'espèce (régionale, Méga, Gigamax…), qui a ses propres sprites. */
  formId?: number | null;
  size?: number;
  className?: string;
}) {
  return (
    <img
      src={pokemonSpriteUrl(pokemonSprite(id, formId))}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      className={`shrink-0 [image-rendering:pixelated] ${className}`}
    />
  );
}

export function ItemIcon({ ctx, id, size = 28 }: { ctx: GameContext; id: string; size?: number }) {
  return (
    <img
      src={ctx.item(id)?.icon ?? itemSpriteUrl(id)}
      alt=""
      width={size}
      height={size}
      className="shrink-0 [image-rendering:pixelated]"
    />
  );
}

export function TypeBadge({ type }: { type: string }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white uppercase"
      style={{ backgroundColor: TYPE_COLORS[type] ?? '#888' }}
    >
      {typeLabel(type)}
    </span>
  );
}

/** Choix d'une espèce par nom ou numéro. */
export function SpeciesSelect({
  ctx,
  value,
  onChange,
  disabled,
}: {
  ctx: GameContext;
  value: number | null;
  onChange: (id: number) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const needle = query.trim().toLowerCase();
  const results = allSpecies
    .filter(
      (s) =>
        !needle ||
        String(s.id) === needle ||
        ctx.species(s.id)!.nameFr.toLowerCase().includes(needle) ||
        s.name.includes(needle),
    )
    .slice(0, 30);
  const current = value ? ctx.species(value) : undefined;

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        className="input flex items-center gap-2 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        {current ? (
          <>
            <Sprite id={current.id} size={28} />
            <span className="truncate">
              #{current.id} {current.nameFr}
            </span>
          </>
        ) : (
          <span className="text-slate-400">Choisir une espèce…</span>
        )}
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <input
            className="input"
            autoFocus
            placeholder="Nom ou numéro"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          />
          <ul className="mt-1 max-h-60 overflow-y-auto">
            {results.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                  onClick={() => {
                    onChange(s.id);
                    setOpen(false);
                    setQuery('');
                  }}
                >
                  <Sprite id={s.id} size={28} />#{s.id} {ctx.species(s.id)?.nameFr}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Forme d'une espèce (régionale ou alternative), affichée seulement si l'espèce en a :
 * « Forme par défaut » ou l'une des variétés PokéAPI importées.
 */
export function FormSelect({
  speciesId,
  value,
  onChange,
  disabled,
}: {
  speciesId: number | null;
  value: number | null | undefined;
  onChange: (formId: number | null) => void;
  disabled?: boolean;
}) {
  const forms = speciesId ? speciesForms(speciesId) : [];
  if (forms.length === 0) return null;
  return (
    <select
      className="input mt-1"
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
    >
      <option value="">Forme par défaut</option>
      {FORM_KINDS.map(([kind, label]) => {
        const group = forms.filter((f) => f.kind === kind);
        return (
          group.length > 0 && (
            <optgroup key={kind} label={label}>
              {group.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nameFr}
                </option>
              ))}
            </optgroup>
          )
        );
      })}
    </select>
  );
}

/** Ensemble d'espèces (grille de sprites à cocher, filtres par génération). */
export function SpeciesSetEditor({
  ctx,
  value,
  onChange,
  disabled,
  candidates,
}: {
  ctx: GameContext;
  value: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
  /** Espèces proposées (par défaut : toutes les espèces importées). */
  candidates?: number[];
}) {
  const ids = candidates ?? allSpecies.map((s) => s.id);
  const selected = new Set(value);
  const generations = [
    ...new Set(allSpecies.filter((s) => ids.includes(s.id)).map((s) => s.generation)),
  ];
  const set = (next: Set<number>) => onChange([...next].sort((a, b) => a - b));

  return (
    <div>
      {!disabled && (
        <div className="mb-2 flex flex-wrap gap-2 text-xs">
          <button type="button" className="btn-ghost px-2 py-1" onClick={() => set(new Set(ids))}>
            Tout
          </button>
          <button type="button" className="btn-ghost px-2 py-1" onClick={() => set(new Set())}>
            Aucune
          </button>
          {generations.length > 1 &&
            generations.map((g) => (
              <button
                key={g}
                type="button"
                className="btn-ghost px-2 py-1"
                onClick={() =>
                  set(
                    new Set([
                      ...selected,
                      ...allSpecies.filter((s) => s.generation === g).map((s) => s.id),
                    ]),
                  )
                }
              >
                + Gén. {g}
              </button>
            ))}
          <span className="self-center text-slate-500">{value.length} sélectionnée(s)</span>
        </div>
      )}
      <div className="grid max-h-72 grid-cols-6 gap-1 overflow-y-auto sm:grid-cols-10 lg:grid-cols-14">
        {ids.map((id) => {
          const on = selected.has(id);
          return (
            <button
              key={id}
              type="button"
              disabled={disabled}
              title={`#${id} ${ctx.species(id)?.nameFr}`}
              onClick={() => {
                const next = new Set(selected);
                if (on) next.delete(id);
                else next.add(id);
                set(next);
              }}
              className={`rounded-lg border p-0.5 transition ${
                on
                  ? 'border-brand-500 bg-brand-500/10'
                  : 'border-transparent opacity-40 grayscale hover:opacity-80'
              }`}
            >
              <Sprite id={id} size={40} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TypeMultiSelect({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {types.map((t) => {
        const on = value.includes(t.name);
        return (
          <button
            key={t.name}
            type="button"
            disabled={disabled}
            onClick={() => onChange(on ? value.filter((v) => v !== t.name) : [...value, t.name])}
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase transition ${
              on ? 'text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
            }`}
            style={on ? { backgroundColor: TYPE_COLORS[t.name] ?? '#888' } : undefined}
          >
            {t.nameFr}
          </button>
        );
      })}
    </div>
  );
}

export function TypeSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <select
      className="input"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {types.map((t) => (
        <option key={t.name} value={t.name}>
          {t.nameFr}
        </option>
      ))}
    </select>
  );
}

/** Objet du catalogue du contenu (optionnellement filtré, ex. Balls uniquement). */
export function ItemSelect({
  ctx,
  value,
  onChange,
  disabled,
  allowNone = false,
  filter = () => true,
}: {
  ctx: GameContext;
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  allowNone?: boolean;
  filter?: (itemId: string) => boolean;
}) {
  const items = ctx.content.items.filter((i) => filter(i.id));
  const known = value === null || items.some((i) => i.id === value);
  return (
    <div className="flex items-center gap-2">
      {value && <ItemIcon ctx={ctx} id={value} />}
      <select
        className="input"
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || null)}
      >
        {(allowNone || value === null) && (
          <option value="">{allowNone ? 'Aucun' : 'Choisir…'}</option>
        )}
        {!known && <option value={value}>{value} (inconnu)</option>}
        {items.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name} ({i.id})
          </option>
        ))}
      </select>
    </div>
  );
}

const COUNT_UNITS = { badgeCount: 'badge(s)', speciesCaught: 'espèce(s)', eggsHatched: 'œuf(s)' };

/** Éditeur visuel d'une condition de déblocage : type, puis paramètres. */
export function UnlockEditor({
  value,
  onChange,
  regions,
  trainers = [],
  quests = [],
  disabled,
  nested,
}: {
  value: UnlockCondition;
  onChange: (v: UnlockCondition) => void;
  regions: readonly Region[];
  /** Dresseurs proposés pour « avoir battu un dresseur ». */
  trainers?: readonly Trainer[];
  /** Quêtes proposées pour les conditions d'avancement de quête. */
  quests?: readonly Quest[];
  disabled?: boolean;
  /** Brique d'un « toutes ces conditions » : pas de combinaison imbriquée. */
  nested?: boolean;
}) {
  const initial = (type: UnlockCondition['type']): UnlockCondition => {
    switch (type) {
      case 'always':
        return { type };
      case 'regionDexPercent':
        return { type, regionId: regions[0]?.id ?? '', percent: 10 };
      case 'trainerDefeated':
        return { type, trainerId: trainers[0]?.id ?? '' };
      case 'badgeCount':
      case 'speciesCaught':
      case 'eggsHatched':
        return { type, count: type === 'badgeCount' ? 1 : 10 };
      case 'questStepsDone':
        return { type, questId: quests[0]?.id ?? '', count: 1 };
      case 'questCompleted':
        return { type, questId: quests[0]?.id ?? '' };
      case 'allOf':
        return {
          type,
          conditions: [
            value.type === 'always' || value.type === 'allOf'
              ? { type: 'badgeCount', count: 1 }
              : value,
            { type: 'speciesCaught', count: 10 },
          ],
        };
    }
  };
  const editorProps = { regions, trainers, quests, disabled, nested: true };
  const quest = 'questId' in value ? quests.find((q) => q.id === value.questId) : undefined;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className="input w-auto"
        value={value.type}
        disabled={disabled}
        onChange={(e) => onChange(initial(e.target.value as UnlockCondition['type']))}
      >
        <option value="always">Toujours disponible</option>
        <option value="regionDexPercent">% du Pokédex d’une région</option>
        <option value="trainerDefeated" disabled={trainers.length === 0}>
          Avoir battu un dresseur
        </option>
        <option value="badgeCount">Nombre de badges</option>
        <option value="speciesCaught">Nombre d’espèces capturées</option>
        <option value="eggsHatched">Nombre d’œufs éclos</option>
        <option value="questStepsDone" disabled={quests.length === 0}>
          Étapes validées d’une quête
        </option>
        <option value="questCompleted" disabled={quests.length === 0}>
          Quête terminée
        </option>
        {!nested && <option value="allOf">Plusieurs conditions (toutes)</option>}
      </select>
      {value.type === 'allOf' && (
        <div className="basis-full space-y-2 border-l-2 border-slate-200 pl-3 dark:border-slate-700">
          {value.conditions.map((condition, i) => (
            <div key={i} className="flex items-start gap-2">
              <UnlockEditor
                {...editorProps}
                value={condition}
                onChange={(c) =>
                  onChange({
                    ...value,
                    conditions: value.conditions.with(i, c as BaseUnlockCondition),
                  })
                }
              />
              <button
                type="button"
                className="btn-ghost px-2 py-1 text-xs"
                disabled={disabled || value.conditions.length <= 2}
                title="Au moins deux conditions"
                onClick={() =>
                  onChange({ ...value, conditions: value.conditions.filter((_, j) => j !== i) })
                }
              >
                Retirer
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn-ghost py-1 text-xs"
            disabled={disabled || value.conditions.length >= 5}
            onClick={() =>
              onChange({
                ...value,
                conditions: [...value.conditions, { type: 'badgeCount', count: 1 }],
              })
            }
          >
            + Ajouter une condition
          </button>
        </div>
      )}
      {value.type === 'questStepsDone' && (
        <NumberInput
          className="w-36"
          value={value.count}
          min={1}
          max={quest?.steps.length ?? 20}
          unit="étape(s) de"
          disabled={disabled}
          onChange={(count) => onChange({ ...value, count })}
        />
      )}
      {(value.type === 'questStepsDone' || value.type === 'questCompleted') && (
        <select
          className="input w-auto"
          value={value.questId}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, questId: e.target.value })}
        >
          {!quest && <option value={value.questId}>{value.questId || '—'} (inconnue)</option>}
          {quests.map((q) => (
            <option key={q.id} value={q.id}>
              {q.name}
            </option>
          ))}
        </select>
      )}
      {value.type === 'regionDexPercent' && (
        <>
          <NumberInput
            className="w-28"
            value={value.percent}
            min={0}
            max={100}
            step={1}
            unit="%"
            disabled={disabled}
            onChange={(percent) => onChange({ ...value, percent })}
          />
          <span className="text-sm text-slate-500">de</span>
          <select
            className="input w-auto"
            value={value.regionId}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, regionId: e.target.value })}
          >
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </>
      )}
      {value.type === 'trainerDefeated' && (
        <select
          className="input w-auto"
          value={value.trainerId}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, trainerId: e.target.value })}
        >
          {!trainers.some((t) => t.id === value.trainerId) && (
            <option value={value.trainerId}>{value.trainerId} (inconnu)</option>
          )}
          {trainers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.trainerClass} {t.name}
            </option>
          ))}
        </select>
      )}
      {(value.type === 'badgeCount' ||
        value.type === 'speciesCaught' ||
        value.type === 'eggsHatched') && (
        <NumberInput
          className="w-36"
          value={value.count}
          min={1}
          max={value.type === 'badgeCount' ? 100 : undefined}
          unit={COUNT_UNITS[value.type]}
          disabled={disabled}
          onChange={(count) => onChange({ ...value, count })}
        />
      )}
    </div>
  );
}
