/**
 * Onglet PC : la collection du joueur en grille filtrable, la fiche d'un Pokémon et le mode
 * transfert.
 */
import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { GameContext } from '@poke/game-core';
import type { PokemonDto } from '@poke/shared';
import { Modal } from '../../components/ui';
import { TagManagerDialog } from '../../components/tags';
import { keys, updatePokemon, useEvolutionChecker, usePokemon } from '../../lib/queries';
import { candyName } from '../../lib/labels';
import { DuplicateSettingsDialog } from './DuplicateSettings';
import { ProgressiveItems } from '../../components/ProgressiveGrid';
import { PcFilterBar, PcPokemonCard, usePcBrowser } from './PcBrowser';
import type { PcEntry } from './PcBrowser';
import { PC_SHEET_CLASS } from './sheet/parts';
import { PokemonDetail } from './sheet/PokemonDetail';
import { TransferBar, canTransfer, useTransferMode } from './transferMode';

/**
 * Flèches gauche et droite : Pokémon voisin de la fiche ouverte, dans l'ordre de la grille. Sans
 * effet dans un champ de saisie ni sous une autre fenêtre ouverte par-dessus la fiche.
 */
function useSheetArrowKeys(
  selected: PokemonDto | undefined,
  previous: PcEntry | undefined,
  next: PcEntry | undefined,
  setSelectedId: (id: string) => void,
) {
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      // Une autre modale ouverte par-dessus la fiche (objets…) garde les flèches.
      if (document.querySelectorAll('[role="dialog"]').length > 1) return;
      const to = e.key === 'ArrowLeft' ? previous : e.key === 'ArrowRight' ? next : undefined;
      if (!to) return;
      e.preventDefault();
      setSelectedId(to.p.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, previous, next, setSelectedId]);
}

/** Page du PC. */
export function PcPage({ ctx }: { ctx: GameContext }) {
  const pokemon = usePokemon();
  const evolutionsOf = useEvolutionChecker(ctx);
  const browser = usePcBrowser(ctx, pokemon.data ?? []);
  const { filtered, tagFilter } = browser;
  const [tagsOpen, setTagsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const mode = useTransferMode(ctx, pokemon, filtered);
  const {
    transferMode,
    setTransferMode,
    toTransfer,
    duplicateSettings,
    setDuplicateSettings,
    duplicateSettingsOpen,
    setDuplicateSettingsOpen,
    transferResult,
    setTransferResult,
    toggleTransfer,
  } = mode;
  const [released, setReleased] = useState<string | null>(null);

  const selected = pokemon.data?.find((p) => p.id === selectedId);
  // Navigation dans la fiche : suit l'ordre et les filtres de la grille affichée.
  const selectedIndex = filtered.findIndex(({ p }) => p.id === selectedId);
  const previous = selectedIndex > 0 ? filtered[selectedIndex - 1] : undefined;
  const next = selectedIndex >= 0 ? filtered[selectedIndex + 1] : undefined;
  const closeDetail = useCallback(() => setSelectedId(null), []);
  useSheetArrowKeys(selected, previous, next, setSelectedId);

  return (
    <div>
      <PcFilterBar ctx={ctx} browser={browser}>
        {transferMode ? (
          <span className="text-sm font-medium text-red-700 dark:text-red-300">
            Mode transfert : touche les Pokémon à transférer.
          </span>
        ) : (
          <>
            <button
              className="btn-ghost"
              onClick={() => setTagsOpen(true)}
              title="Créer, renommer ou supprimer tes étiquettes"
            >
              🏷 Gérer les étiquettes
            </button>
            <button
              className="btn-danger"
              onClick={() => {
                setTransferMode(true);
                setTransferResult(null);
              }}
              title="Choisir des Pokémon à échanger contre des Bonbons de lignée"
            >
              ⇄ Transférer des Pokémon
            </button>
          </>
        )}
      </PcFilterBar>

      {released && <p className="mb-4 text-sm text-emerald-600">{released}</p>}
      {transferResult && (
        <p className="mb-4 text-sm text-emerald-600">
          {transferResult.transferred} Pokémon transféré(s) :{' '}
          {transferResult.gained
            .map((g) => `${g.quantity} × ${candyName(ctx, g.lineageId)}`)
            .join(', ')}
          .
        </p>
      )}

      {/* Cases de largeur bornée : le nombre de colonnes suit la largeur de l'écran
          (moins de cartes sur un petit écran, plus sur un grand) au lieu d'étirer ou d'écraser les cartes. */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2 sm:grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))]">
        <ProgressiveItems items={filtered} resetKey={browser.viewKey}>
          {(entry) => {
            const { p } = entry;
            return (
              <PcPokemonCard
                key={p.id}
                entry={entry}
                tags={tagFilter.tags}
                onSelect={() => (transferMode ? toggleTransfer(p) : setSelectedId(p.id))}
                topLeft={
                  transferMode ? (
                    p.locked && <span className="absolute top-1.5 left-2 text-amber-500">♥</span>
                  ) : (
                    <FavoriteToggle pokemon={p} />
                  )
                }
                className={`${transferMode && toTransfer.has(p.id) ? 'ring-2 ring-red-500' : ''} ${
                  transferMode && !canTransfer(ctx, p) ? 'opacity-40' : ''
                }`}
              />
            );
          }}
        </ProgressiveItems>
      </div>
      {filtered.length === 0 && !pokemon.isPending && (
        <p className="text-sm text-slate-500">Aucun Pokémon ne correspond.</p>
      )}
      {transferMode && <TransferBar ctx={ctx} mode={mode} />}

      <TagManagerDialog open={tagsOpen} onClose={() => setTagsOpen(false)} />
      <DuplicateSettingsDialog
        open={duplicateSettingsOpen}
        settings={duplicateSettings}
        onClose={() => setDuplicateSettingsOpen(false)}
        onSave={setDuplicateSettings}
      />
      <Modal open={!!selected} onClose={closeDetail} wide="xl" className={PC_SHEET_CLASS}>
        {selected && (
          <PokemonDetail
            key={selected.id}
            ctx={ctx}
            pokemon={selected}
            evolutions={evolutionsOf(selected)}
            nav={
              selectedIndex >= 0
                ? { previous, next, index: selectedIndex, total: filtered.length }
                : undefined
            }
            onSelect={setSelectedId}
            onClose={closeDetail}
            onManageTags={() => setTagsOpen(true)}
            onTransferred={(data) => {
              setReleased(null);
              setTransferResult(data);
              setSelectedId(next?.p.id ?? previous?.p.id ?? null);
            }}
            onReleased={(message) => {
              setTransferResult(null);
              setReleased(message);
              setSelectedId(next?.p.id ?? previous?.p.id ?? null);
            }}
          />
        )}
      </Modal>
    </div>
  );
}

/** Cœur de la grille du PC : ajoute ou retire des favoris sans ouvrir la fiche. */
function FavoriteToggle({ pokemon: p }: { pokemon: PokemonDto }) {
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: () => updatePokemon(p.id, { locked: !p.locked }),
    onSuccess: (updated) => {
      queryClient.setQueryData<PokemonDto[]>(keys.pokemon, (list) =>
        list?.map((q) => (q.id === updated.id ? updated : q)),
      );
    },
  });
  // Affichage optimiste : le cœur change dès le clic.
  const locked = toggle.isPending ? !p.locked : p.locked;
  return (
    <button
      type="button"
      className={`absolute top-0.5 left-0.5 rounded-full px-1.5 py-0.5 text-sm leading-none transition hover:scale-125 ${
        locked ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400 dark:text-slate-600'
      }`}
      disabled={toggle.isPending}
      onClick={(e) => {
        e.stopPropagation();
        toggle.mutate();
      }}
      onKeyDown={(e) => e.stopPropagation()}
      title={locked ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      aria-label={locked ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      aria-pressed={locked}
    >
      {locked ? '♥' : '♡'}
    </button>
  );
}
