/**
 * Fiche d'un Pokémon du PC : assemble le bandeau, les blocs et la barre d'actions.
 */
import { useState } from 'react';
import { memberPower } from '@poke/game-core';
import type { EvolutionCheck, GameContext } from '@poke/game-core';
import type { EvolveResponse, PokemonDto, TransferPokemonResponse } from '@poke/shared';
import { ShinyStar, TypeBadge } from '../../../components/ui';
import { useDexIndex, useInventory, usePlayerProgress } from '../../../lib/queries';
import { EvolutionReveal } from '../EvolutionReveal';
import { GENDER_LABELS } from '../PcBrowser';
import type { PcEntry } from '../PcBrowser';
import { DexSheet, dexSlotState } from '../../pokedex/DexSheet';
import type { DexSlot } from '../../pokedex/DexSheet';
import { HUD_PILL, KoDetail } from './parts';
import type { SheetSpecies } from './parts';
import { EvolutionPanel, MegaPanel, useEvolutionActions } from './EvolutionPanels';
import {
  IdentityCells,
  LevelSection,
  MobileBadges,
  NatureAbilitySection,
  Portrait,
  StatsSection,
  TagsSection,
  useLockToggle,
} from './SheetSections';
import { SheetActions, useSheetDisposal } from './SheetActions';
import { ItemUseDialog, usableItems } from './ItemUseDialog';

/** Pokémon voisins de la fiche, dans l'ordre et avec les filtres de la grille du PC. */
export interface SheetNav {
  previous?: PcEntry;
  next?: PcEntry;
  index: number;
  total: number;
}

/** Bouton vers un voisin et compteur « 3 / 12 », pour le bandeau et la barre du bas. */
function sheetNavParts(nav: SheetNav | undefined, onSelect: (id: string) => void) {
  const navButton = (entry: PcEntry | undefined, side: 'prev' | 'next', className: string) => {
    if (!entry) return <span />;
    const name = entry.species?.nameFr ?? '?';
    return (
      <button
        type="button"
        className={className}
        onClick={() => onSelect(entry.p.id)}
        aria-label={`${side === 'prev' ? 'Pokémon précédent' : 'Pokémon suivant'} : ${name}`}
        title={side === 'prev' ? 'Pokémon précédent (←)' : 'Pokémon suivant (→)'}
      >
        <span className="truncate">{side === 'prev' ? `‹ ${name}` : `${name} ›`}</span>
      </button>
    );
  };
  const counter = nav && (
    <span className="pixel-label shrink-0 text-center text-[9px] opacity-75">
      {nav.index + 1} / {nav.total}
    </span>
  );
  return { navButton, counter };
}

/**
 * Fiche d'un Pokémon du PC, dans la même fenêtre que la fiche du Pokédex : bandeau (numéro, nom,
 * types, niveau, PE, voisins), illustration et blocs, barre d'actions en bas.
 */
export function PokemonDetail({
  ctx,
  pokemon: p,
  evolutions,
  nav,
  onSelect,
  onClose,
  onManageTags,
  onTransferred,
  onReleased,
}: {
  ctx: GameContext;
  pokemon: PokemonDto;
  evolutions: EvolutionCheck[];
  nav?: SheetNav;
  onSelect: (id: string) => void;
  onClose: () => void;
  onManageTags: () => void;
  onTransferred: (data: TransferPokemonResponse) => void;
  /** Légendaire relâché (message à afficher dans le PC). */
  onReleased: (message: string) => void;
}) {
  const dex = useDexIndex();
  const progress = usePlayerProgress();
  const [dexSlot, setDexSlot] = useState<DexSlot | null>(null);
  const [reveal, setReveal] = useState<EvolveResponse | null>(null);
  const [revealMega, setRevealMega] = useState(false);
  const { evolve, megaEvolve, megaRevert } = useEvolutionActions(p, (data, mega) => {
    setRevealMega(mega);
    setReveal(data);
  });
  const species = ctx.species(p.speciesId, p.formId)!;
  const power = memberPower(ctx, p);
  const lock = useLockToggle(p);
  const inventory = useInventory();
  const usable = usableItems(ctx, p, inventory.data);
  const [itemsOpen, setItemsOpen] = useState(false);
  const disposal = useSheetDisposal({
    ctx,
    pokemon: p,
    locked: lock.locked,
    onTransferred,
    onReleased,
  });
  // Affichées deux fois (fin de fiche au téléphone, barre du bas ailleurs) : même état.
  const actions = (
    <SheetActions
      ctx={ctx}
      pokemon={p}
      disposal={disposal}
      usable={usable}
      onOpenItems={() => setItemsOpen(true)}
      onOpenDex={() => setDexSlot({ speciesId: p.speciesId, formId: p.formId })}
    />
  );

  return (
    <>
      <SheetHeader
        pokemon={p}
        species={species}
        power={power}
        nav={nav}
        onSelect={onSelect}
        onClose={onClose}
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
        {reveal ? (
          <EvolutionReveal
            ctx={ctx}
            data={reveal}
            mega={revealMega}
            onDone={() => setReveal(null)}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-[20rem_minmax(0,1fr)] lg:grid-cols-[22rem_minmax(0,1fr)]">
            <div className="space-y-3">
              <MobileBadges species={species} level={p.level} power={power} />
              <Portrait pokemon={p} species={species} lock={lock} />

              <KoDetail ctx={ctx} p={p} />

              <LevelSection ctx={ctx} pokemon={p} />

              <IdentityCells ctx={ctx} pokemon={p} />

              <TagsSection pokemon={p} onManageTags={onManageTags} />
            </div>

            <div className="min-w-0 space-y-3 text-sm">
              <EvolutionPanel
                ctx={ctx}
                pokemon={p}
                evolutions={evolutions}
                pending={evolve.isPending}
                error={evolve.error}
                onEvolve={(option) => evolve.mutate(option)}
              />
              <MegaPanel
                ctx={ctx}
                pokemon={p}
                pending={megaEvolve.isPending || megaRevert.isPending}
                error={megaEvolve.error ?? megaRevert.error}
                onMega={(itemId) => megaEvolve.mutate({ itemId })}
                onRevert={() => megaRevert.mutate()}
              />

              <NatureAbilitySection ctx={ctx} pokemon={p} />

              <StatsSection ctx={ctx} pokemon={p} />
            </div>

            {/* Téléphone : actions en fin de fiche, la barre du bas garde ‹ ›. */}
            <div className="sm:hidden">{actions}</div>
          </div>
        )}
      </div>

      {!reveal && (
        <footer className="hidden shrink-0 border-t-[3px] border-ink bg-slate-50 px-3 py-2.5 sm:flex sm:px-4 dark:bg-hud-pill">
          {actions}
        </footer>
      )}
      {/* Sous la largeur d'un grand écran, les voisins passent du bandeau à la barre du bas. */}
      {!reveal && nav && (nav.previous || nav.next) && (
        <SheetNavBar nav={nav} onSelect={onSelect} />
      )}

      <ItemUseDialog
        ctx={ctx}
        pokemon={p}
        items={usable}
        open={itemsOpen}
        onClose={() => setItemsOpen(false)}
      />
      {dexSlot && (
        <DexSheet
          ctx={ctx}
          slot={dexSlot}
          stateOf={(slot) => dexSlotState(dex.bySpecies, dex.byForm, slot, false)}
          initialShiny={p.isShiny}
          foreign={false}
          progress={progress}
          onSelect={setDexSlot}
          onClose={() => setDexSlot(null)}
        />
      )}
    </>
  );
}

/** Bandeau de la fiche : numéro, nom, genre, types, niveau, PE, voisins et fermeture. */
function SheetHeader({
  pokemon: p,
  species,
  power,
  nav,
  onSelect,
  onClose,
}: {
  pokemon: PokemonDto;
  species: SheetSpecies;
  /** PE du Pokémon. */
  power: number;
  nav?: SheetNav;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const { navButton, counter } = sheetNavParts(nav, onSelect);
  return (
    <header className="flex shrink-0 items-center gap-2 border-b-[3px] border-ink bg-hud px-3 py-2.5 text-white sm:gap-3 sm:px-4">
      <span className={HUD_PILL}>N° {String(p.speciesId).padStart(3, '0')}</span>
      <h2 className="min-w-0 truncate font-pixel text-xs text-[#f8d030] uppercase sm:text-sm">
        {species.nameFr}
      </h2>
      {p.gender !== 'genderless' && (
        <span
          className={`shrink-0 font-bold ${p.gender === 'male' ? 'text-sky-300' : 'text-pink-300'}`}
          aria-label={p.gender === 'male' ? 'Mâle' : 'Femelle'}
        >
          {GENDER_LABELS[p.gender]}
        </span>
      )}
      {p.isShiny && <ShinyStar className="shrink-0" />}
      <div className="hidden shrink-0 gap-1.5 sm:flex">
        {species.types.map((t) => (
          <TypeBadge key={t} type={t} />
        ))}
      </div>
      <span className={`${HUD_PILL} hidden sm:inline`}>N.{p.level}</span>
      <span className={`${HUD_PILL} hidden text-[#f8d030] sm:inline`}>PE {power}</span>
      <div className="flex-1" />
      {nav && (
        <nav
          className="hidden max-w-[45%] min-w-0 items-center gap-2 lg:flex"
          aria-label="Pokémon voisins"
        >
          {navButton(
            nav.previous,
            'prev',
            'btn min-w-0 border-hud-line bg-hud-pill px-3 py-1.5 text-white',
          )}
          {counter}
          {navButton(
            nav.next,
            'next',
            'btn min-w-0 border-hud-line bg-hud-pill px-3 py-1.5 text-white',
          )}
        </nav>
      )}
      <button
        type="button"
        className="btn size-10 shrink-0 border-[#0b0f1e] bg-brand-500 p-0 text-white"
        onClick={onClose}
        aria-label="Fermer"
        title="Fermer (Échap)"
      >
        ✕
      </button>
    </header>
  );
}

/** Voisins en barre du bas, sous la largeur d'un grand écran (ils quittent alors le bandeau). */
function SheetNavBar({ nav, onSelect }: { nav: SheetNav; onSelect: (id: string) => void }) {
  const { navButton, counter } = sheetNavParts(nav, onSelect);
  return (
    <nav
      className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-t-[3px] border-ink bg-slate-50 px-3 py-2.5 lg:hidden dark:bg-hud-pill"
      aria-label="Pokémon voisins"
    >
      {navButton(nav.previous, 'prev', 'btn-ghost min-w-0 px-2')}
      {counter}
      {navButton(nav.next, 'next', 'btn-ghost min-w-0 px-2')}
    </nav>
  );
}
