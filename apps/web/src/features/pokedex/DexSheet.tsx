import { useState } from 'react';
import type { ReactNode } from 'react';
import { DEX_FORM_SECTIONS, directLineage, getForm, speciesForms } from '@poke/data';
import {
  abilityEffectSummary,
  counterpartFormId,
  evolutionOptions,
  isEventForm,
  isRegionUnlocked,
  isZoneUnlocked,
} from '@poke/game-core';
import type { GameContext, PlayerProgress } from '@poke/game-core';
import type { PokedexEntryDto, PokedexFormEntryDto } from '@poke/shared';
import { Modal, PokemonSprite, ShinyStar, TypeBadge } from '../../components/ui';
import {
  abilityLabel,
  evolutionMethodText,
  itemIcon,
  itemName,
  unlockConditionText,
} from '../../lib/labels';
import { InfoCell, LAUNCH_DIALOG_CLASS, SELECTED_CELL, SheetSection } from '../common/dialogParts';
import { zoneLink } from '../expeditions/zoneLink';
import { levelRange, pokemonSources } from './pokemonSources';
import { wikiAbilityLink, wikiPokemonLink } from '../wiki/wiki';

/** Case du Pokédex : une espèce (formId null) ou l'une de ses formes. */
export interface DexSlot {
  speciesId: number;
  formId: number | null;
}

/** État d'une case : inconnue (silhouette), vue ou capturée. */
export interface SlotState {
  seen: boolean;
  caught: boolean;
  /** Date de première capture (ISO). */
  caughtAt: string | null;
  caughtShiny: boolean;
}

/**
 * État d'une case dans le Pokédex normal ou chromatique (`shiny`), d'après les entrées du
 * Pokédex (espèces) et celles des formes capturées.
 */
export function dexSlotState(
  entries: ReadonlyMap<number, PokedexEntryDto>,
  formEntries: ReadonlyMap<number, PokedexFormEntryDto>,
  { speciesId, formId }: DexSlot,
  shiny: boolean,
): SlotState {
  const entry = entries.get(speciesId);
  // Pokédex shiny : la case ne se dévoile qu'une fois la version shiny rencontrée.
  const seen = (shiny ? entry?.seenShiny : entry?.seen) ?? false;
  if (formId === null) {
    return {
      seen,
      caught: (shiny ? entry?.caughtShiny : entry?.caught) ?? false,
      caughtAt: entry?.firstCaughtAt ?? null,
      caughtShiny: entry?.caughtShiny ?? false,
    };
  }
  // Une forme se dévoile quand elle-même a été rencontrée ou capturée : avoir vu la forme
  // normale de l'espèce ne suffit pas.
  const formEntry = formEntries.get(formId);
  const formSeen = (shiny ? entry?.seenShinyFormIds : entry?.seenFormIds)?.includes(formId);
  return {
    seen: (shiny ? !!formEntry?.caughtShiny : !!formEntry) || !!formSeen,
    caught: shiny ? !!formEntry?.caughtShiny : !!formEntry,
    caughtAt: formEntry?.firstCaughtAt ?? null,
    caughtShiny: formEntry?.caughtShiny ?? false,
  };
}

const DEX_FORM_KINDS = new Set<string>(DEX_FORM_SECTIONS.map((s) => s.kind));

const sameSlot = (a: DexSlot, b: DexSlot) => a.speciesId === b.speciesId && a.formId === b.formId;

const dexNumber = (id: number) => String(id).padStart(3, '0');

const formatPercent = (p: number) =>
  `${(p * 100).toLocaleString('fr-FR', { maximumFractionDigits: p < 0.01 ? 2 : 1 })} %`;

/**
 * Fiche d'une espèce ou d'une forme du Pokédex : illustration (normale ou chromatique), statut,
 * formes, lignée, façons de l'obtenir et talents. `stateOf` donne l'état normal (hors Pokédex
 * chromatique) de n'importe quelle case ; `prev` / `next`, les cases voisines de la grille.
 */
export function DexSheet({
  ctx,
  slot,
  stateOf,
  initialShiny,
  foreign,
  progress,
  prev,
  next,
  onSelect,
  onClose,
}: {
  ctx: GameContext;
  slot: DexSlot;
  stateOf: (slot: DexSlot) => SlotState;
  initialShiny: boolean;
  /** Pokédex d'un autre dresseur : pas de lien de départ en expédition. */
  foreign: boolean;
  progress: PlayerProgress;
  prev?: DexSlot;
  next?: DexSlot;
  onSelect: (slot: DexSlot) => void;
  onClose: () => void;
}) {
  const [shinyView, setShinyView] = useState(initialShiny);
  const species = ctx.species(slot.speciesId, slot.formId);
  if (!species) return null;
  const state = stateOf(slot);
  const shiny = shinyView && state.caughtShiny;
  const isForm = slot.formId !== null;
  const regionNames = ctx.regions
    .filter((r) => r.speciesIds.includes(slot.speciesId))
    .map((r) => r.name);

  const navButton = (target: DexSlot | undefined, side: 'prev' | 'next', className: string) => {
    if (!target) return <span />;
    const name = ctx.species(target.speciesId, target.formId)?.nameFr ?? '?';
    const number = dexNumber(target.speciesId);
    return (
      <button
        type="button"
        className={className}
        onClick={() => onSelect(target)}
        aria-label={`${side === 'prev' ? 'Précédent' : 'Suivant'} : ${name}`}
      >
        <span className="truncate">
          {side === 'prev' ? `‹ ${number} ${name}` : `${name} ${number} ›`}
        </span>
      </button>
    );
  };

  return (
    <Modal open onClose={onClose} wide="xl" className={LAUNCH_DIALOG_CLASS}>
      <header className="flex shrink-0 items-center gap-2 border-b-[3px] border-ink bg-hud px-3 py-2.5 text-white sm:gap-3 sm:px-4">
        <span className="pixel-label shrink-0 rounded border-2 border-hud-line bg-hud-pill px-1.5 text-[9px]">
          N° {dexNumber(slot.speciesId)}
        </span>
        <h2 className="min-w-0 truncate font-pixel text-xs text-[#f8d030] uppercase sm:text-sm">
          {species.nameFr}
        </h2>
        <div className="hidden shrink-0 gap-1.5 sm:flex">
          {species.types.map((t) => (
            <TypeBadge key={t} type={t} />
          ))}
        </div>
        <div className="flex-1" />
        <nav className="hidden max-w-[50%] min-w-0 gap-2 sm:flex" aria-label="Espèces voisines">
          {navButton(
            prev,
            'prev',
            'btn min-w-0 border-hud-line bg-hud-pill px-3 py-1.5 text-white',
          )}
          {navButton(
            next,
            'next',
            'btn min-w-0 border-hud-line bg-hud-pill px-3 py-1.5 text-white',
          )}
        </nav>
        <button
          type="button"
          className="btn size-10 shrink-0 border-[#0b0f1e] bg-brand-500 p-0 text-white"
          onClick={onClose}
          aria-label="Fermer"
        >
          ✕
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
        <div className="grid gap-4 md:grid-cols-[20rem_minmax(0,1fr)] lg:grid-cols-[22rem_minmax(0,1fr)]">
          <div className="space-y-3">
            <div className="flex justify-center gap-1.5 sm:hidden">
              {species.types.map((t) => (
                <TypeBadge key={t} type={t} />
              ))}
            </div>
            <SheetArtwork
              slot={slot}
              species={species}
              state={state}
              shiny={shiny}
              setShinyView={setShinyView}
            />

            <SheetStatus ctx={ctx} state={state} isForm={isForm} />

            <dl className="grid grid-cols-3 gap-2">
              <InfoCell
                label="Taille"
                value={`${(species.heightDm / 10).toLocaleString('fr-FR')} m`}
              />
              <InfoCell
                label="Poids"
                value={`${(species.weightHg / 10).toLocaleString('fr-FR')} kg`}
              />
              <InfoCell label="Pokédex" value={regionNames.join(', ') || '—'} />
            </dl>

            <a className="btn-ghost w-full" href={wikiPokemonLink(slot.speciesId, slot.formId)}>
              Fiche complète dans le Wiki →
            </a>
          </div>

          <div className="min-w-0 space-y-3">
            <Forms slot={slot} stateOf={stateOf} onSelect={onSelect} />
            <Lineage ctx={ctx} slot={slot} stateOf={stateOf} onSelect={onSelect} />
            {!foreign && <Sources ctx={ctx} slot={slot} progress={progress} />}
            <Abilities ctx={ctx} slot={slot} />
          </div>
        </div>
      </div>

      <nav
        className="grid shrink-0 grid-cols-2 gap-2 border-t-[3px] border-ink px-3 py-2.5 sm:hidden"
        aria-label="Espèces voisines"
      >
        {navButton(prev, 'prev', 'btn-ghost min-w-0 px-2')}
        {navButton(next, 'next', 'btn-ghost min-w-0 px-2')}
      </nav>
    </Modal>
  );
}

/** Classes d'une case selon son état : choisie, connue ou inconnue. */
function cellClass(current: boolean, seen: boolean) {
  if (current) return `border-2 ${SELECTED_CELL}`;
  return seen
    ? 'border-2 border-well-line bg-well hover:border-slate-400'
    : 'border-2 border-dashed border-well-line';
}

function StateLabel({ state, current }: { state: SlotState; current?: boolean }) {
  if (current)
    return <span className="pixel-label text-[8px] text-amber-800 dark:text-[#f8d878]">▶ Ici</span>;
  if (state.caught)
    return (
      <span className="pixel-label text-[8px] text-emerald-700 dark:text-emerald-400">
        ● Capturé
      </span>
    );
  return (
    <span className="pixel-label text-[8px] text-slate-500">{state.seen ? '○ Vu' : 'Inconnu'}</span>
  );
}

/** Espèce et formes du Pokédex (régionales, Méga, Gigamax…), pour passer de l'une à l'autre. */
function Forms({
  slot,
  stateOf,
  onSelect,
}: {
  slot: DexSlot;
  stateOf: (slot: DexSlot) => SlotState;
  onSelect: (slot: DexSlot) => void;
}) {
  const variants: DexSlot[] = [
    { speciesId: slot.speciesId, formId: null },
    ...speciesForms(slot.speciesId)
      .filter((f) => DEX_FORM_KINDS.has(f.kind))
      .map((f) => ({ speciesId: f.speciesId, formId: f.id })),
  ];
  if (variants.length < 2) return null;
  const caught = variants.filter((v) => stateOf(v).caught).length;
  return (
    <SheetSection
      title="Formes"
      aside={
        <span className="pixel-label text-[9px] text-slate-500">
          {caught} / {variants.length}
        </span>
      }
    >
      <div className="grid grid-cols-[repeat(auto-fill,minmax(4.75rem,1fr))] gap-2">
        {variants.map((v) => {
          const state = stateOf(v);
          const current = sameSlot(v, slot);
          const label = v.formId === null ? 'Normale' : (getForm(v.formId)?.formNameFr ?? '?');
          return (
            <button
              key={v.formId ?? 0}
              type="button"
              disabled={!state.seen || current}
              aria-current={current || undefined}
              onClick={() => onSelect(v)}
              className={`flex flex-col items-center rounded-md p-1 disabled:cursor-default ${cellClass(current, state.seen)}`}
            >
              <PokemonSprite
                speciesId={v.speciesId}
                formId={v.formId}
                size={56}
                silhouette={!state.seen}
                className={state.seen && !state.caught ? 'opacity-50 grayscale' : ''}
              />
              <span className="line-clamp-2 w-full text-center text-xs leading-tight font-semibold">
                {state.seen ? label : '???'}
              </span>
            </button>
          );
        })}
      </div>
    </SheetSection>
  );
}

/** Lignée depuis la première espèce, avec l'état de chaque maillon dans le Pokédex. */
function Lineage({
  ctx,
  slot,
  stateOf,
  onSelect,
}: {
  ctx: GameContext;
  slot: DexSlot;
  stateOf: (slot: DexSlot) => SlotState;
  onSelect: (slot: DexSlot) => void;
}) {
  if (isEventForm(slot.formId)) return null;
  const form = slot.formId !== null ? getForm(slot.formId) : undefined;
  // Méga-Évolutions et formes de combat : lignée de la forme normale.
  const lineageForm = form?.kind === 'regional' ? slot.formId : null;
  const current = { speciesId: slot.speciesId, formId: lineageForm };
  const rootId = directLineage(slot.speciesId)[0] ?? slot.speciesId;
  const rootForm = counterpartFormId(lineageForm, rootId);
  if (evolutionOptions(ctx, rootId, rootForm).length === 0) {
    return (
      <SheetSection title="Lignée">
        <p className="text-sm text-slate-500">Ce Pokémon n’évolue pas.</p>
      </SheetSection>
    );
  }
  const node = (s: DexSlot, depth: number): ReactNode => {
    const options = depth < 4 ? evolutionOptions(ctx, s.speciesId, s.formId) : [];
    return (
      <div className="flex items-center gap-1.5">
        <LineageMon
          ctx={ctx}
          slot={s}
          state={stateOf(s)}
          current={sameSlot(s, current)}
          onSelect={onSelect}
        />
        {options.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {options.map((o) => (
              <div key={`${o.toSpeciesId}:${o.toFormId}`} className="flex items-center gap-1.5">
                <span className="flex w-16 shrink-0 flex-col items-center text-center text-[11px] leading-tight text-slate-500">
                  <span>
                    {o.methods.length === 0
                      ? 'Impossible pour l’instant'
                      : o.methods.map((m) => evolutionMethodText(ctx, m) || '?').join(' ou ')}
                  </span>
                  <span aria-hidden className="text-base">
                    →
                  </span>
                </span>
                {node({ speciesId: o.toSpeciesId, formId: o.toFormId }, depth + 1)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };
  return (
    <SheetSection title="Lignée">
      <div className="overflow-x-auto pb-1">{node({ speciesId: rootId, formId: rootForm }, 0)}</div>
    </SheetSection>
  );
}

function LineageMon({
  ctx,
  slot,
  state,
  current,
  onSelect,
}: {
  ctx: GameContext;
  slot: DexSlot;
  state: SlotState;
  current: boolean;
  onSelect: (slot: DexSlot) => void;
}) {
  const name = ctx.species(slot.speciesId, slot.formId)?.nameFr ?? '?';
  return (
    <button
      type="button"
      disabled={!state.seen || current}
      aria-current={current || undefined}
      onClick={() => onSelect(slot)}
      className={`flex w-24 shrink-0 flex-col items-center rounded-md p-1 disabled:cursor-default ${cellClass(current, state.seen)}`}
    >
      <PokemonSprite
        speciesId={slot.speciesId}
        formId={slot.formId}
        size={48}
        silhouette={!state.seen}
        className={state.seen && !state.caught ? 'opacity-50 grayscale' : ''}
      />
      <span className="w-full truncate text-center text-xs font-semibold">
        {state.seen ? name : '???'}
      </span>
      <StateLabel state={state} current={current} />
    </button>
  );
}

/**
 * Où trouver le Pokémon : phrases (évolution, Méga, quête, fossile, œuf), puis zones d'expédition
 * avec un départ direct. Sans zone propre, celles du premier de la lignée. Les zones des régions
 * encore verrouillées restent cachées, comme sur la page des expéditions.
 */
function Sources({
  ctx,
  slot,
  progress,
}: {
  ctx: GameContext;
  slot: DexSlot;
  progress: PlayerProgress;
}) {
  const sources = pokemonSources(ctx, slot.speciesId, slot.formId);
  const regionOpen = (regionId: string) => {
    const region = ctx.region(regionId);
    return !!region && isRegionUnlocked(ctx, region, progress);
  };
  const lines: ReactNode[] = [];
  const { parent } = sources;
  if (parent) {
    const parentForm = counterpartFormId(slot.formId, parent.id);
    const methods = evolutionOptions(ctx, parent.id, parentForm).find(
      (o) => o.toSpeciesId === slot.speciesId,
    )?.methods;
    const how = methods?.length
      ? ` (${methods.map((m) => evolutionMethodText(ctx, m) || '?').join(' ou ')})`
      : '';
    lines.push(
      <p key="evo">
        Évolue de <strong>{ctx.species(parent.id, parentForm)?.nameFr}</strong>
        {how}.
      </p>,
    );
  }
  if (sources.megaOf) {
    lines.push(
      <p key="mega" className="flex items-center gap-2">
        {sources.megaOf.itemIds.slice(0, 1).map((id) => (
          <img
            key={id}
            src={itemIcon(ctx, id)}
            alt=""
            width={28}
            height={28}
            className="shrink-0 [image-rendering:pixelated]"
          />
        ))}
        <span>
          Méga-Évolution de {ctx.species(slot.speciesId)?.nameFr} avec{' '}
          <strong>{sources.megaOf.itemIds.map((id) => itemName(ctx, id)).join(' ou ')}</strong>.
        </span>
      </p>,
    );
  }
  for (const { zone, special } of sources.specials) {
    if (!regionOpen(zone.regionId)) continue;
    lines.push(
      <p key={`s-${zone.id}`}>
        Rencontre spéciale à <strong>{zone.name}</strong> avec{' '}
        <strong>{ctx.species(special.requiredSpeciesId, special.requiredFormId)?.nameFr}</strong>{' '}
        dans l’équipe ({special.chance} % par rencontre).
      </p>,
    );
  }
  for (const { quest, roaming } of sources.quests) {
    lines.push(
      <p key={`q-${quest.id}`}>
        Récompense de la quête <strong>{quest.name}</strong>
        {roaming ? ' : un fuyard, qui change de zone chaque heure.' : '.'}
      </p>,
    );
  }
  for (const item of sources.fossils) {
    lines.push(
      <p key={`f-${item.id}`}>
        Ranimé au Musée à partir du fossile <strong>{itemName(ctx, item.id)}</strong>.
      </p>,
    );
  }
  if (sources.fromEgg) lines.push(<p key="egg">Éclosion d’un œuf de la Pension.</p>);

  // Sans zone propre, les zones du premier de la lignée (Salamèche pour Dracaufeu).
  let zoneSlot = slot;
  let zones = sources.zones;
  if (zones.length === 0 && parent) {
    const form = slot.formId !== null ? getForm(slot.formId) : undefined;
    const rootId = directLineage(slot.speciesId)[0] ?? slot.speciesId;
    const rootForm = counterpartFormId(form?.kind === 'regional' ? slot.formId : null, rootId);
    zoneSlot = { speciesId: rootId, formId: rootForm };
    zones = pokemonSources(ctx, rootId, rootForm).zones;
  }
  const visibleZones = zones.filter((z) => regionOpen(z.zone.regionId));
  const fromRoot = !sameSlot(zoneSlot, slot);
  const zoneSpecies = ctx.species(zoneSlot.speciesId, zoneSlot.formId);
  if (sources.zones.length === 0 && !fromRoot && lines.length > 0) {
    lines.unshift(<p key="none">Ne se rencontre pas en expédition.</p>);
  }
  if (zones.length > 0 && visibleZones.length === 0) {
    lines.push(
      <p key="locked" className="text-slate-500">
        {fromRoot ? `${zoneSpecies?.nameFr} se rencontre` : 'Se rencontre'} dans une région pas
        encore débloquée.
      </p>,
    );
  }
  if (lines.length === 0 && visibleZones.length === 0) {
    lines.push(
      <p key="nothing" className="text-slate-500">
        Introuvable pour l’instant.
      </p>,
    );
  }

  return (
    <SheetSection title="Où le trouver">
      <div className="space-y-2 text-sm">
        {lines}
        {visibleZones.map(({ zone, probability, minLevel, maxLevel }) => {
          const unlocked = isZoneUnlocked(ctx, zone, progress);
          return (
            <div
              key={zone.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border-2 border-well-line bg-slate-50 p-2 dark:bg-hud-pill"
            >
              <PokemonSprite
                speciesId={zoneSlot.speciesId}
                formId={zoneSlot.formId}
                size={40}
                className="shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{zone.name}</p>
                <p className="text-slate-500">
                  {ctx.region(zone.regionId)?.name}
                  {fromRoot && ` · ${zoneSpecies?.nameFr}, premier de la lignée`} ·{' '}
                  {levelRange(minLevel, maxLevel)} · {formatPercent(probability)} des rencontres
                </p>
              </div>
              {unlocked ? (
                <a className="btn-primary max-sm:w-full" href={zoneLink(zone.id)}>
                  Envoyer une équipe
                </a>
              ) : (
                <span className="text-slate-500 max-sm:w-full">
                  🔒 {unlockConditionText(ctx, zone.unlock) ?? 'Zone verrouillée'}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </SheetSection>
  );
}

function Abilities({ ctx, slot }: { ctx: GameContext; slot: DexSlot }) {
  const abilities = ctx.species(slot.speciesId, slot.formId)?.abilities ?? [];
  return (
    <SheetSection title="Talents">
      {abilities.length === 0 ? (
        <p className="text-sm text-slate-500">Aucun talent.</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {abilities.map((a) => {
            const effect = abilityEffectSummary(ctx, a.name);
            return (
              <li key={a.name}>
                <a
                  href={wikiAbilityLink(a.name)}
                  className="font-semibold text-brand-600 hover:underline dark:text-brand-500"
                >
                  {abilityLabel(a.name)}
                </a>
                {a.isHidden && (
                  <span className="pixel-label ml-1.5 rounded border-2 border-ink bg-slate-100 px-1 text-[8px] dark:bg-slate-800">
                    Caché
                  </span>
                )}
                <span className="text-slate-500">
                  {' — '}
                  {effect ?? 'pas encore d’effet en jeu.'}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </SheetSection>
  );
}

/** Illustration de l'espèce, normale ou chromatique, et le choix entre les deux. */
function SheetArtwork({
  slot,
  species,
  state,
  shiny,
  setShinyView,
}: {
  slot: DexSlot;
  species: NonNullable<ReturnType<GameContext['species']>>;
  state: SlotState;
  shiny: boolean;
  setShinyView: (shiny: boolean) => void;
}) {
  return (
    <div
      className={`sprite-well relative h-64 sm:h-72 ${shiny ? 'shiny-well' : ''} ${
        state.caught ? '' : 'border-dashed'
      }`}
    >
      <PokemonSprite
        speciesId={slot.speciesId}
        formId={slot.formId}
        kind="artwork"
        size={208}
        shiny={shiny}
        priority
        alt={species.nameFr}
        className={`-mt-8 sm:-mt-6 ${state.caught ? '' : 'opacity-50 grayscale'}`}
      />
      {shiny && (
        <span className="pixel-label absolute top-2 right-2 rounded border-2 border-amber-600 bg-done px-1.5 text-[8px] text-amber-800 dark:text-[#f8d878]">
          ★ Chromatique
        </span>
      )}
      {!state.caught && (
        <span className="pixel-label absolute top-2 left-2 rounded border-2 border-ink bg-white px-1.5 text-[8px] dark:bg-slate-900">
          Vu
        </span>
      )}
      <div className="absolute inset-x-2 bottom-2 grid grid-cols-2 overflow-hidden rounded-md border-2 border-ink bg-white sm:right-auto dark:bg-slate-900">
        <button
          type="button"
          className={`pixel-label min-h-10 px-3 text-[9px] ${
            shiny ? 'text-ink dark:text-slate-200' : 'bg-brand-500 text-white'
          }`}
          aria-pressed={!shiny}
          onClick={() => setShinyView(false)}
        >
          Normal
        </button>
        <button
          type="button"
          className={`pixel-label min-h-10 border-l-2 border-ink px-3 text-[9px] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-400 ${
            shiny ? 'bg-brand-500 text-white' : 'text-ink dark:text-slate-200'
          }`}
          aria-pressed={shiny}
          disabled={!state.caughtShiny}
          title={state.caughtShiny ? undefined : 'Version chromatique pas encore obtenue'}
          onClick={() => setShinyView(true)}
        >
          {state.caughtShiny ? '★ Chromatique' : '★ Pas obtenu'}
        </button>
      </div>
    </div>
  );
}

/** Capturé (et quand) ou seulement vu, puis la version chromatique. */
function SheetStatus({
  ctx,
  state,
  isForm,
}: {
  ctx: GameContext;
  state: SlotState;
  isForm: boolean;
}) {
  return (
    <div className="card space-y-2 p-3">
      <p className="flex items-center gap-2.5 font-semibold">
        <img
          src={itemIcon(ctx, 'poke-ball')}
          alt=""
          width={24}
          height={24}
          className={`shrink-0 [image-rendering:pixelated] ${state.caught ? '' : 'opacity-40 grayscale'}`}
        />
        {state.caughtAt
          ? `${isForm ? 'Forme capturée' : 'Capturé'} le ${new Date(
              state.caughtAt,
            ).toLocaleDateString('fr-FR', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}`
          : isForm
            ? 'Forme vue, pas encore capturée'
            : 'Vu, pas encore capturé'}
      </p>
      <p
        className={`flex items-center gap-2.5 ${
          state.caughtShiny ? 'font-semibold' : 'text-slate-500'
        }`}
      >
        <span className="grid w-6 shrink-0 place-items-center text-lg">
          <ShinyStar className={state.caughtShiny ? '' : 'opacity-40 grayscale'} />
        </span>
        {state.caughtShiny
          ? 'Version chromatique obtenue'
          : 'Version chromatique pas encore obtenue'}
      </p>
    </div>
  );
}
