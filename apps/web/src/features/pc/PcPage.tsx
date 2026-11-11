import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { STAT_NAMES } from '@poke/data';
import type { StatName } from '@poke/data';
import {
  ASSISTANT_POST_INFO,
  MAX_IV,
  MAX_LEVEL,
  abilityEffectText,
  applyCandies,
  candiesForLevel,
  candiesToMaxLevel,
  computeStats,
  effectActivities,
  effectiveAbility,
  expeditionPower,
  getNature,
  isHealing,
  isTransferableSpecies,
  itemUseOptions,
  lineageId,
  megaOptions,
  memberPower,
  releasableQuest,
  transferCandies,
  xpForLevel,
} from '@poke/game-core';
import type {
  AbilityActivity,
  EvolutionCheck,
  EvolutionOption,
  GameContext,
} from '@poke/game-core';
import type {
  AssistantDto,
  EvolveResponse,
  InventoryEntryDto,
  MegaEvolveInput,
  PokemonActivity,
  PokemonDto,
  TransferPokemonResponse,
  UseItemInput,
} from '@poke/shared';
import { TRANSFER_BATCH_MAX } from '@poke/shared';
import {
  Modal,
  PokemonSprite,
  ProgressBar,
  ShinySparkles,
  ShinyStar,
  TypeBadge,
  useNow,
} from '../../components/ui';
import { TagManagerDialog, TagPicker } from '../../components/tags';
import { usePlayerBonuses } from '../common/XpPreview';
import {
  PROGRESS_KEYS,
  applyItem,
  applyTransfer,
  centerState,
  evolvePokemon,
  giveCandies,
  isUsable,
  keys,
  megaEvolvePokemon,
  patchPokemon,
  refresh,
  releaseLegendary,
  revertMegaEvolution,
  setItemQuantity,
  transferPokemon,
  updatePokemon,
  useAssistants,
  useCandies,
  useDexIndex,
  useEvolutionChecker,
  useHeal,
  useInventory,
  useItemQuantities,
  usePlayerProgress,
  usePokemon,
  useQuests,
  useRevive,
  useReviveStacks,
} from '../../lib/queries';
import {
  STAT_LABELS,
  abilityLabel,
  candyName,
  effectText,
  errorText,
  evolutionMethodText,
  formatCountdown,
  itemIcon,
  itemName,
  lineageSpeciesId,
  natureLabel,
  requirementText,
  speciesName,
} from '../../lib/labels';
import { DuplicateSettingsDialog, duplicates, loadDuplicateSettings } from './DuplicateSettings';
import { EvolutionReveal } from './EvolutionReveal';
import { ProgressiveItems } from '../../components/ProgressiveGrid';
import { GENDER_LABELS, PcFilterBar, PcPokemonCard, usePcBrowser } from './PcBrowser';
import type { PcEntry } from './PcBrowser';
import { DexSheet, dexSlotState } from '../pokedex/DexSheet';
import type { DexSlot } from '../pokedex/DexSheet';
import {
  CollapsibleSheetSection,
  InfoCell,
  LAUNCH_DIALOG_CLASS,
  SELECTED_CELL,
  SheetSection,
  StatusPill,
} from '../common/dialogParts';
import { wikiAbilityLink } from '../wiki/wiki';

const ORIGIN_LABELS: Record<PokemonDto['origin'], string> = {
  starter: 'Starter',
  capture: 'Capturé',
  egg: 'Éclos',
  quest: 'Récompense de quête',
  fossil: 'Fossile restauré',
  admin: 'Lot de test',
};

const canTransfer = (ctx: GameContext, p: PokemonDto) =>
  !p.locked && !p.busy && isTransferableSpecies(ctx, p.speciesId);

export function PcPage({ ctx }: { ctx: GameContext }) {
  const pokemon = usePokemon();
  const evolutionsOf = useEvolutionChecker(ctx);
  const browser = usePcBrowser(ctx, pokemon.data ?? []);
  const { filtered, tagFilter } = browser;
  const [tagsOpen, setTagsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transferMode, setTransferMode] = useState(false);
  const [toTransfer, setToTransfer] = useState<Set<string>>(new Set());
  const [duplicateSettings, setDuplicateSettings] = useState(loadDuplicateSettings);
  const [duplicateSettingsOpen, setDuplicateSettingsOpen] = useState(false);
  // Transfert demandé alors qu'il retirerait le dernier exemplaire d'une espèce : à confirmer.
  const [confirmingLast, setConfirmingLast] = useState(false);
  const [transferResult, setTransferResult] = useState<TransferPokemonResponse | null>(null);
  const [released, setReleased] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const transfer = useMutation({
    mutationFn: async (ids: string[]) => {
      // Par lots : l'API plafonne le nombre de Pokémon par requête.
      let transferred = 0;
      const gained = new Map<number, number>();
      for (let i = 0; i < ids.length; i += TRANSFER_BATCH_MAX) {
        const res = await transferPokemon(ids.slice(i, i + TRANSFER_BATCH_MAX));
        transferred += res.transferred;
        for (const g of res.gained)
          gained.set(g.lineageId, (gained.get(g.lineageId) ?? 0) + g.quantity);
      }
      return {
        transferred,
        gained: [...gained].map(([lineageId, quantity]) => ({ lineageId, quantity })),
      } satisfies TransferPokemonResponse;
    },
    onSuccess: (data, ids) => {
      setTransferResult(data);
      setToTransfer(new Set());
      setConfirmingLast(false);
      setTransferMode(false);
      // Collection et Bonbons mis à jour sur place : pas de relecture de tout le PC.
      const gone = new Set(ids);
      const list = queryClient.getQueryData<PokemonDto[]>(keys.pokemon) ?? [];
      return applyTransfer(
        queryClient,
        list.filter((p) => gone.has(p.id)),
        data.gained,
      );
    },
    // Les lots déjà passés sont transférés : on resynchronise le PC.
    onError: () => {
      setToTransfer(new Set());
      setConfirmingLast(false);
      return refresh(queryClient, keys.pokemon, keys.candies, keys.inventory, keys.teams);
    },
  });

  const selected = pokemon.data?.find((p) => p.id === selectedId);
  // Navigation dans la fiche : suit l'ordre et les filtres de la grille affichée.
  const selectedIndex = filtered.findIndex(({ p }) => p.id === selectedId);
  const previous = selectedIndex > 0 ? filtered[selectedIndex - 1] : undefined;
  const next = selectedIndex >= 0 ? filtered[selectedIndex + 1] : undefined;
  const closeDetail = useCallback(() => setSelectedId(null), []);

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
  }, [selected, previous, next]);
  const transferList = (pokemon.data ?? []).filter((p) => toTransfer.has(p.id));
  const candiesGained = transferList.reduce((sum, p) => sum + transferCandies(ctx, p), 0);
  // Derniers exemplaires : espèces (et formes) dont tous les Pokémon possédés seraient transférés.
  const speciesKey = (p: PokemonDto) => `${p.speciesId}:${p.formId ?? ''}`;
  const keptKeys = new Set(
    (pokemon.data ?? []).filter((p) => !toTransfer.has(p.id)).map(speciesKey),
  );
  const lastCopies = transferList.filter(
    (p, i) =>
      !keptKeys.has(speciesKey(p)) &&
      transferList.findIndex((q) => speciesKey(q) === speciesKey(p)) === i,
  );

  function requestTransfer() {
    if (lastCopies.length > 0) setConfirmingLast(true);
    else transfer.mutate([...toTransfer]);
  }

  function selectDuplicates() {
    // Seulement parmi les Pokémon affichés (onglet, recherche et filtres en cours).
    const shown = filtered.map(({ p }) => p);
    setConfirmingLast(false);
    setToTransfer(new Set(duplicates(ctx, shown, duplicateSettings)));
  }

  function exitTransferMode() {
    setTransferMode(false);
    setToTransfer(new Set());
    setConfirmingLast(false);
  }

  function toggleTransfer(p: PokemonDto) {
    if (!canTransfer(ctx, p)) return;
    setConfirmingLast(false);
    setToTransfer((cur) => {
      const next = new Set(cur);
      if (next.has(p.id)) next.delete(p.id);
      else next.add(p.id);
      return next;
    });
  }

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
      {transferMode && (
        // Collée au bas de l'écran pendant qu'on fait défiler la grille : sélection toujours en vue.
        // Fond rosé et liseré rouge (index.css, `.action-bar`) : se détache des cartes en dessous.
        <div className="card action-bar sticky bottom-2 z-10 mt-4 flex flex-col gap-2 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex-1">
              <strong>{toTransfer.size}</strong> sélectionné(s) · +{candiesGained} Bonbon
              {candiesGained > 1 ? 's' : ''} de lignée
              <span className="block text-xs text-slate-500">
                Favoris, légendaires, fabuleux et Pokémon occupés exclus.
              </span>
            </span>
            <div className="flex items-center">
              <button
                className="btn-ghost rounded-r-none"
                onClick={selectDuplicates}
                title="Parmi les Pokémon affichés (onglet, recherche et filtres en cours)"
              >
                Sélectionner les doublons
              </button>
              <button
                className="btn-ghost rounded-l-none border-l-0 px-2.5"
                onClick={() => setDuplicateSettingsOpen(true)}
                title="Régler le filtre des doublons"
                aria-label="Régler le filtre des doublons"
              >
                ⚙
              </button>
            </div>
            {toTransfer.size > 0 && (
              <button
                className="btn-ghost"
                onClick={() => {
                  setToTransfer(new Set());
                  setConfirmingLast(false);
                }}
              >
                Tout désélectionner
              </button>
            )}
            <span className="flex gap-2 sm:ml-2">
              <button className="btn-ghost" onClick={exitTransferMode}>
                Annuler
              </button>
              <button
                className="btn-danger"
                disabled={toTransfer.size === 0 || transfer.isPending}
                onClick={requestTransfer}
              >
                Transférer ({toTransfer.size})
              </button>
            </span>
          </div>
          {confirmingLast && lastCopies.length > 0 && (
            <div className="flex w-full flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              <span className="flex-1">
                ⚠ Tu transfères ton dernier exemplaire de :{' '}
                {lastCopies
                  .slice(0, 5)
                  .map((p) => speciesName(ctx, p.speciesId, p.formId))
                  .join(', ')}
                {lastCopies.length > 5 && ` et ${lastCopies.length - 5} autre(s)`}. Ils resteront au
                Pokédex mais tu n'en auras plus aucun.
              </span>
              <button
                className="btn-danger py-1"
                disabled={transfer.isPending}
                onClick={() => transfer.mutate([...toTransfer])}
              >
                Transférer quand même
              </button>
              <button className="btn-ghost py-1" onClick={() => setConfirmingLast(false)}>
                Annuler
              </button>
            </div>
          )}
          {transfer.error && <p className="w-full text-red-600">{errorText(transfer.error)}</p>}
        </div>
      )}

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

/** Taille fixe : l'en-tête et ses ‹ › restent au même endroit d'une fiche à l'autre. */
const PC_SHEET_CLASS = 'flex h-[min(50rem,calc(100dvh-2rem))] flex-col overflow-hidden p-0';

/** Pastille du bandeau de la fiche (numéro, niveau, PE). */
const HUD_PILL =
  'pixel-label shrink-0 rounded border-2 border-hud-line bg-hud-pill px-1.5 text-[9px]';

const SHEET_ACTIVITY_LABELS: Record<PokemonActivity, string> = {
  expedition: 'En expédition',
  battle: 'En combat',
  daycare: 'À la pension',
  dungeon: 'En donjon',
  assistant: 'Assistant',
};

const STATUS_TONES = {
  ok: 'border-emerald-700 bg-emerald-50 text-emerald-800 dark:border-emerald-400 dark:bg-emerald-950 dark:text-emerald-300',
  busy: 'border-sky-700 bg-sky-50 text-sky-800 dark:border-sky-400 dark:bg-sky-950 dark:text-sky-300',
  heal: 'border-pink-600 bg-pink-50 text-pink-700 dark:border-pink-400 dark:bg-pink-950 dark:text-pink-300',
  bad: 'border-red-700 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950 dark:text-red-300',
} as const;

/** Pokémon voisins de la fiche, dans l'ordre et avec les filtres de la grille du PC. */
interface SheetNav {
  previous?: PcEntry;
  next?: PcEntry;
  index: number;
  total: number;
}

/** État du Pokémon, dans le coin de l'illustration : disponible, occupé, K.O. ou en soins. */
function StatusTag({ p }: { p: PokemonDto }) {
  const now = useNow();
  const [text, tone]: [string, keyof typeof STATUS_TONES] = p.knockedOut
    ? ['K.O.', 'bad']
    : isHealing(p.healUntil, now)
      ? [`Soins ${formatCountdown(Date.parse(p.healUntil!) - now)}`, 'heal']
      : p.activity
        ? [SHEET_ACTIVITY_LABELS[p.activity], 'busy']
        : ['Disponible', 'ok'];
  return (
    <span
      className={`pixel-label absolute top-2 right-2 rounded border-2 px-1.5 text-[8px] ${STATUS_TONES[tone]}`}
    >
      ● {text}
    </span>
  );
}

/** K.O. (avec l'envoi au Centre Pokémon s'il reste de la place) ou en soins. */
function KoDetail({ ctx, p }: { ctx: GameContext; p: PokemonDto }) {
  const now = useNow();
  const pokemon = usePokemon();
  const heal = useHeal();
  const revive = useRevive();
  const [reviveStack] = useReviveStacks(ctx);
  const progress = usePlayerProgress();
  if (p.knockedOut) {
    const { free } = centerState(ctx, pokemon.data ?? [], now, progress);
    const pending = heal.isPending || revive.isPending;
    const error = heal.error ?? revive.error;
    return (
      <div className="rounded-lg border-[3px] border-red-600 bg-red-50 p-3 text-sm dark:border-red-400 dark:bg-red-950/40">
        <p className="font-semibold text-red-700 dark:text-red-300">
          K.O. : à soigner au Centre Pokémon.
        </p>
        {(free > 0 || reviveStack) && (
          <div className="mt-2 flex flex-wrap gap-2">
            {free > 0 && (
              <button
                className="btn-primary flex-1"
                disabled={pending}
                onClick={() => heal.mutate([p.id])}
              >
                Envoyer au Centre
              </button>
            )}
            {reviveStack && (
              <button
                className="btn-ghost flex-1"
                disabled={pending}
                onClick={() => revive.mutate({ itemId: reviveStack.itemId, pokemonIds: [p.id] })}
              >
                Rappel ({reviveStack.quantity})
              </button>
            )}
          </div>
        )}
        {free === 0 && (
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            Le Centre Pokémon est plein pour l’instant.
          </p>
        )}
        {error && <p className="mt-1 text-xs text-red-600">{errorText(error)}</p>}
      </div>
    );
  }
  if (!isHealing(p.healUntil, now)) return null;
  return (
    <p className="rounded-lg border-[3px] border-pink-500 bg-pink-50 p-3 text-sm font-semibold text-pink-700 dark:border-pink-400 dark:bg-pink-950/40 dark:text-pink-300">
      En soins au Centre Pokémon encore {formatCountdown(Date.parse(p.healUntil!) - now)}
    </p>
  );
}

/**
 * Activité où le talent d'un Pokémon occupé agit en ce moment (expédition, combat,
 * donjon, pension, poste d'assistant) ; undefined = Pokémon libre.
 */
function busyAbilityActivities(
  p: PokemonDto,
  assistants: readonly AssistantDto[] | undefined,
): AbilityActivity[] | undefined {
  switch (p.activity) {
    case 'expedition':
      return ['expedition'];
    case 'battle':
    case 'dungeon':
      return [p.activity];
    case 'daycare':
      return ['breeding'];
    case 'assistant': {
      const post = assistants?.find((a) => a.pokemonId === p.id)?.post;
      return post ? [ASSISTANT_POST_INFO[post].activity] : undefined;
    }
    default:
      return undefined;
  }
}

const formatNumber = (n: number) => n.toLocaleString('fr-FR');

/**
 * Fiche d'un Pokémon du PC, dans la même fenêtre que la fiche du Pokédex : bandeau (numéro, nom,
 * types, niveau, PE, voisins), illustration et blocs, barre d'actions en bas.
 */
function PokemonDetail({
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
  const queryClient = useQueryClient();
  const assistants = useAssistants();
  const dex = useDexIndex();
  const progress = usePlayerProgress();
  const [dexSlot, setDexSlot] = useState<DexSlot | null>(null);
  const [reveal, setReveal] = useState<EvolveResponse | null>(null);
  const [revealMega, setRevealMega] = useState(false);
  // Évolution : Pokémon mis à jour sur place ; Pokédex, quêtes… et sac seulement si la réponse le dit.
  const refreshAfterEvolution = (data: EvolveResponse) => {
    patchPokemon(queryClient, data.pokemon);
    const newEntries = data.newSpeciesIds.length > 0 || data.newFormIds.length > 0;
    return refresh(
      queryClient,
      ...(data.consumedItemId ? [keys.inventory] : []),
      ...(newEntries ? PROGRESS_KEYS : []),
    );
  };
  const megaEvolve = useMutation({
    mutationFn: (input: MegaEvolveInput) => megaEvolvePokemon(p.id, input),
    onSuccess: (data) => {
      setRevealMega(true);
      setReveal(data);
      return refreshAfterEvolution(data);
    },
  });
  const megaRevert = useMutation({
    mutationFn: () => revertMegaEvolution(p.id),
    // La Méga-Gemme revient dans le sac.
    onSuccess: (updated) => {
      patchPokemon(queryClient, updated);
      return refresh(queryClient, keys.inventory);
    },
  });
  const evolve = useMutation({
    mutationFn: ({ toSpeciesId, toFormId }: Pick<EvolutionOption, 'toSpeciesId' | 'toFormId'>) =>
      evolvePokemon(p.id, { toSpeciesId, toFormId }),
    onSuccess: (data) => {
      setRevealMega(false);
      setReveal(data);
      return refreshAfterEvolution(data);
    },
  });
  const species = ctx.species(p.speciesId, p.formId)!;
  const stats = computeStats(species, p);
  const power = memberPower(ctx, p);
  const abilitySummary = abilityDetails(
    ctx,
    effectiveAbility(ctx, p),
    busyAbilityActivities(p, assistants.data),
  );
  const nature = getNature(p.nature);
  const natureUp =
    nature?.increasedStat && nature.increasedStat !== nature.decreasedStat
      ? nature.increasedStat
      : undefined;
  const natureDown = natureUp ? nature?.decreasedStat : undefined;
  const levelXp = xpForLevel(species.growthRate, p.level);
  const nextXp = xpForLevel(species.growthRate, Math.min(MAX_LEVEL, p.level + 1));
  const ivTotal = STAT_NAMES.reduce((sum, s) => sum + p.ivs[s], 0);

  const toggleLock = useMutation({
    mutationFn: () => updatePokemon(p.id, { locked: !p.locked }),
    onSuccess: (updated) => patchPokemon(queryClient, updated),
  });
  // Affichage optimiste : le cœur change dès le clic.
  const locked = toggleLock.isPending ? !p.locked : p.locked;

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

  const inventory = useInventory();
  const usable = usableItems(ctx, p, inventory.data);
  const [itemsOpen, setItemsOpen] = useState(false);

  const [confirmTransfer, setConfirmTransfer] = useState(false);
  const transfer = useMutation({
    mutationFn: () => transferPokemon([p.id]),
    onSuccess: async (data) => {
      onTransferred(data);
      await applyTransfer(queryClient, [p], data.gained);
    },
  });

  // Légendaire : pas de transfert, mais le dernier capturé d'une quête peut être relâché.
  const transferable = isTransferableSpecies(ctx, p.speciesId);
  const quests = useQuests();
  const releaseFrom = transferable
    ? undefined
    : releasableQuest(
        ctx,
        (quests.data?.quests ?? []).filter((q) => q.status === 'claimed'),
        p,
      );
  const releaseQuest = releaseFrom ? ctx.quest(releaseFrom.questId) : undefined;
  const releaseRoams = releaseQuest?.rewards.pokemon[releaseFrom!.pokemonIndex]?.roaming != null;
  // Capturé avant la réécriture des quêtes : le relâcher fait recommencer toute la quête.
  const releaseRestarts =
    releaseFrom !== undefined &&
    quests.data?.quests.find((q) => q.questId === releaseFrom.questId)?.restartOnRelease === true;
  const release = useMutation({
    mutationFn: () => releaseLegendary(p.id),
    onSuccess: async (data) => {
      onReleased(
        data.restarted
          ? `${species.nameFr} a été relâché : la quête « ${releaseQuest?.name ?? ''} » recommence depuis le début.`
          : releaseRoams
            ? `${species.nameFr} a été relâché : il erre de nouveau, à recroiser en expédition.`
            : `${species.nameFr} a été relâché : affronte-le de nouveau depuis l’onglet Quêtes.`,
      );
      await applyTransfer(queryClient, [p], []);
      await refresh(queryClient, keys.quests, keys.legendaryBattles, keys.expeditions);
    },
  });

  // Raison affichée à côté du bouton Transférer / Relâcher quand il est grisé.
  const verb = releaseQuest ? 'relâcher' : 'transférer';
  const blocked =
    !transferable && !releaseQuest
      ? 'Les légendaires et les fabuleux ne se transfèrent pas'
      : locked
        ? `Favori : retire-le des favoris pour le ${verb}`
        : p.busy
          ? 'Le Pokémon doit être disponible (ni en activité)'
          : undefined;
  const gain = transferCandies(ctx, p);
  const candyLabel = lineage !== undefined ? candyName(ctx, lineage) : 'Bonbon';

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

  const actions = confirmTransfer ? (
    <div className="flex w-full flex-wrap items-center gap-2">
      <p className="min-w-0 flex-1 basis-64 text-sm">
        {releaseQuest ? (
          <>
            <strong>Relâcher {species.nameFr} ?</strong> Aucun Bonbon :{' '}
            {releaseRestarts
              ? `capturé avant la nouvelle version de la quête « ${releaseQuest.name} », il ne reviendra qu’en la refaisant entièrement, depuis la première étape.`
              : releaseRoams
                ? `il recommence à errer (quête « ${releaseQuest.name} »), à recroiser et capturer en expédition.`
                : `il retourne à la quête « ${releaseQuest.name} », où tu pourras de nouveau l’affronter et tenter de le capturer.`}{' '}
            Ce Pokémon-ci (niveau, IV, chromatique) est perdu.
          </>
        ) : (
          <>
            <strong>Transférer {species.nameFr}</strong> contre {gain} × {candyLabel} ? C’est
            définitif.
          </>
        )}
      </p>
      <div className="flex gap-2 max-sm:w-full">
        <button className="btn-ghost max-sm:flex-1" onClick={() => setConfirmTransfer(false)}>
          Annuler
        </button>
        {releaseQuest ? (
          <button
            className="btn-danger max-sm:flex-1"
            disabled={release.isPending}
            onClick={() => release.mutate()}
          >
            Relâcher
          </button>
        ) : (
          <button
            className="btn-danger max-sm:flex-1"
            disabled={transfer.isPending}
            onClick={() => transfer.mutate()}
          >
            Transférer
          </button>
        )}
      </div>
    </div>
  ) : (
    <div className="flex w-full flex-wrap items-center gap-2">
      <button
        className="btn-ghost max-sm:flex-1"
        disabled={usable.length === 0}
        title={usable.length === 0 ? 'Aucun objet utilisable sur ce Pokémon' : undefined}
        onClick={() => setItemsOpen(true)}
      >
        {usable[0] && (
          <img
            src={itemIcon(ctx, usable[0].itemId)}
            alt=""
            width={20}
            height={20}
            className="-my-1 [image-rendering:pixelated]"
          />
        )}
        Objet{usable.length > 0 && ` (${usable.length})`}
      </button>
      <button
        className="btn-ghost max-sm:flex-1"
        onClick={() => setDexSlot({ speciesId: p.speciesId, formId: p.formId })}
        title="Fiche de l’espèce dans le Pokédex"
      >
        <img
          src={itemIcon(ctx, 'poke-ball')}
          alt=""
          width={20}
          height={20}
          className="-my-1 [image-rendering:pixelated]"
        />
        Pokédex
      </button>
      <span className="flex-1 max-sm:hidden" />
      {blocked && (
        <span className="text-xs text-slate-500 max-sm:order-last max-sm:w-full max-sm:text-center">
          {blocked}
        </span>
      )}
      <button
        className="btn-danger max-sm:w-full"
        disabled={!!blocked}
        title={
          releaseQuest
            ? releaseRestarts
              ? 'Aucun Bonbon : sa quête recommence depuis le début'
              : 'Aucun Bonbon : sa quête le propose de nouveau'
            : undefined
        }
        onClick={() => setConfirmTransfer(true)}
      >
        {releaseQuest
          ? 'Relâcher'
          : transferable
            ? `Transférer · ${gain} Bonbon${gain > 1 ? 's' : ''}`
            : 'Transférer'}
      </button>
      {(transfer.error ?? release.error) && (
        <p className="w-full text-xs text-red-600">{errorText(transfer.error ?? release.error)}</p>
      )}
    </div>
  );

  return (
    <>
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
              <div className="flex flex-wrap items-center justify-center gap-1.5 sm:hidden">
                {species.types.map((t) => (
                  <TypeBadge key={t} type={t} />
                ))}
                <span className="pixel-label rounded border-2 border-ink bg-white px-1.5 text-[9px] dark:bg-slate-900">
                  N.{p.level}
                </span>
                <span className="pixel-label rounded border-2 border-ink bg-hud px-1.5 text-[9px] text-[#f8d030]">
                  PE {power}
                </span>
              </div>
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

              <KoDetail ctx={ctx} p={p} />

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
                {lineage !== undefined && (
                  <div className="mt-3 space-y-2 border-t-2 border-dashed border-slate-200 pt-3 text-sm dark:border-slate-700">
                    <div className="flex items-center gap-2">
                      {candySpecies && (
                        <PokemonSprite speciesId={candySpecies} size={36} className="shrink-0" />
                      )}
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
                            onChange={(e) =>
                              setCandyCount(Math.max(1, Number(e.target.value) || 1))
                            }
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
                              fed.level > p.level
                                ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                                : ''
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
                )}
              </SheetSection>

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
                          p.ability
                            ? `d’origine ${abilityLabel(p.ability)}`
                            : 'sans talent d’origine'
                        }`}
                      />
                    ) : (
                      <AbilityDetail
                        name={p.ability}
                        hidden={species.abilities.find((a) => a.name === p.ability)?.isHidden}
                        summary={abilitySummary}
                        note={
                          p.ability
                            ? undefined
                            : 'Pilule Talent ou Patch Talent pour en débloquer un'
                        }
                      />
                    )}
                  </dd>
                </dl>
              </SheetSection>

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
        <nav
          className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-t-[3px] border-ink bg-slate-50 px-3 py-2.5 lg:hidden dark:bg-hud-pill"
          aria-label="Pokémon voisins"
        >
          {navButton(nav.previous, 'prev', 'btn-ghost min-w-0 px-2')}
          {counter}
          {navButton(nav.next, 'next', 'btn-ghost min-w-0 px-2')}
        </nav>
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

/** Description du talent et chacun de ses effets ; `active` : agit dans l'activité en cours. */
interface AbilityDetails {
  description: string;
  effects: { text: string; active: boolean }[];
}

/**
 * Tous les effets du talent, même ceux d'autres activités : un Pokémon occupé (en expédition…)
 * voit les autres grisés au lieu de les perdre.
 */
function abilityDetails(
  ctx: GameContext,
  ability: string,
  activities: readonly AbilityActivity[] | undefined,
): AbilityDetails | null {
  const entry = ctx.ability(ability);
  if (!entry) return null;
  const effects = entry.effects.map((e) => ({
    text: abilityEffectText(e),
    active: !activities || activities.some((a) => effectActivities(e).includes(a)),
  }));
  const description = entry.description.trim();
  return description || effects.length > 0 ? { description, effects } : null;
}

/** Talent : nom (lien vers le Wiki), puis ses effets en clair, grisés hors de l'activité en cours. */
function AbilityDetail({
  name,
  hidden,
  summary,
  note,
}: {
  name: string;
  hidden?: boolean;
  summary: AbilityDetails | null;
  note?: string;
}) {
  return (
    <>
      {name ? (
        <a
          href={wikiAbilityLink(name)}
          className="font-semibold text-brand-600 hover:underline dark:text-brand-500"
        >
          {abilityLabel(name)}
        </a>
      ) : (
        <span className="font-semibold">{abilityLabel(name)}</span>
      )}
      {hidden && (
        <span className="pixel-label ml-1.5 rounded border-2 border-ink bg-slate-100 px-1 text-[8px] dark:bg-slate-800">
          Caché
        </span>
      )}
      {note && <span className="block text-xs text-slate-500">{note}</span>}
      {summary && (
        <ul className="mt-1 space-y-0.5 text-xs">
          {summary.description && summary.effects.length === 0 && (
            <li className="text-slate-500">{summary.description}</li>
          )}
          {summary.effects.map((e, i) => (
            <li
              key={i}
              className={e.active ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-400'}
            >
              {e.active ? '● ' : '○ '}
              {e.text}
            </li>
          ))}
          {summary.effects.some((e) => !e.active) && (
            <li className="text-slate-400 italic">Grisés : sans effet sur son activité en cours</li>
          )}
        </ul>
      )}
    </>
  );
}

/** Évolutions du Pokémon : conditions de chaque méthode, bouton quand l'une est remplie. */
function EvolutionPanel({
  ctx,
  pokemon: p,
  evolutions,
  pending,
  error,
  onEvolve,
}: {
  ctx: GameContext;
  pokemon: PokemonDto;
  evolutions: EvolutionCheck[];
  pending: boolean;
  error: unknown;
  onEvolve: (option: EvolutionOption) => void;
}) {
  const now = useNow();
  const dex = useDexIndex();
  if (evolutions.length === 0) return null;
  const usable = isUsable(p, now);
  // Même état qu'au Pokédex (shiny pour un Pokémon shiny) : silhouette tant que l'évolution n'a
  // pas été vue, grisée si vue, en couleur une fois capturée.
  const dexState = (speciesId: number, formId: number | null) => {
    const entry = dex.bySpecies.get(speciesId);
    const form = formId != null ? dex.byForm.get(formId) : undefined;
    const seen = (p.isShiny ? entry?.seenShiny : entry?.seen) ?? false;
    const caught =
      formId != null
        ? !!form && (!p.isShiny || form.caughtShiny)
        : ((p.isShiny ? entry?.caughtShiny : entry?.caught) ?? false);
    return { seen: seen || caught, caught };
  };

  return (
    <SheetSection title="Évolution">
      <ul className="space-y-2">
        {evolutions.map(({ option, method, methods }) => {
          const state = dexState(option.toSpeciesId, option.toFormId);
          return (
            <li
              key={`${option.toSpeciesId}:${option.toFormId ?? ''}`}
              className="flex flex-wrap items-center gap-3 rounded-md border-2 border-well-line bg-well p-2"
            >
              <PokemonSprite
                speciesId={option.toSpeciesId}
                formId={option.toFormId}
                shiny={p.isShiny && state.caught}
                size={48}
                silhouette={!state.seen}
                className={state.seen && !state.caught ? 'opacity-50 grayscale' : ''}
              />
              <div className="min-w-0 flex-1 basis-40 text-xs">
                <p className="text-sm font-semibold">
                  {speciesName(ctx, option.toSpeciesId, option.toFormId)}
                </p>
                {methods.length === 0 && (
                  <p className="text-slate-500">Pas encore possible dans le jeu.</p>
                )}
                {methods.map(({ method: m, missing }, i) => (
                  <p
                    key={i}
                    className={`flex flex-wrap items-center gap-1 ${
                      missing.length === 0
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-slate-500'
                    }`}
                  >
                    {m.itemId && (
                      <img
                        src={itemIcon(ctx, m.itemId)}
                        alt=""
                        width={18}
                        height={18}
                        className="[image-rendering:pixelated]"
                      />
                    )}
                    <span>
                      {i > 0 && 'ou '}
                      {missing.length === 0 && '✓ '}
                      {evolutionMethodText(ctx, m)}
                    </span>
                    {missing.length > 0 && (
                      <span className="text-slate-400">
                        — manque : {missing.map((r) => requirementText(ctx, r)).join(', ')}
                      </span>
                    )}
                  </p>
                ))}
              </div>
              {method && (
                <button
                  className="btn-primary ml-auto shrink-0 max-sm:w-full"
                  disabled={pending || !usable}
                  onClick={() => onEvolve(option)}
                >
                  Faire évoluer
                </button>
              )}
              {method && !usable && (
                <p className="w-full text-xs text-slate-500 sm:text-right">
                  Le Pokémon doit être disponible (ni occupé, ni K.O.)
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {!!error && <p className="mt-2 text-xs text-red-600">{errorText(error)}</p>}
    </SheetSection>
  );
}

/**
 * Méga-Évolution : les formes Méga de l'espèce et leur Méga-Gemme. Avec la gemme dans le sac, le
 * Pokémon (forme normale) Méga-Évolue en la tenant ; la lui retirer le rend normal et rend la gemme.
 */
function MegaPanel({
  ctx,
  pokemon: p,
  pending,
  error,
  onMega,
  onRevert,
}: {
  ctx: GameContext;
  pokemon: PokemonDto;
  pending: boolean;
  error: unknown;
  onMega: (itemId: string) => void;
  onRevert: () => void;
}) {
  const owned = useItemQuantities();
  const dex = useDexIndex();
  const options = megaOptions(ctx, p.speciesId);
  if (!p.megaStone && (p.formId !== null || options.length === 0)) return null;
  const busyTitle = p.busy ? 'Le Pokémon doit être disponible (ni en activité)' : undefined;
  // Donjon qui laisse la gemme (indice pour l'obtenir).
  const dungeonOf = (itemId: string) => ctx.dungeons.find((d) => d.gemItemId === itemId);

  return (
    <SheetSection title="Méga-Évolution">
      {p.megaStone ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border-2 border-well-line bg-well p-2 text-xs">
          <img
            src={itemIcon(ctx, p.megaStone)}
            alt=""
            width={32}
            height={32}
            className="[image-rendering:pixelated]"
          />
          <div className="min-w-32 flex-1">
            <p className="text-sm font-semibold">Tient : {itemName(ctx, p.megaStone)}</p>
            <p className="text-slate-500">
              En la retirant, il retrouve sa forme normale et la gemme revient dans ton sac.
            </p>
          </div>
          <button
            className="btn-ghost shrink-0 max-sm:w-full"
            disabled={pending || p.busy}
            title={busyTitle}
            onClick={onRevert}
          >
            Retirer la Méga-Gemme
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {options.flatMap(({ form, itemIds }) =>
            itemIds.map((itemId) => {
              const dexForm = dex.byForm.get(form.id);
              const caught = !!dexForm && (!p.isShiny || dexForm.caughtShiny);
              const quantity = owned(itemId);
              const dungeon = dungeonOf(itemId);
              return (
                <li
                  key={`${form.id}:${itemId}`}
                  className={`flex flex-wrap items-center gap-3 rounded-md border-2 border-well-line p-2 ${
                    quantity > 0 ? 'bg-well' : 'border-dashed'
                  }`}
                >
                  <PokemonSprite
                    speciesId={p.speciesId}
                    formId={form.id}
                    shiny={p.isShiny && caught}
                    size={48}
                    className={caught ? '' : 'opacity-50 grayscale'}
                  />
                  <div className="min-w-0 flex-1 basis-40 text-xs">
                    <p className="text-sm font-semibold">{form.nameFr}</p>
                    <p
                      className={`flex flex-wrap items-center gap-1 ${
                        quantity > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500'
                      }`}
                    >
                      <img
                        src={itemIcon(ctx, itemId)}
                        alt=""
                        width={18}
                        height={18}
                        className={`[image-rendering:pixelated] ${quantity > 0 ? '' : 'opacity-60 grayscale'}`}
                      />
                      <span>
                        {itemName(ctx, itemId)}
                        {quantity > 0 && ` × ${quantity}`}
                      </span>
                      {quantity === 0 && (
                        <span className="text-slate-400">
                          — à obtenir{dungeon && ` au donjon ${dungeon.name}`}
                        </span>
                      )}
                    </p>
                  </div>
                  {quantity > 0 && (
                    <button
                      className="btn-primary ml-auto shrink-0 max-sm:w-full"
                      disabled={pending || p.busy}
                      title={busyTitle}
                      onClick={() => onMega(itemId)}
                    >
                      Méga-Évoluer
                    </button>
                  )}
                </li>
              );
            }),
          )}
        </ul>
      )}
      {!!error && <p className="mt-2 text-xs text-red-600">{errorText(error)}</p>}
    </SheetSection>
  );
}

/** Objets endgame du sac utilisables sur ce Pokémon (Capsules, Aromates, Pilule / Patch Talent). */
function usableItems(ctx: GameContext, p: PokemonDto, inventory: InventoryEntryDto[] | undefined) {
  // Un Pokémon Méga-Évolué garde le talent de sa forme normale.
  const target = {
    ...p,
    formId: p.megaStone ? null : p.formId,
    originalNature: p.originalNature ?? p.nature,
  };
  return (inventory ?? [])
    .filter((i) => i.quantity > 0)
    .flatMap((i) => {
      const options = itemUseOptions(ctx, target, i.itemId);
      return options ? [{ ...i, options }] : [];
    });
}

type UsableItem = ReturnType<typeof usableItems>[number];
type ItemEffectType = UsableItem['options']['effect']['type'];

/** Rubriques de la popin « Objet », dans l'ordre d'affichage. */
const ITEM_GROUPS: { type: ItemEffectType; title: string }[] = [
  { type: 'levelUp', title: 'Niveau' },
  { type: 'ivCap', title: 'IV' },
  { type: 'abilityChange', title: 'Talent' },
  { type: 'mint', title: 'Nature (Aromates)' },
  { type: 'happiness', title: 'Bonheur' },
];

/** Effet d'un objet, sans le « Sur un Pokémon : » du Sac (on est déjà sur sa fiche). */
const itemEffectText = (item: UsableItem) => {
  const text = effectText(item.options.effect).replace(/^Sur un Pokémon : /, '');
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** Pourquoi l'objet ne ferait rien sur ce Pokémon. */
function uselessReason(item: UsableItem): string {
  const { effect } = item.options;
  switch (effect.type) {
    case 'ivCap':
      return 'Tous ses IV sont déjà à 31';
    case 'mint':
      return 'Nature actuelle';
    case 'abilityChange':
      return effect.hidden ? 'Pas de talent caché à lui donner' : 'Aucun autre talent à lui donner';
    case 'happiness':
      return 'Bonheur déjà au maximum';
    case 'levelUp':
      return 'Déjà au niveau maximal';
  }
}

/**
 * Popin « Objet » de la fiche du PC : objets du sac rangés par effet (niveau, IV, talent,
 * nature, bonheur), avec l'état actuel du Pokémon en tête. Le serveur vérifie de nouveau et
 * consomme l'objet.
 */
function ItemUseDialog({
  ctx,
  pokemon: p,
  items,
  open,
  onClose,
}: {
  ctx: GameContext;
  pokemon: PokemonDto;
  items: UsableItem[];
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  // IV choisi pour chaque Capsule « 1 IV au choix ».
  const [chosenStats, setChosenStats] = useState<Record<string, StatName>>({});
  const [done, setDone] = useState<string | null>(null);
  const use = useMutation({
    mutationFn: (input: UseItemInput) => applyItem(p.id, input),
    onSuccess: (data, input) => {
      setChosenStats({});
      setDone(
        `${itemName(ctx, input.itemId)} utilisé sur ${speciesName(ctx, p.speciesId, p.formId)}.`,
      );
      patchPokemon(queryClient, data.pokemon);
      setItemQuantity(queryClient, data.itemId, data.remaining);
    },
  });
  const close = () => {
    setDone(null);
    use.reset();
    onClose();
  };

  const species = ctx.species(p.speciesId, p.formId);
  const nature = getNature(p.nature);
  const natureUp =
    nature?.increasedStat && nature.increasedStat !== nature.decreasedStat
      ? nature.increasedStat
      : undefined;
  const ivTotal = STAT_NAMES.reduce((sum, s) => sum + p.ivs[s], 0);
  const disabled = use.isPending || p.busy;
  const busyTitle = p.busy ? 'Le Pokémon doit être disponible (ni en activité)' : undefined;
  const run = (item: UsableItem) => {
    const stat = chosenStats[item.itemId];
    setDone(null);
    use.mutate({ itemId: item.itemId, ...(stat && { stat }) });
  };

  const natureStats = (natureId: string) => {
    const n = getNature(natureId);
    if (!n?.increasedStat || n.increasedStat === n.decreasedStat) {
      return <span className="text-slate-500">Neutre</span>;
    }
    return (
      <>
        <span className="text-red-600 dark:text-red-400">▲ {STAT_LABELS[n.increasedStat]}</span>{' '}
        <span className="text-sky-700 dark:text-sky-400">▼ {STAT_LABELS[n.decreasedStat!]}</span>
      </>
    );
  };

  const itemRow = (item: UsableItem) => {
    const { itemId, quantity, options } = item;
    const { effect } = options;
    const needsStat = effect.type === 'ivCap' && !effect.all;
    const stat = chosenStats[itemId];
    const ready = options.usable && (!needsStat || !!stat);
    return (
      <li
        key={itemId}
        className={`flex flex-wrap items-center gap-3 rounded-md border-2 border-well-line p-2 ${
          options.usable ? 'bg-well' : 'border-dashed'
        }`}
      >
        <img
          src={itemIcon(ctx, itemId)}
          alt=""
          width={32}
          height={32}
          className={`shrink-0 [image-rendering:pixelated] ${options.usable ? '' : 'opacity-50 grayscale'}`}
        />
        <div className="min-w-0 flex-1 basis-48">
          <p className="font-semibold">
            {itemName(ctx, itemId)}{' '}
            <span className="font-mono text-sm font-normal text-slate-500">× {quantity}</span>
          </p>
          <p className="text-xs text-slate-500">
            {options.usable ? itemEffectText(item) : uselessReason(item)}
          </p>
          {options.usable && options.abilities.length > 0 && (
            <p className="text-xs text-emerald-700 dark:text-emerald-400">
              {options.abilities.length > 1 ? 'Au hasard : ' : 'Talent obtenu : '}
              {options.abilities.map(abilityLabel).join(' ou ')}
            </p>
          )}
        </div>
        {options.usable && (
          <button
            className="btn-primary ml-auto shrink-0 max-sm:w-full"
            disabled={!ready || disabled}
            title={busyTitle ?? (needsStat && !stat ? 'Choisis d’abord l’IV à monter' : undefined)}
            onClick={() => run(item)}
          >
            Utiliser
          </button>
        )}
        {options.usable && needsStat && (
          <div className="w-full">
            <p className="mb-1 text-xs text-slate-500">IV à monter à {MAX_IV} :</p>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
              {STAT_NAMES.map((s) => {
                const maxed = p.ivs[s] >= MAX_IV;
                const selected = stat === s;
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={maxed}
                    aria-pressed={selected}
                    onClick={() => setChosenStats((cur) => ({ ...cur, [itemId]: s }))}
                    className={`flex flex-col items-center rounded-md border-2 px-1 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-45 ${
                      selected
                        ? SELECTED_CELL
                        : 'border-well-line bg-white hover:border-slate-400 dark:bg-slate-900'
                    }`}
                  >
                    <span className="font-semibold">{STAT_LABELS[s]}</span>
                    <span
                      className={`font-mono ${maxed ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500'}`}
                    >
                      {p.ivs[s]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </li>
    );
  };

  const mintTile = (item: UsableItem) => {
    const { itemId, quantity, options } = item;
    const { effect } = options;
    if (effect.type !== 'mint') return null;
    return (
      <li
        key={itemId}
        className={`flex flex-col gap-1 rounded-md border-2 p-2 text-sm ${
          options.usable ? 'border-well-line bg-well' : SELECTED_CELL
        }`}
      >
        <div className="flex items-center gap-1.5">
          <img
            src={itemIcon(ctx, itemId)}
            alt=""
            width={24}
            height={24}
            className="shrink-0 [image-rendering:pixelated]"
          />
          <span className="min-w-0 truncate font-semibold">{natureLabel(effect.nature)}</span>
          <span className="ml-auto shrink-0 font-mono text-xs text-slate-500">× {quantity}</span>
        </div>
        <p className="text-xs">{natureStats(effect.nature)}</p>
        {options.usable ? (
          <button
            className="btn-primary mt-auto w-full py-1.5"
            disabled={disabled}
            title={busyTitle}
            onClick={() => run(item)}
          >
            Utiliser
          </button>
        ) : (
          <p className="pixel-label mt-auto py-1.5 text-center text-[8px] text-amber-800 dark:text-[#f8d878]">
            ▶ Nature actuelle
          </p>
        )}
      </li>
    );
  };

  return (
    <Modal open={open} onClose={close} wide className={LAUNCH_DIALOG_CLASS}>
      <header className="flex shrink-0 items-center gap-2 border-b-[3px] border-ink bg-hud px-3 py-2 text-white sm:gap-3 sm:px-4">
        <PokemonSprite
          speciesId={p.speciesId}
          formId={p.formId}
          shiny={p.isShiny}
          size={40}
          className="-my-1 shrink-0"
        />
        <h2 className="min-w-0 truncate font-pixel text-xs text-[#f8d030] uppercase sm:text-sm">
          Objets · {species?.nameFr}
        </h2>
        <span className={HUD_PILL}>N.{p.level}</span>
        <div className="flex-1" />
        <button
          type="button"
          className="btn size-10 shrink-0 border-[#0b0f1e] bg-brand-500 p-0 text-white"
          onClick={close}
          aria-label="Fermer"
          title="Fermer (Échap)"
        >
          ✕
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <InfoCell
            label="Nature"
            value={natureLabel(p.nature)}
            sub={
              natureUp
                ? `+${STAT_LABELS[natureUp]}, −${STAT_LABELS[nature!.decreasedStat!]}`
                : 'Neutre'
            }
          />
          <InfoCell
            label="Talent"
            value={abilityLabel(effectiveAbility(ctx, p))}
            sub={
              species?.abilities.find((a) => a.name === p.ability)?.isHidden ? 'Caché' : undefined
            }
          />
          <InfoCell label="IV" value={`${ivTotal} / ${MAX_IV * 6}`} />
          <InfoCell label="Bonheur" value={`${p.happiness} / 255`} />
        </dl>

        {p.busy && (
          <p className="rounded-md border-2 border-sky-700 bg-sky-50 px-3 py-2 text-sm text-sky-800 dark:border-sky-400 dark:bg-sky-950 dark:text-sky-300">
            Le Pokémon doit être disponible (ni en activité) pour recevoir un objet.
          </p>
        )}
        {done && <StatusPill tone="ok" text={done} />}
        {!!use.error && <StatusPill tone="bad" text={errorText(use.error)} />}

        {items.length === 0 && (
          <p className="text-sm text-slate-500">Aucun objet utilisable sur ce Pokémon.</p>
        )}
        {ITEM_GROUPS.map(({ type, title }) => {
          const group = items.filter((i) => i.options.effect.type === type);
          if (group.length === 0) return null;
          return (
            <CollapsibleSheetSection
              key={type}
              id={`pc.items.${type}`}
              title={title}
              aside={
                <span className="pixel-label text-[9px] text-slate-500">
                  {type === 'mint'
                    ? `${group.length} Aromate${group.length > 1 ? 's' : ''}`
                    : `${group.length} objet${group.length > 1 ? 's' : ''}`}
                </span>
              }
            >
              {type === 'mint' ? (
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">{group.map(mintTile)}</ul>
              ) : (
                <ul className="space-y-2">{group.map(itemRow)}</ul>
              )}
            </CollapsibleSheetSection>
          );
        })}
      </div>
    </Modal>
  );
}
