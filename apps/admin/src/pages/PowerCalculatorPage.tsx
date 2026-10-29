import { useState } from 'react';
import type { ReactNode } from 'react';
import { STAT_NAMES, abilities as abilityData, natures } from '@poke/data';
import type { Stats } from '@poke/data';
import {
  MAX_IV,
  MAX_LEVEL,
  NO_ABILITY,
  expeditionEnv,
  legendarySite,
  memberPower,
  missingTypes,
  outOfRegionSpecies,
  teamPower,
} from '@poke/game-core';
import type { ExpeditionSite, GameContext, PokemonInstance } from '@poke/game-core';
import { VersionBanner } from '../components/EntityPage';
import {
  FormSelect,
  Sprite,
  SpeciesSelect,
  TypeBadge,
  typeLabel,
} from '../components/forms/pickers';
import { errorMessage, useWorkingVersion } from '../lib/content';
import { useStored } from './ExpeditionSimulatorPage';

/** Membre d'une équipe de test : IV uniformes sur les 6 statistiques. */
interface CalcMember {
  key: string;
  speciesId: number;
  formId: number | null;
  level: number;
  iv: number;
  nature: string;
  ability: string;
}

interface CalcTeam {
  id: string;
  name: string;
  members: CalcMember[];
}

/** Niveaux de la courbe de PE de l'équipe. */
const CURVE_LEVELS = [5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100];

const newId = () => Math.random().toString(36).slice(2, 10);
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.floor(value) || min));
const abilityNames = new Map(abilityData.map((a) => [a.name, a.nameFr]));
/** Natures neutres d'abord (une seule suffit pour la PE), puis les autres par nom. */
const NATURE_OPTIONS = [
  { name: 'hardy', label: 'Neutre' },
  ...natures
    .filter((n) => n.increasedStat && n.increasedStat !== n.decreasedStat)
    .map((n) => ({ name: n.name, label: n.nameFr }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fr')),
];

function instance(m: CalcMember, level = m.level): PokemonInstance {
  return {
    speciesId: m.speciesId,
    formId: m.formId,
    level,
    xp: 0,
    ivs: Object.fromEntries(STAT_NAMES.map((s) => [s, m.iv])) as Stats,
    nature: m.nature,
    ability: m.ability,
    isShiny: false,
    gender: 'genderless',
    happiness: 0,
  };
}

/** Lieu comparé : une zone, ou le repaire d'un légendaire de quête (activité « quête »). */
interface CalcSite {
  key: string;
  label: ReactNode;
  detail?: ReactNode;
  enabled: boolean;
  site: ExpeditionSite;
  activity: 'expedition' | 'quest';
}

/** PE de l'équipe sur le lieu (affinités comprises, temps clair, heure indifférente). */
function sitePower(ctx: GameContext, place: CalcSite, team: readonly PokemonInstance[]) {
  return teamPower(ctx, team, expeditionEnv(place.site, team, null, place.activity));
}

/**
 * Plus petit niveau commun à toute l'équipe pour atteindre la PE minimale du lieu (la PE croît
 * avec le niveau) ; null si même le niveau maximal ne suffit pas.
 */
function requiredLevel(ctx: GameContext, place: CalcSite, members: readonly CalcMember[]) {
  const { minPower } = place.site;
  const powerAt = (level: number) =>
    sitePower(
      ctx,
      place,
      members.map((m) => instance(m, level)),
    );
  if (powerAt(MAX_LEVEL) < minPower) return null;
  let low = 1;
  let high = MAX_LEVEL;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (powerAt(mid) >= minPower) high = mid;
    else low = mid + 1;
  }
  return low;
}

/**
 * Calculateur de PE : équipes de test (espèce, niveau, IV, nature, talent) gardées dans ce
 * navigateur, et comparaison avec la PE minimale des zones et des expéditions légendaires d'une
 * région, pour équilibrer les niveaux des expéditions sur la version de travail.
 */
export function PowerCalculatorPage() {
  const { data: w, isPending, error } = useWorkingVersion();
  const [teams, setTeams] = useStored<CalcTeam[]>('power-calculator-teams', []);
  const [currentId, setCurrentId] = useStored<string | null>('power-calculator-current', null);
  const [regionId, setRegionId] = useStored<string | null>('power-calculator-region', null);
  const [defaultLevel, setDefaultLevel] = useState(30);
  const [defaultIv, setDefaultIv] = useState(15);

  if (isPending) return <p className="text-sm text-slate-500">Chargement…</p>;
  if (!w) return <p className="text-sm text-red-600">{errorMessage(error)}</p>;
  const { ctx } = w;
  const region = ctx.region(regionId ?? '') ?? ctx.regions[0];
  const maxSize = ctx.balance.expeditions.maxTeamSize;
  const team = teams.find((t) => t.id === currentId) ?? teams[0];
  const members = team?.members ?? [];

  const saveTeam = (next: CalcTeam) => setTeams(teams.map((t) => (t.id === next.id ? next : t)));
  const setMembers = (next: CalcMember[]) => team && saveTeam({ ...team, members: next });
  const updateMember = (key: string, patch: Partial<CalcMember>) =>
    setMembers(members.map((m) => (m.key === key ? { ...m, ...patch } : m)));
  const createTeam = (from?: CalcTeam) => {
    const created: CalcTeam = {
      id: newId(),
      name: from ? `${from.name} (copie)` : `Équipe ${teams.length + 1}`,
      members: from ? from.members.map((m) => ({ ...m, key: newId() })) : [],
    };
    setTeams([...teams, created]);
    setCurrentId(created.id);
  };
  const removeTeam = (id: string) => {
    const rest = teams.filter((t) => t.id !== id);
    setTeams(rest);
    setCurrentId(rest[0]?.id ?? null);
  };
  const memberOf = (speciesId: number): CalcMember => ({
    key: newId(),
    speciesId,
    formId: null,
    level: defaultLevel,
    iv: defaultIv,
    nature: 'hardy',
    ability: NO_ABILITY,
  });
  const fillRandom = () => {
    const pool = (region?.speciesIds ?? []).filter(
      (id) => ctx.species(id)?.enabled && !members.some((m) => m.speciesId === id),
    );
    const added: CalcMember[] = [];
    while (members.length + added.length < maxSize && pool.length > 0) {
      const [id] = pool.splice(Math.floor(Math.random() * pool.length), 1);
      added.push(memberOf(id!));
    }
    setMembers([...members, ...added]);
  };

  const instances = members.map((m) => instance(m));
  const basePower = instances.reduce((sum, p) => sum + memberPower(ctx, p), 0);
  const zones: CalcSite[] = ctx.zones
    .filter((z) => z.regionId === region?.id)
    .sort((a, b) => a.order - b.order)
    .map((z) => ({
      key: z.id,
      label: z.name,
      enabled: z.enabled,
      site: z,
      activity: 'expedition',
    }));
  // Quêtes de la région, puis celles sans région (ouvertes à toutes) ; les fuyards n'ont pas
  // d'expédition légendaire.
  const legendaries: CalcSite[] = ctx.quests
    .filter((q) => q.regionId === region?.id || q.regionId === null)
    .sort((a, b) => Number(a.regionId === null) - Number(b.regionId === null) || a.order - b.order)
    .flatMap((q) =>
      q.rewards.pokemon
        .filter((p) => p.roaming === null)
        .map((p, i) => ({
          key: `${q.id}:${i}`,
          label: (
            <span className="flex items-center gap-1">
              <Sprite id={p.speciesId} formId={p.formId} size={28} />
              {ctx.species(p.speciesId, p.formId)?.nameFr ?? `#${p.speciesId}`}
            </span>
          ),
          detail: `Quête « ${q.name} »${q.regionId === null ? ' (toutes régions)' : ''}`,
          enabled: q.enabled,
          site: legendarySite(q, p),
          activity: 'quest' as const,
        })),
    );
  const outside = region ? outOfRegionSpecies(ctx, region.id, members) : [];

  return (
    <div className="space-y-6">
      <VersionBanner working={w} />
      <div>
        <h1 className="text-xl font-bold">Calculateur de PE</h1>
        <p className="text-sm text-slate-500">
          Équipes de test gardées dans ce navigateur, comparées à la PE minimale des zones et des
          expéditions légendaires de la version de travail : PE de l’équipe dans chaque zone
          (talents et affinités compris, temps clair) et niveau commun à atteindre pour y partir.
        </p>
      </div>

      <section className="card space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {teams.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setCurrentId(t.id)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                t.id === team?.id
                  ? 'bg-brand-500 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              {t.name} · {t.members.length}
            </button>
          ))}
          <button type="button" className="btn-ghost text-sm" onClick={() => createTeam()}>
            + Nouvelle équipe
          </button>
        </div>

        {team ? (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <input
                className="input w-56"
                value={team.name}
                aria-label="Nom de l’équipe"
                onChange={(e) => saveTeam({ ...team, name: e.target.value })}
              />
              <button type="button" className="btn-ghost text-sm" onClick={() => createTeam(team)}>
                Dupliquer
              </button>
              <button
                type="button"
                className="text-sm text-red-600 hover:underline"
                onClick={() => removeTeam(team.id)}
              >
                Supprimer
              </button>
              <span className="ml-auto text-lg font-bold">PE {basePower}</span>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-800/50">
              <label className="flex items-center gap-2">
                <span className="text-slate-500">Niveau</span>
                <input
                  type="number"
                  className="input w-16 py-0.5 text-xs"
                  min={1}
                  max={MAX_LEVEL}
                  value={defaultLevel}
                  onChange={(e) => setDefaultLevel(clamp(Number(e.target.value), 1, MAX_LEVEL))}
                />
              </label>
              <label className="flex items-center gap-2">
                <span className="text-slate-500">IV</span>
                <input
                  type="number"
                  className="input w-16 py-0.5 text-xs"
                  min={0}
                  max={MAX_IV}
                  value={defaultIv}
                  onChange={(e) => setDefaultIv(clamp(Number(e.target.value), 0, MAX_IV))}
                />
              </label>
              <button
                type="button"
                className="btn-ghost px-2 py-0.5 text-xs"
                disabled={members.length === 0}
                onClick={() =>
                  setMembers(members.map((m) => ({ ...m, level: defaultLevel, iv: defaultIv })))
                }
              >
                Appliquer à toute l’équipe
              </button>
              <span className="text-slate-400">
                Valeurs des nouveaux membres (IV 15 ≈ Pokémon sauvage moyen, 31 = parfait).
              </span>
            </div>

            {members.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-slate-500">
                    <tr>
                      <th className="py-1 pr-2">Pokémon</th>
                      <th className="px-2 py-1">Niveau</th>
                      <th className="px-2 py-1">IV</th>
                      <th className="px-2 py-1">Nature</th>
                      <th className="px-2 py-1">Talent</th>
                      <th className="px-2 py-1 text-right">PE</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m, i) => {
                      const species = ctx.species(m.speciesId, m.formId);
                      return (
                        <tr
                          key={m.key}
                          className="border-t border-slate-100 align-top dark:border-slate-800"
                        >
                          <td className="w-64 py-1.5 pr-2">
                            <SpeciesSelect
                              ctx={ctx}
                              value={m.speciesId}
                              onChange={(id) =>
                                updateMember(m.key, {
                                  speciesId: id,
                                  formId: null,
                                  ability: NO_ABILITY,
                                })
                              }
                            />
                            <FormSelect
                              speciesId={m.speciesId}
                              value={m.formId}
                              onChange={(formId) =>
                                updateMember(m.key, { formId, ability: NO_ABILITY })
                              }
                            />
                            <div className="mt-1 flex flex-wrap gap-1">
                              {species?.types.map((t) => (
                                <TypeBadge key={t} type={t} />
                              ))}
                              {outside.includes(m.speciesId) && (
                                <span className="text-xs text-amber-600">
                                  Hors du Pokédex de {region?.name}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="number"
                              className="input w-16"
                              min={1}
                              max={MAX_LEVEL}
                              value={m.level}
                              onChange={(e) =>
                                updateMember(m.key, {
                                  level: clamp(Number(e.target.value), 1, MAX_LEVEL),
                                })
                              }
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="number"
                              className="input w-16"
                              min={0}
                              max={MAX_IV}
                              value={m.iv}
                              onChange={(e) =>
                                updateMember(m.key, {
                                  iv: clamp(Number(e.target.value), 0, MAX_IV),
                                })
                              }
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <select
                              className="input"
                              value={m.nature}
                              onChange={(e) => updateMember(m.key, { nature: e.target.value })}
                            >
                              {NATURE_OPTIONS.map((n) => (
                                <option key={n.name} value={n.name}>
                                  {n.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-1.5">
                            <select
                              className="input"
                              value={m.ability}
                              onChange={(e) => updateMember(m.key, { ability: e.target.value })}
                            >
                              <option value={NO_ABILITY}>Aucun talent</option>
                              {species?.abilities.map((a) => (
                                <option key={a.name} value={a.name}>
                                  {abilityNames.get(a.name) ?? a.name}
                                  {a.isHidden ? ' (caché)' : ''}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-1.5 text-right font-semibold tabular-nums">
                            {memberPower(ctx, instances[i]!)}
                          </td>
                          <td className="py-1.5 pl-2 text-right">
                            <button
                              type="button"
                              className="text-slate-400 hover:text-red-600"
                              aria-label="Retirer de l’équipe"
                              onClick={() => setMembers(members.filter((q) => q.key !== m.key))}
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {members.length < maxSize ? (
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-64">
                  <SpeciesSelect
                    ctx={ctx}
                    value={null}
                    onChange={(id) => setMembers([...members, memberOf(id)])}
                  />
                </div>
                <button type="button" className="btn-ghost text-sm" onClick={fillRandom}>
                  Compléter au hasard ({region?.name})
                </button>
                <span className="text-xs text-slate-400">
                  {members.length} / {maxSize} Pokémon
                </span>
              </div>
            ) : (
              <p className="text-xs text-slate-400">
                Équipe complète ({maxSize} Pokémon au plus en expédition).
              </p>
            )}

            {members.length > 0 && (
              <div className="overflow-x-auto">
                <table className="text-xs tabular-nums">
                  <tbody>
                    <tr>
                      <th className="pr-3 text-left font-medium text-slate-500">Niveau commun</th>
                      {CURVE_LEVELS.map((l) => (
                        <td key={l} className="px-2 text-right text-slate-500">
                          {l}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <th className="pr-3 text-left font-medium text-slate-500">PE</th>
                      {CURVE_LEVELS.map((l) => (
                        <td key={l} className="px-2 text-right font-semibold">
                          {members.reduce((sum, m) => sum + memberPower(ctx, instance(m, l)), 0)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-500">
            Aucune équipe : créez-en une pour calculer sa PE.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap gap-1" role="tablist">
          {ctx.regions.map((r) => (
            <button
              key={r.id}
              role="tab"
              aria-selected={r.id === region?.id}
              onClick={() => setRegionId(r.id)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                r.id === region?.id
                  ? 'bg-brand-500 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              {r.name}
              {!r.enabled && ' (désactivée)'}
            </button>
          ))}
        </div>
        <SiteTable
          ctx={ctx}
          title={`Zones de ${region?.name}`}
          column="Zone"
          empty="Aucune zone."
          sites={zones}
          members={members}
          instances={instances}
        />
        <SiteTable
          ctx={ctx}
          title={`Expéditions légendaires de ${region?.name}`}
          column="Légendaire"
          empty="Aucune expédition légendaire (les Pokémon fuyards n’en ont pas)."
          sites={legendaries}
          members={members}
          instances={instances}
        />
      </section>
    </div>
  );
}

function SiteTable({
  ctx,
  title,
  column,
  empty,
  sites,
  members,
  instances,
}: {
  ctx: GameContext;
  title: string;
  column: string;
  empty: string;
  sites: CalcSite[];
  members: CalcMember[];
  instances: PokemonInstance[];
}) {
  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {sites.length === 0 ? (
        <p className="text-sm text-slate-500">{empty}</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2">{column}</th>
                <th className="px-3 py-2 text-right">PE minimale</th>
                <th className="px-3 py-2 text-right">PE de l’équipe</th>
                <th className="px-3 py-2 text-right">Écart</th>
                <th className="px-3 py-2 text-right" title="Toute l’équipe à ce niveau">
                  Niveau requis
                </th>
                <th className="px-3 py-2">Conditions</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((place) => (
                <SiteRow
                  key={place.key}
                  ctx={ctx}
                  place={place}
                  members={members}
                  instances={instances}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SiteRow({
  ctx,
  place,
  members,
  instances,
}: {
  ctx: GameContext;
  place: CalcSite;
  members: CalcMember[];
  instances: PokemonInstance[];
}) {
  const { site } = place;
  const empty = members.length === 0;
  const power = sitePower(ctx, place, instances);
  const gap = power - site.minPower;
  const level = empty ? null : requiredLevel(ctx, place, members);
  const missing = missingTypes(ctx, instances, site.requiredTypes);
  const ok = !empty && gap >= 0 && missing.length === 0;
  return (
    <tr
      className={`border-t border-slate-100 dark:border-slate-800 ${
        empty
          ? ''
          : ok
            ? 'bg-emerald-50/60 dark:bg-emerald-950/30'
            : 'bg-red-50/60 dark:bg-red-950/30'
      }`}
    >
      <td className="px-3 py-2">
        <div className="font-medium">
          {place.label}
          {!place.enabled && <span className="text-xs text-slate-400"> (désactivée)</span>}
        </div>
        {place.detail && <div className="text-xs text-slate-500">{place.detail}</div>}
        {site.affinityTypes.length > 0 && (
          <div className="text-xs text-slate-500">
            Affinités : {site.affinityTypes.map(typeLabel).join(', ')}
          </div>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{site.minPower}</td>
      <td className="px-3 py-2 text-right font-semibold tabular-nums">{empty ? '—' : power}</td>
      <td
        className={`px-3 py-2 text-right tabular-nums ${
          empty ? '' : gap >= 0 ? 'text-emerald-600' : 'text-red-600'
        }`}
      >
        {empty ? '—' : `${gap >= 0 ? '+' : ''}${gap}`}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {empty ? '—' : level === null ? `> ${MAX_LEVEL}` : `N.${level}`}
      </td>
      <td className="px-3 py-2 text-xs">
        {site.requiredTypes.length === 0 ? (
          <span className="text-slate-400">—</span>
        ) : (
          site.requiredTypes.map((r) => {
            const lacking = missing.find((m) => m.type === r.type);
            return (
              <span
                key={r.type}
                className={`mr-2 ${lacking && !empty ? 'text-red-600' : 'text-slate-500'}`}
              >
                {r.count} {typeLabel(r.type)}
                {lacking && !empty && ` (manque ${lacking.count})`}
              </span>
            );
          })
        )}
      </td>
    </tr>
  );
}
