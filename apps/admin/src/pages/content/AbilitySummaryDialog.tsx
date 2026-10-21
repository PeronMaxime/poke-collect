import { useState } from 'react';
import { ABILITY_PARAM_IDS, IMPOSED_WEATHERS, STATUSES, WEATHERS } from '@poke/content';
import type { AbilityEffect, AbilityEffectType, GameAbility } from '@poke/content';
import type { Ability } from '@poke/data';
import {
  ABILITY_ACTIVITY_LABELS,
  ABILITY_EFFECT_LABELS,
  ABILITY_PARAMS,
  STATUS_LABELS,
  WEATHER_LABELS,
  effectActivities,
} from '@poke/game-core';
import type { AbilityActivity, GameContext } from '@poke/game-core';

export interface SummaryRow {
  ability: Ability;
  entry: GameAbility | undefined;
}

const ACTIVITIES = Object.keys(ABILITY_ACTIVITY_LABELS) as AbilityActivity[];

interface Line {
  label: string;
  /** Noms des talents concernés, triés. */
  names: string[];
}

/** Talents dont au moins un effet vérifie `test`. */
function line(rows: readonly SummaryRow[], label: string, test: (e: AbilityEffect) => boolean) {
  const names = rows
    .filter((r) => r.entry?.effects.some(test))
    .map((r) => r.ability.nameFr)
    .sort((a, b) => a.localeCompare(b, 'fr'));
  return { label, names };
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function sections(rows: readonly SummaryRow[]): { title: string; lines: Line[] }[] {
  const conditionWeather = (e: AbilityEffect) =>
    e.conditions.flatMap((c) => (c.type === 'weather' ? c.weathers : []));
  const paramGroups = [...new Set(ABILITY_PARAM_IDS.map((p) => ABILITY_PARAMS[p].group))];
  return [
    {
      title: 'Par activité',
      lines: ACTIVITIES.map((a) =>
        line(rows, capitalize(ABILITY_ACTIVITY_LABELS[a]), (e) => effectActivities(e).includes(a)),
      ),
    },
    {
      title: 'Météo',
      lines: [
        line(rows, 'Impose une météo', (e) => e.type === 'setWeather'),
        ...IMPOSED_WEATHERS.map((w) =>
          line(rows, `— ${WEATHER_LABELS[w]}`, (e) => e.type === 'setWeather' && e.weather === w),
        ),
        line(rows, 'Effet qui dépend de la météo', (e) => conditionWeather(e).length > 0),
        ...WEATHERS.map((w) =>
          line(rows, `— ${WEATHER_LABELS[w]}`, (e) => conditionWeather(e).includes(w)),
        ),
        line(rows, 'Insensible à la météo', (e) => e.type === 'weatherImmunity'),
      ],
    },
    {
      title: 'Statuts',
      lines: [
        line(rows, 'Inflige un statut', (e) => e.type === 'inflictStatus'),
        ...STATUSES.map((s) =>
          line(rows, `— ${STATUS_LABELS[s]}`, (e) => e.type === 'inflictStatus' && e.status === s),
        ),
        line(rows, 'Immunité à des statuts', (e) => e.type === 'statusImmunity'),
        line(rows, 'Guéri au rappel', (e) => e.type === 'naturalCure'),
      ],
    },
    {
      title: 'Par type d’effet',
      lines: (Object.keys(ABILITY_EFFECT_LABELS) as AbilityEffectType[]).map((t) =>
        line(rows, ABILITY_EFFECT_LABELS[t], (e) => e.type === t),
      ),
    },
    ...paramGroups.map((group) => ({
      title: `Modificateurs · ${group}`,
      lines: ABILITY_PARAM_IDS.filter((p) => ABILITY_PARAMS[p].group === group).map((p) =>
        line(rows, ABILITY_PARAMS[p].label, (e) => e.type === 'modifier' && e.param === p),
      ),
    })),
  ];
}

/** Récapitulatif des effets de talents réglés, pour une région ou tout le jeu. */
export function AbilitySummaryDialog({
  ctx,
  initialRegion,
  rowsFor,
  onClose,
}: {
  ctx: GameContext;
  initialRegion: string;
  rowsFor: (region: string) => SummaryRow[];
  onClose: () => void;
}) {
  const [region, setRegion] = useState(initialRegion);
  const rows = rowsFor(region);
  const withEffect = rows.filter((r) => r.entry && r.entry.effects.length > 0);
  const effectCount = withEffect.reduce((n, r) => n + r.entry!.effects.length, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="card w-full max-w-4xl space-y-5 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Récapitulatif des talents</h2>
            <p className="mt-1 text-sm text-slate-500">
              Nombre de talents (et non d’effets) concernés, parmi ceux que possède au moins un
              Pokémon de la sélection. Cliquez sur une ligne pour voir les talents.
            </p>
          </div>
          <button className="btn-ghost px-3 py-1" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <select
            className="input w-auto"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            aria-label="Région"
          >
            <option value="game">Toutes les régions du jeu</option>
            {ctx.regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.enabled ? '' : ' (désactivée)'}
              </option>
            ))}
            <option value="all">Tous les Pokémon (hors jeu compris)</option>
          </select>
          <span className="text-sm text-slate-500">
            {withEffect.length} / {rows.length} talent(s) avec un effet · {effectCount} effet(s)
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {sections(rows).map((section) => (
            <section key={section.title} className="space-y-1">
              <h3 className="text-sm font-semibold">{section.title}</h3>
              <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
                {section.lines.map((l) => (
                  <SummaryLine key={l.label} line={l} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function SummaryLine({ line: { label, names } }: { line: Line }) {
  const muted = names.length === 0;
  const head = (
    <span className="flex justify-between gap-3">
      <span className={muted ? 'text-slate-400' : ''}>{label}</span>
      <span className={`font-medium tabular-nums ${muted ? 'text-slate-400' : ''}`}>
        {names.length}
      </span>
    </span>
  );
  if (muted) return <li className="py-1">{head}</li>;
  return (
    <li className="py-1">
      <details>
        <summary className="cursor-pointer list-none hover:text-brand-600">{head}</summary>
        <p className="mt-1 text-xs text-slate-500">{names.join(', ')}</p>
      </details>
    </li>
  );
}
