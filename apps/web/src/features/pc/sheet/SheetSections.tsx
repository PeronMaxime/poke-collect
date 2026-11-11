/**
 * Blocs de la fiche d'un Pokémon du PC : illustration, niveau et Bonbons, identité, nature et
 * talent, statistiques.
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { STAT_NAMES } from '@poke/data';
import {
  MAX_IV,
  MAX_LEVEL,
  applyCandies,
  candiesForLevel,
  candiesToMaxLevel,
  computeStats,
  effectiveAbility,
  expeditionPower,
  lineageId,
  xpForLevel,
} from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type { PokemonDto } from '@poke/shared';
import { PokemonSprite, ProgressBar, ShinySparkles, TypeBadge } from '../../../components/ui';
import { TagPicker } from '../../../components/tags';
import { usePlayerBonuses } from '../../common/XpPreview';
import {
  giveCandies,
  keys,
  patchPokemon,
  refresh,
  updatePokemon,
  useAssistants,
  useCandies,
} from '../../../lib/queries';
import {
  STAT_LABELS,
  abilityLabel,
  candyName,
  errorText,
  lineageSpeciesId,
  natureLabel,
} from '../../../lib/labels';
import { InfoCell, SheetSection } from '../../common/dialogParts';
import { ORIGIN_LABELS, StatusTag, formatNumber, natureShift } from './parts';
import type { SheetSpecies } from './parts';
import { AbilityDetail, abilityDetails, busyAbilityActivities } from './abilities';

/**
 * Favori du Pokémon, avec affichage optimiste : `locked` change dès le clic, avant la réponse.
 */
export function useLockToggle(p: PokemonDto) {
  const queryClient = useQueryClient();
  const toggleLock = useMutation({
    mutationFn: () => updatePokemon(p.id, { locked: !p.locked }),
    onSuccess: (updated) => patchPokemon(queryClient, updated),
  });
  // Affichage optimiste : le cœur change dès le clic.
  const locked = toggleLock.isPending ? !p.locked : p.locked;
  return { locked, toggleLock };
}

/** Favori d'un Pokémon et de quoi le changer. */
export type LockToggle = ReturnType<typeof useLockToggle>;

/** Illustration du Pokémon, avec le cœur des favoris, son état et la mention chromatique. */
export function Portrait({
  pokemon: p,
  species,
  lock,
}: {
  pokemon: PokemonDto;
  species: SheetSpecies;
  lock: LockToggle;
}) {
  const { locked, toggleLock } = lock;
  return (
    <div className={`sprite-well relative h-60 sm:h-68 ${p.isShiny ? 'shiny-well' : ''}`}>
      <div className="relative">
        {p.isShiny && <ShinySparkles loop radius={110} />}
        <PokemonSprite
          speciesId={p.speciesId}
          formId={p.formId}
          shiny={p.isShiny}
          kind="artwork"
          size={200}
          priority
          alt={species.nameFr}
          className={p.knockedOut ? 'opacity-70 grayscale-[60%]' : ''}
        />
      </div>
      <button
        type="button"
        className={`absolute top-2 left-2 grid size-11 place-items-center rounded-md border-2 border-ink text-2xl leading-none shadow-[inset_0_-3px_0_rgb(0_0_0/0.12)] transition hover:scale-105 ${
          locked
            ? 'bg-done text-amber-500'
            : 'bg-white text-slate-400 hover:text-amber-400 dark:bg-slate-900'
        }`}
        disabled={toggleLock.isPending}
        onClick={() => toggleLock.mutate()}
        aria-pressed={locked}
        aria-label={locked ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        title={locked ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      >
        {locked ? '♥' : '♡'}
      </button>
      <StatusTag p={p} />
      {p.isShiny && (
        <span className="pixel-label absolute right-2 bottom-2 rounded border-2 border-amber-600 bg-done px-1.5 text-[8px] text-amber-800 dark:text-[#f8d878]">
          ★ Chromatique
        </span>
      )}
    </div>
  );
}

/** Niveau, XP vers le niveau suivant, et Bonbons de la lignée à donner. */
export function LevelSection({ ctx, pokemon: p }: { ctx: GameContext; pokemon: PokemonDto }) {
  const species = ctx.species(p.speciesId, p.formId)!;
  const levelXp = xpForLevel(species.growthRate, p.level);
  const nextXp = xpForLevel(species.growthRate, Math.min(MAX_LEVEL, p.level + 1));
  return (
    <SheetSection
      title={`Niveau ${p.level}`}
      aside={
        <span className="pixel-label text-[9px] text-slate-500">
          {p.level >= MAX_LEVEL ? 'Max' : `→ N.${p.level + 1}`}
        </span>
      }
    >
      <ProgressBar
        value={p.level >= MAX_LEVEL ? 1 : (p.xp - levelXp) / (nextXp - levelXp)}
        barClassName="bg-[#48a8e8]"
      />
      <p className="mt-1 text-xs text-slate-500">
        {p.level >= MAX_LEVEL
          ? 'Niveau maximal atteint'
          : `XP ${formatNumber(p.xp - levelXp)} / ${formatNumber(nextXp - levelXp)}`}
      </p>
      <CandyFeeder ctx={ctx} pokemon={p} />
    </SheetSection>
  );
}

/**
 * Bonbons de la lignée : stock, coût du niveau en cours, et don d'un nombre choisi (plafonné à ce
 * qui sert jusqu'au niveau maximal) avec l'aperçu de l'XP gagnée. Rien pour une espèce sans lignée.
 */
function CandyFeeder({ ctx, pokemon: p }: { ctx: GameContext; pokemon: PokemonDto }) {
  const queryClient = useQueryClient();
  const candies = useCandies();
  const lineage = lineageId(ctx, p.speciesId);
  const candySpecies = lineage !== undefined ? lineageSpeciesId(lineage) : undefined;
  const ownedCandies = candies.data?.find((c) => c.lineageId === lineage)?.quantity ?? 0;
  const bonuses = usePlayerBonuses(ctx);
  const usefulCandies = Math.min(ownedCandies, candiesToMaxLevel(ctx, p, bonuses));
  const [candyCount, setCandyCount] = useState(1);
  const candiesToGive = Math.min(candyCount, usefulCandies);
  // Aperçu : XP gagnée et niveau atteint avec les Bonbons choisis.
  const fed = applyCandies(ctx, p, candiesToGive, bonuses);
  const feed = useMutation({
    mutationFn: (count: number) => giveCandies(p.id, count),
    onSuccess: (updated) => {
      patchPokemon(queryClient, updated);
      return refresh(queryClient, keys.candies);
    },
  });
  if (lineage === undefined) return null;
  const candyLabel = candyName(ctx, lineage);
  return (
    <div className="mt-3 space-y-2 border-t-2 border-dashed border-slate-200 pt-3 text-sm dark:border-slate-700">
      <div className="flex items-center gap-2">
        {candySpecies && <PokemonSprite speciesId={candySpecies} size={36} className="shrink-0" />}
        <div className="min-w-0">
          <p className="font-semibold">
            {candyLabel} × {formatNumber(ownedCandies)}
          </p>
          {p.level < MAX_LEVEL && (
            <p className="text-xs text-slate-500">
              {candiesForLevel(ctx, p.level)} Bonbons pour passer le niveau {p.level}.
            </p>
          )}
        </div>
      </div>
      {usefulCandies > 0 && (
        <>
          <div className="flex items-center gap-1.5">
            <button
              className="btn-ghost size-9 shrink-0 p-0"
              disabled={candiesToGive <= 1}
              onClick={() => setCandyCount(candiesToGive - 1)}
              aria-label="Un Bonbon de moins"
            >
              −
            </button>
            <input
              type="number"
              className="input w-16 px-1 py-1.5 text-center"
              aria-label="Nombre de Bonbons"
              min={1}
              max={usefulCandies}
              value={candiesToGive}
              onChange={(e) => setCandyCount(Math.max(1, Number(e.target.value) || 1))}
            />
            <button
              className="btn-ghost size-9 shrink-0 p-0"
              disabled={candiesToGive >= usefulCandies}
              onClick={() => setCandyCount(candiesToGive + 1)}
              aria-label="Un Bonbon de plus"
            >
              +
            </button>
            <button
              className="btn-ghost shrink-0 px-2.5"
              disabled={candiesToGive === usefulCandies}
              onClick={() => setCandyCount(usefulCandies)}
              title="Autant de Bonbons que possible (jusqu’au niveau maximal)"
            >
              Max
            </button>
            <button
              className="btn-primary ml-auto shrink-0"
              disabled={feed.isPending}
              onClick={() => feed.mutate(candiesToGive)}
            >
              Donner
            </button>
          </div>
          <p className="text-xs text-slate-500">
            +{formatNumber(fed.xp - p.xp)} XP →{' '}
            <span
              className={
                fed.level > p.level ? 'font-semibold text-emerald-700 dark:text-emerald-400' : ''
              }
            >
              niveau {fed.level}
            </span>
            {fed.level >= MAX_LEVEL && ' (max)'}
          </p>
        </>
      )}
      {feed.error && <p className="text-xs text-red-600">{errorText(feed.error)}</p>}
    </div>
  );
}

/** Types, niveau et PE sous le bandeau : au téléphone, où le bandeau n'a pas la place. */
export function MobileBadges({
  species,
  level,
  power,
}: {
  species: SheetSpecies;
  level: number;
  power: number;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5 sm:hidden">
      {species.types.map((t) => (
        <TypeBadge key={t} type={t} />
      ))}
      <span className="pixel-label rounded border-2 border-ink bg-white px-1.5 text-[9px] dark:bg-slate-900">
        N.{level}
      </span>
      <span className="pixel-label rounded border-2 border-ink bg-hud px-1.5 text-[9px] text-[#f8d030]">
        PE {power}
      </span>
    </div>
  );
}

/** Étiquettes du Pokémon, avec l'accès à leur gestion. */
export function TagsSection({
  pokemon: p,
  onManageTags,
}: {
  pokemon: PokemonDto;
  onManageTags: () => void;
}) {
  return (
    <SheetSection
      title="Étiquettes"
      aside={
        <button
          type="button"
          className="pixel-label text-[8px] text-brand-600 hover:underline dark:text-brand-500"
          onClick={onManageTags}
        >
          Gérer
        </button>
      }
    >
      <TagPicker pokemon={p} bare />
    </SheetSection>
  );
}

/** Bonheur, origine et date d'obtention. */
export function IdentityCells({ ctx, pokemon: p }: { ctx: GameContext; pokemon: PokemonDto }) {
  return (
    <dl className="grid grid-cols-3 gap-2 text-sm">
      <InfoCell label="Bonheur" value={`${p.happiness} / 255`} />
      <InfoCell
        label="Origine"
        value={
          p.originRegion
            ? (ctx.region(p.originRegion)?.name ?? p.originRegion)
            : ORIGIN_LABELS[p.origin]
        }
        sub={p.originRegion ? ORIGIN_LABELS[p.origin] : undefined}
      />
      <InfoCell
        label="Obtenu le"
        value={new Date(p.caughtAt).toLocaleDateString('fr-FR', {
          day: '2-digit',
          month: '2-digit',
          year: '2-digit',
        })}
        sub={new Date(p.caughtAt).toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
        })}
      />
    </dl>
  );
}

/** Nature (stats augmentée et baissée) et talent, avec ses effets. */
export function NatureAbilitySection({
  ctx,
  pokemon: p,
}: {
  ctx: GameContext;
  pokemon: PokemonDto;
}) {
  const assistants = useAssistants();
  const species = ctx.species(p.speciesId, p.formId)!;
  const abilitySummary = abilityDetails(
    ctx,
    effectiveAbility(ctx, p),
    busyAbilityActivities(p, assistants.data),
  );
  const { natureUp, natureDown } = natureShift(p.nature);
  return (
    <SheetSection title="Nature et talent">
      <dl className="grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3 gap-y-3">
        <dt className="pixel-label pt-0.5 text-[8px] text-slate-500 uppercase">Nature</dt>
        <dd>
          <span className="font-semibold">{natureLabel(p.nature)}</span>
          {natureUp && natureDown ? (
            <>
              <span className="ml-2 text-xs text-red-600 dark:text-red-400">
                ▲ {STAT_LABELS[natureUp]}
              </span>
              <span className="ml-2 text-xs text-sky-700 dark:text-sky-400">
                ▼ {STAT_LABELS[natureDown]}
              </span>
            </>
          ) : (
            <span className="text-xs text-slate-500"> — neutre</span>
          )}
          {p.originalNature && (
            <span className="block text-xs text-slate-500">
              Aromate · d’origine {natureLabel(p.originalNature)}
            </span>
          )}
        </dd>
        <dt className="pixel-label pt-0.5 text-[8px] text-slate-500 uppercase">Talent</dt>
        <dd>
          {p.megaStone && species.abilities[0] ? (
            <AbilityDetail
              name={species.abilities[0].name}
              summary={abilitySummary}
              note={`Méga-Évolution · ${
                p.ability ? `d’origine ${abilityLabel(p.ability)}` : 'sans talent d’origine'
              }`}
            />
          ) : (
            <AbilityDetail
              name={p.ability}
              hidden={species.abilities.find((a) => a.name === p.ability)?.isHidden}
              summary={abilitySummary}
              note={p.ability ? undefined : 'Pilule Talent ou Patch Talent pour en débloquer un'}
            />
          )}
        </dd>
      </dl>
    </SheetSection>
  );
}

/** Statistiques : base de l'espèce, IV et valeur de chaque stat, total des IV et PE. */
export function StatsSection({ ctx, pokemon: p }: { ctx: GameContext; pokemon: PokemonDto }) {
  const species = ctx.species(p.speciesId, p.formId)!;
  const stats = computeStats(species, p);
  const ivTotal = STAT_NAMES.reduce((sum, s) => sum + p.ivs[s], 0);
  const { natureUp, natureDown } = natureShift(p.nature);
  return (
    <SheetSection
      title="Statistiques"
      aside={
        <span className="pixel-label text-[9px] text-slate-500">
          IV {ivTotal} / {MAX_IV * 6}
        </span>
      }
    >
      <table className="w-full text-left">
        <thead className="pixel-label text-[8px] text-slate-500 uppercase">
          <tr>
            <th className="pb-1.5 font-normal">Stat</th>
            <th className="pb-1.5 font-normal">Base</th>
            <th className="pb-1.5 font-normal">IV</th>
            <th className="pb-1.5 text-right font-normal">Valeur</th>
          </tr>
        </thead>
        <tbody>
          {STAT_NAMES.map((s) => {
            const up = natureUp === s;
            const down = natureDown === s;
            const maxed = p.ivs[s] === MAX_IV;
            return (
              <tr key={s} className="border-t-2 border-slate-100 dark:border-slate-800">
                <td
                  className={`py-1 font-semibold ${
                    up
                      ? 'text-red-600 dark:text-red-400'
                      : down
                        ? 'text-sky-700 dark:text-sky-400'
                        : ''
                  }`}
                >
                  {up ? '▲ ' : down ? '▼ ' : ''}
                  {STAT_LABELS[s]}
                </td>
                <td className="py-1 text-slate-500">{species.baseStats[s]}</td>
                <td className="py-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-6 ${maxed ? 'font-bold text-amber-600 dark:text-amber-400' : ''}`}
                    >
                      {p.ivs[s]}
                    </span>
                    <ProgressBar
                      className="w-16 sm:w-28"
                      value={p.ivs[s] / MAX_IV}
                      barClassName={maxed ? 'bg-[#f8c838]' : undefined}
                    />
                  </div>
                </td>
                <td className="py-1 text-right font-mono font-semibold">{stats[s]}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-[3px] border-ink dark:border-slate-600">
            <td className="pixel-label pt-2 text-[9px] uppercase">Total</td>
            <td />
            <td className="pt-2 text-xs text-slate-500">
              {ivTotal} / {MAX_IV * 6}
            </td>
            <td className="pt-2 text-right">
              <span className="pixel-label rounded bg-hud px-1.5 py-0.5 text-[9px] text-[#f8d030]">
                PE {expeditionPower(stats)}
              </span>
            </td>
          </tr>
        </tfoot>
      </table>
    </SheetSection>
  );
}
