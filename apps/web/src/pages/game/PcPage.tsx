import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { STAT_NAMES } from '@poke/data';
import type { StatName } from '@poke/data';
import {
  ASSISTANT_POST_INFO,
  MAX_IV,
  MAX_LEVEL,
  abilityEffectSummary,
  applyCandies,
  candiesToMaxLevel,
  computeStats,
  effectiveAbility,
  expeditionPower,
  getNature,
  isHealing,
  isTransferableSpecies,
  itemUseOptions,
  lineageId,
  megaOptions,
  memberPower,
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
  ExpeditionDto,
  InventoryEntryDto,
  MegaEvolveInput,
  PokemonDto,
  TransferPokemonResponse,
  UseItemInput,
  UseItemResponse,
} from '@poke/shared';
import { TRANSFER_BATCH_MAX } from '@poke/shared';
import {
  HoverBubble,
  Modal,
  PokemonSprite,
  ProgressBar,
  ShinySparkles,
  ShinyStar,
  TypeBadge,
  useNow,
} from '../../components/ui';
import { PokemonTagBadges, TagManagerDialog, TagPicker } from '../../components/tags';
import { api } from '../../lib/api';
import {
  PLAYER_STATE_KEYS,
  centerState,
  isUsable,
  keys,
  useAssistants,
  useCandies,
  useEvolutionChecker,
  useExpeditions,
  useHeal,
  useRevive,
  useReviveStacks,
  useInventory,
  usePokedex,
  usePokedexForms,
  usePokemon,
  useTags,
  utcOffsetMinutes,
} from '../../lib/game';
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
  natureLabel,
  requirementText,
  speciesName,
} from '../../lib/labels';
import { DuplicateSettingsDialog, duplicates, loadDuplicateSettings } from './DuplicateSettings';
import { EvolutionReveal } from './EvolutionReveal';
import { GENDER_LABELS, PcFilterBar, PcPokemonCard, usePcBrowser } from './PcBrowser';

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
  const now = useNow();
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
  const queryClient = useQueryClient();
  const transfer = useMutation({
    mutationFn: async (ids: string[]) => {
      // Par lots : l'API plafonne le nombre de Pokémon par requête.
      let transferred = 0;
      const gained = new Map<number, number>();
      for (let i = 0; i < ids.length; i += TRANSFER_BATCH_MAX) {
        const res = await api<TransferPokemonResponse>('/api/pokemon/transfer', {
          method: 'POST',
          json: { ids: ids.slice(i, i + TRANSFER_BATCH_MAX) },
        });
        transferred += res.transferred;
        for (const g of res.gained)
          gained.set(g.lineageId, (gained.get(g.lineageId) ?? 0) + g.quantity);
      }
      return {
        transferred,
        gained: [...gained].map(([lineageId, quantity]) => ({ lineageId, quantity })),
      } satisfies TransferPokemonResponse;
    },
    onSuccess: (data) => {
      setTransferResult(data);
      setToTransfer(new Set());
      setConfirmingLast(false);
      setTransferMode(false);
      return Promise.all(
        PLAYER_STATE_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
    // Les lots déjà passés sont transférés : on resynchronise le PC.
    onError: () => {
      setToTransfer(new Set());
      setConfirmingLast(false);
      return Promise.all(
        PLAYER_STATE_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
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
        <button className="btn-ghost" onClick={() => setTagsOpen(true)}>
          Étiquettes
        </button>
        <button
          className={transferMode ? 'btn-primary' : 'btn-ghost'}
          onClick={() => {
            setTransferMode(!transferMode);
            setToTransfer(new Set());
            setConfirmingLast(false);
            setTransferResult(null);
          }}
        >
          {transferMode ? 'Terminer' : 'Transférer…'}
        </button>
      </PcFilterBar>

      {transferMode && (
        <div className="card mb-4 flex flex-wrap items-center gap-2 p-3 text-sm">
          <span className="flex-1">
            Touche les Pokémon à transférer contre des Bonbons de lignée (favoris, légendaires,
            fabuleux et Pokémon occupés exclus). <strong>{toTransfer.size}</strong> sélectionné(s),
            +{candiesGained} Bonbon
            {candiesGained > 1 ? 's' : ''}.
          </span>
          <button className="btn-ghost" onClick={selectDuplicates}>
            Sélectionner les doublons
          </button>
          <button
            className="btn-ghost px-2.5"
            onClick={() => setDuplicateSettingsOpen(true)}
            title="Régler le filtre des doublons"
            aria-label="Régler le filtre des doublons"
          >
            ⚙
          </button>
          <button
            className="btn-danger"
            disabled={toTransfer.size === 0 || transfer.isPending}
            onClick={requestTransfer}
          >
            Transférer ({toTransfer.size})
          </button>
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
      {transferResult && (
        <p className="mb-4 text-sm text-emerald-600">
          {transferResult.transferred} Pokémon transféré(s) :{' '}
          {transferResult.gained
            .map((g) => `${g.quantity} × ${candyName(ctx, g.lineageId)}`)
            .join(', ')}
          .
        </p>
      )}

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {filtered.map((entry) => {
          const { p } = entry;
          return (
            <PcPokemonCard
              key={p.id}
              entry={entry}
              tags={tagFilter.tags}
              now={now}
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
        })}
      </div>
      {filtered.length === 0 && !pokemon.isPending && (
        <p className="text-sm text-slate-500">Aucun Pokémon ne correspond.</p>
      )}

      <TagManagerDialog open={tagsOpen} onClose={() => setTagsOpen(false)} />
      <DuplicateSettingsDialog
        open={duplicateSettingsOpen}
        settings={duplicateSettings}
        onClose={() => setDuplicateSettingsOpen(false)}
        onSave={setDuplicateSettings}
      />
      {/* Taille fixe : les boutons de navigation restent au même endroit d'une fiche à l'autre. */}
      <Modal
        open={!!selected}
        onClose={closeDetail}
        wide
        className="flex h-[min(44rem,calc(100dvh-2rem))] flex-col"
      >
        {selected && (
          <>
            <div className="-mt-2 mb-2 flex shrink-0 items-center justify-end gap-1">
              {selectedIndex >= 0 && (
                <>
                  <button
                    type="button"
                    className="btn-ghost px-2.5 py-1"
                    disabled={!previous}
                    onClick={() => previous && setSelectedId(previous.p.id)}
                    aria-label="Pokémon précédent"
                    title="Pokémon précédent (←)"
                  >
                    ‹
                  </button>
                  <span className="min-w-16 text-center text-xs text-slate-500">
                    {selectedIndex + 1} / {filtered.length}
                  </span>
                  <button
                    type="button"
                    className="btn-ghost px-2.5 py-1"
                    disabled={!next}
                    onClick={() => next && setSelectedId(next.p.id)}
                    aria-label="Pokémon suivant"
                    title="Pokémon suivant (→)"
                  >
                    ›
                  </button>
                </>
              )}
              <button
                type="button"
                className="btn-ghost ml-2 px-2.5 py-1"
                onClick={closeDetail}
                aria-label="Fermer"
                title="Fermer (Échap)"
              >
                ✕
              </button>
            </div>
            <div className="-mx-6 -mb-6 min-h-0 flex-1 overflow-y-auto px-6 pb-6">
              <PokemonDetail
                key={selected.id}
                ctx={ctx}
                pokemon={selected}
                evolutions={evolutionsOf(selected)}
                onTransferred={(data) => {
                  setTransferResult(data);
                  setSelectedId(next?.p.id ?? previous?.p.id ?? null);
                }}
              />
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

/** Cœur de la grille du PC : ajoute ou retire des favoris sans ouvrir la fiche. */
function FavoriteToggle({ pokemon: p }: { pokemon: PokemonDto }) {
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: () =>
      api<PokemonDto>(`/api/pokemon/${p.id}`, { method: 'PATCH', json: { locked: !p.locked } }),
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

/** K.O. (avec l'envoi au Centre Pokémon s'il reste de la place) ou en soins. */
function KoDetail({ ctx, p }: { ctx: GameContext; p: PokemonDto }) {
  const now = useNow();
  const pokemon = usePokemon();
  const heal = useHeal();
  const revive = useRevive();
  const [reviveStack] = useReviveStacks(ctx);
  if (p.knockedOut) {
    const { free } = centerState(ctx, pokemon.data ?? [], now);
    const pending = heal.isPending || revive.isPending;
    const error = heal.error ?? revive.error;
    return (
      <div className="mt-1 text-sm">
        <p className="text-red-600">K.O. : il doit être soigné au Centre Pokémon.</p>
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          {free > 0 && (
            <button
              className="btn-primary py-1 text-sm"
              disabled={pending}
              onClick={() => heal.mutate([p.id])}
            >
              Envoyer au Centre Pokémon
            </button>
          )}
          {reviveStack && (
            <button
              className="btn-ghost py-1 text-sm"
              disabled={pending}
              onClick={() => revive.mutate({ itemId: reviveStack.itemId, pokemonIds: [p.id] })}
            >
              Utiliser un rappel ({reviveStack.quantity})
            </button>
          )}
        </div>
        {free === 0 && (
          <p className="text-xs text-slate-500">Le Centre Pokémon est plein pour l’instant.</p>
        )}
        {error && <p className="text-xs text-red-600">{errorText(error)}</p>}
      </div>
    );
  }
  if (!isHealing(p.healUntil, now)) return null;
  return (
    <p className="mt-1 text-sm text-pink-600 dark:text-pink-400">
      En soins au Centre Pokémon encore {formatCountdown(Date.parse(p.healUntil!) - now)}
    </p>
  );
}

/**
 * Activité où le talent d'un Pokémon occupé agit en ce moment (expédition, légendaire, combat,
 * donjon, pension, poste d'assistant) ; undefined = Pokémon libre.
 */
function busyAbilityActivities(
  p: PokemonDto,
  assistants: readonly AssistantDto[] | undefined,
  expeditions: readonly ExpeditionDto[] | undefined,
): AbilityActivity[] | undefined {
  switch (p.activity) {
    case 'expedition':
      return [
        expeditions?.some((e) => e.questId && e.team.includes(p.id)) ? 'quest' : 'expedition',
      ];
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

function PokemonDetail({
  ctx,
  pokemon: p,
  evolutions,
  onTransferred,
}: {
  ctx: GameContext;
  pokemon: PokemonDto;
  evolutions: EvolutionCheck[];
  onTransferred: (data: TransferPokemonResponse) => void;
}) {
  const queryClient = useQueryClient();
  const tags = useTags().data ?? [];
  const assistants = useAssistants();
  const expeditions = useExpeditions();
  const [reveal, setReveal] = useState<EvolveResponse | null>(null);
  const [revealMega, setRevealMega] = useState(false);
  const refreshPlayerState = () =>
    Promise.all(PLAYER_STATE_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  const megaEvolve = useMutation({
    mutationFn: (input: MegaEvolveInput) =>
      api<EvolveResponse>(`/api/pokemon/${p.id}/mega`, { method: 'POST', json: input }),
    onSuccess: (data) => {
      setRevealMega(true);
      setReveal(data);
      return refreshPlayerState();
    },
  });
  const megaRevert = useMutation({
    mutationFn: () => api<PokemonDto>(`/api/pokemon/${p.id}/mega`, { method: 'DELETE' }),
    onSuccess: refreshPlayerState,
  });
  const evolve = useMutation({
    mutationFn: ({ toSpeciesId, toFormId }: Pick<EvolutionOption, 'toSpeciesId' | 'toFormId'>) =>
      api<EvolveResponse>(`/api/pokemon/${p.id}/evolve`, {
        method: 'POST',
        json: { toSpeciesId, toFormId, utcOffsetMinutes: utcOffsetMinutes() },
      }),
    onSuccess: (data) => {
      setRevealMega(false);
      setReveal(data);
      return refreshPlayerState();
    },
  });
  const species = ctx.species(p.speciesId, p.formId)!;
  const stats = computeStats(species, p);
  const abilitySummary = abilityEffectSummary(
    ctx,
    effectiveAbility(ctx, p),
    busyAbilityActivities(p, assistants.data, expeditions.data?.active),
  );
  const nature = getNature(p.nature);
  const levelXp = xpForLevel(species.growthRate, p.level);
  const nextXp = xpForLevel(species.growthRate, Math.min(MAX_LEVEL, p.level + 1));
  const ivTotal = STAT_NAMES.reduce((sum, s) => sum + p.ivs[s], 0);

  const toggleLock = useMutation({
    mutationFn: () =>
      api<PokemonDto>(`/api/pokemon/${p.id}`, { method: 'PATCH', json: { locked: !p.locked } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.pokemon }),
  });

  const candies = useCandies();
  const lineage = lineageId(ctx, p.speciesId);
  const ownedCandies = candies.data?.find((c) => c.lineageId === lineage)?.quantity ?? 0;
  const usefulCandies = Math.min(ownedCandies, candiesToMaxLevel(ctx, p));
  const [candyCount, setCandyCount] = useState(1);
  const candiesToGive = Math.min(candyCount, usefulCandies);
  // Aperçu : XP gagnée et niveau atteint avec les Bonbons choisis.
  const fed = applyCandies(ctx, p, candiesToGive);
  const feed = useMutation({
    mutationFn: (count: number) =>
      api<PokemonDto>(`/api/pokemon/${p.id}/candies`, { method: 'POST', json: { count } }),
    onSuccess: () =>
      Promise.all(
        [keys.pokemon, keys.candies].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      ),
  });

  const inventory = useInventory();
  const usable = usableItems(ctx, p, inventory.data);
  const [itemsOpen, setItemsOpen] = useState(false);

  const [confirmTransfer, setConfirmTransfer] = useState(false);
  const transfer = useMutation({
    mutationFn: () =>
      api<TransferPokemonResponse>('/api/pokemon/transfer', {
        method: 'POST',
        json: { ids: [p.id] },
      }),
    onSuccess: async (data) => {
      onTransferred(data);
      await Promise.all(
        PLAYER_STATE_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
  });

  if (reveal) {
    return (
      <EvolutionReveal ctx={ctx} data={reveal} mega={revealMega} onDone={() => setReveal(null)} />
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-[200px_1fr]">
      <div className="flex flex-col items-center text-center">
        <div className="relative">
          {p.isShiny && <ShinySparkles loop radius={110} />}
          <PokemonSprite
            speciesId={p.speciesId}
            formId={p.formId}
            shiny={p.isShiny}
            kind="artwork"
            size={180}
          />
        </div>
        <h2 className="mt-2 text-xl font-bold">
          {species.nameFr} <span className="text-slate-400">{GENDER_LABELS[p.gender]}</span>{' '}
          {p.isShiny && <ShinyStar />}
        </h2>
        <p className="text-sm text-slate-500">
          N° {String(p.speciesId).padStart(3, '0')} · Niveau {p.level}
        </p>
        <PokemonTagBadges
          pokemon={p}
          tags={tags}
          className="mt-1 gap-1"
          badgeClassName="px-2 text-xs leading-5"
        />
        <KoDetail ctx={ctx} p={p} />
        <div className="mt-2 flex gap-1">
          {species.types.map((t) => (
            <TypeBadge key={t} type={t} />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button
            className="btn-ghost"
            disabled={toggleLock.isPending}
            onClick={() => toggleLock.mutate()}
          >
            {p.locked ? '♥ Retirer des favoris' : '♡ Ajouter aux favoris'}
          </button>
          <button
            className="btn-ghost"
            disabled={usable.length === 0}
            title={usable.length === 0 ? 'Aucun objet utilisable sur ce Pokémon' : undefined}
            onClick={() => setItemsOpen(true)}
          >
            Objet
          </button>
        </div>
        <TagPicker pokemon={p} />
        <ItemUseDialog
          ctx={ctx}
          pokemon={p}
          items={usable}
          open={itemsOpen}
          onClose={() => setItemsOpen(false)}
        />

        {lineage !== undefined && (
          <div className="mt-4 w-full rounded-xl border border-slate-200 p-3 text-left text-xs dark:border-slate-800">
            <p className="font-medium">
              {candyName(ctx, lineage)} : {ownedCandies}
            </p>
            <p className="text-slate-500">{ctx.balance.transfer.xpPerCandy} XP par Bonbon.</p>
            {usefulCandies > 0 && (
              <>
                <div className="mt-2 flex items-center gap-1">
                  <input
                    type="number"
                    className="input min-w-0 flex-1 px-2 py-1"
                    min={1}
                    max={usefulCandies}
                    value={candiesToGive}
                    onChange={(e) => setCandyCount(Math.max(1, Number(e.target.value) || 1))}
                  />
                  <button
                    className="btn-ghost shrink-0 px-2 py-1"
                    disabled={candiesToGive === usefulCandies}
                    onClick={() => setCandyCount(usefulCandies)}
                    title="Autant de Bonbons que possible (jusqu’au niveau maximal)"
                  >
                    Max
                  </button>
                  <button
                    className="btn-ghost shrink-0 px-2 py-1"
                    disabled={feed.isPending}
                    onClick={() => feed.mutate(candiesToGive)}
                  >
                    Donner
                  </button>
                </div>
                <p className="mt-1 text-slate-500">
                  +{fed.xp - p.xp} XP →{' '}
                  <span className={fed.level > p.level ? 'font-semibold text-emerald-600' : ''}>
                    niveau {fed.level}
                  </span>
                  {fed.level >= MAX_LEVEL && ' (max)'}
                </p>
              </>
            )}
            {feed.error && <p className="mt-1 text-red-600">{errorText(feed.error)}</p>}
          </div>
        )}

        <div className="mt-3 w-full text-xs">
          {confirmTransfer ? (
            <div className="rounded-xl border border-red-200 p-3 dark:border-red-900">
              <p>
                Transférer {species.nameFr} contre {transferCandies(ctx, p)} ×{' '}
                {lineage !== undefined ? candyName(ctx, lineage) : 'Bonbon'} ? C’est définitif.
              </p>
              <div className="mt-2 flex justify-center gap-2">
                <button
                  className="btn-danger py-1"
                  disabled={transfer.isPending}
                  onClick={() => transfer.mutate()}
                >
                  Transférer
                </button>
                <button className="btn-ghost py-1" onClick={() => setConfirmTransfer(false)}>
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <button
              className="btn-danger w-full"
              disabled={!canTransfer(ctx, p)}
              title={
                !isTransferableSpecies(ctx, p.speciesId)
                  ? 'Les légendaires et les fabuleux ne se transfèrent pas'
                  : p.locked
                    ? 'Retire-le des favoris pour pouvoir le transférer'
                    : p.busy
                      ? 'Le Pokémon doit être disponible (ni en activité)'
                      : undefined
              }
              onClick={() => setConfirmTransfer(true)}
            >
              Transférer
            </button>
          )}
          {transfer.error && <p className="mt-1 text-red-600">{errorText(transfer.error)}</p>}
        </div>
      </div>

      <div className="space-y-4 text-sm">
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
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
          <dt className="text-slate-500">Nature</dt>
          <dd>
            {natureLabel(p.nature)}
            {nature?.increasedStat && nature.increasedStat !== nature.decreasedStat && (
              <span className="text-xs text-slate-500">
                {' '}
                (+{STAT_LABELS[nature.increasedStat]}, −{STAT_LABELS[nature.decreasedStat!]})
              </span>
            )}
            {p.originalNature && (
              <span className="block text-xs text-slate-500">
                Aromate · d’origine {natureLabel(p.originalNature)}
              </span>
            )}
          </dd>
          <dt className="text-slate-500">Talent</dt>
          <dd>
            {p.megaStone && species.abilities[0] ? (
              <>
                <AbilityName name={species.abilities[0].name} summary={abilitySummary} />
                <span className="block text-xs text-slate-500">
                  Méga-Évolution ·{' '}
                  {p.ability ? `d’origine ${abilityLabel(p.ability)}` : 'sans talent d’origine'}
                </span>
              </>
            ) : (
              <>
                <AbilityName name={p.ability} summary={abilitySummary} />
                {species.abilities.find((a) => a.name === p.ability)?.isHidden && (
                  <span className="ml-1 text-xs text-violet-600">(caché)</span>
                )}
                {!p.ability && (
                  <span className="block text-xs text-slate-500">
                    Pilule Talent ou Patch Talent pour en débloquer un
                  </span>
                )}
              </>
            )}
          </dd>
          <dt className="text-slate-500">Puissance (PE)</dt>
          <dd className="font-semibold">{memberPower(ctx, p)}</dd>
          <dt className="text-slate-500">Bonheur</dt>
          <dd>{p.happiness} / 255</dd>
          <dt className="text-slate-500">Origine</dt>
          <dd>
            {ORIGIN_LABELS[p.origin]}
            {p.originRegion && ` · ${ctx.region(p.originRegion)?.name ?? p.originRegion}`}
          </dd>
          <dt className="text-slate-500">Obtenu le</dt>
          <dd>
            {new Date(p.caughtAt).toLocaleString('fr-FR', {
              dateStyle: 'short',
              timeStyle: 'short',
            })}
          </dd>
        </dl>

        <div>
          <div className="flex justify-between text-xs text-slate-500">
            <span>
              XP {p.xp - levelXp} / {nextXp - levelXp}
            </span>
            <span>{p.level >= MAX_LEVEL ? 'Niveau max' : `→ N.${p.level + 1}`}</span>
          </div>
          <ProgressBar value={p.level >= MAX_LEVEL ? 1 : (p.xp - levelXp) / (nextXp - levelXp)} />
        </div>

        <table className="w-full text-left">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="py-1 font-normal">Stat</th>
              <th className="py-1 font-normal">Base</th>
              <th className="py-1 font-normal">IV</th>
              <th className="py-1 text-right font-normal">Valeur</th>
            </tr>
          </thead>
          <tbody>
            {STAT_NAMES.map((s) => {
              const up = nature?.increasedStat === s && nature.decreasedStat !== s;
              const down = nature?.decreasedStat === s && nature.increasedStat !== s;
              return (
                <tr key={s} className="border-t border-slate-100 dark:border-slate-800">
                  <td className={`py-1 ${up ? 'text-red-600' : down ? 'text-sky-600' : ''}`}>
                    {STAT_LABELS[s]}
                  </td>
                  <td className="py-1 text-slate-500">{species.baseStats[s]}</td>
                  <td className="py-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-6 ${p.ivs[s] === MAX_IV ? 'font-bold text-amber-600' : ''}`}
                      >
                        {p.ivs[s]}
                      </span>
                      <ProgressBar className="w-20" value={p.ivs[s] / MAX_IV} />
                    </div>
                  </td>
                  <td className="py-1 text-right font-mono">{stats[s]}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="text-xs text-slate-500">
            <tr className="border-t border-slate-200 dark:border-slate-700">
              <td className="py-1">Total</td>
              <td />
              <td className="py-1">
                {ivTotal} / {MAX_IV * 6}
              </td>
              <td className="py-1 text-right font-mono">{expeditionPower(stats)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/** Nom du talent ; sa description s'affiche au survol. */
function AbilityName({ name, summary }: { name: string; summary: string | null }) {
  if (!summary) return <>{abilityLabel(name)}</>;
  return (
    <HoverBubble
      width={240}
      height={80}
      className="inline-block cursor-help underline decoration-slate-400 decoration-dotted underline-offset-2"
      content={<span className="text-emerald-700 dark:text-emerald-400">{summary}</span>}
    >
      {abilityLabel(name)}
    </HoverBubble>
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
  const pokedex = usePokedex();
  const pokedexForms = usePokedexForms();
  if (evolutions.length === 0) return null;
  const usable = isUsable(p, now);
  // Même état qu'au Pokédex (shiny pour un Pokémon shiny) : silhouette tant que l'évolution n'a
  // pas été vue, grisée si vue, en couleur une fois capturée.
  const dexState = (speciesId: number, formId: number | null) => {
    const entry = pokedex.data?.find((e) => e.speciesId === speciesId);
    const form = formId != null ? pokedexForms.data?.find((f) => f.formId === formId) : undefined;
    const seen = (p.isShiny ? entry?.seenShiny : entry?.seen) ?? false;
    const caught =
      formId != null
        ? !!form && (!p.isShiny || form.caughtShiny)
        : ((p.isShiny ? entry?.caughtShiny : entry?.caught) ?? false);
    return { seen: seen || caught, caught };
  };

  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <p className="mb-2 font-medium">Évolution</p>
      <ul className="space-y-2">
        {evolutions.map(({ option, method, methods }) => {
          const dex = dexState(option.toSpeciesId, option.toFormId);
          return (
            <li
              key={`${option.toSpeciesId}:${option.toFormId ?? ''}`}
              className="flex items-center gap-3"
            >
              <PokemonSprite
                speciesId={option.toSpeciesId}
                formId={option.toFormId}
                shiny={p.isShiny && dex.caught}
                size={48}
                silhouette={!dex.seen}
                className={dex.seen && !dex.caught ? 'opacity-50 grayscale' : ''}
              />
              <div className="min-w-0 flex-1 text-xs">
                <p className="text-sm font-medium">
                  {speciesName(ctx, option.toSpeciesId, option.toFormId)}
                </p>
                {methods.length === 0 && (
                  <p className="text-slate-500">Pas encore possible dans le jeu.</p>
                )}
                {methods.map(({ method: m, missing }, i) => (
                  <p
                    key={i}
                    className={`flex flex-wrap items-center gap-1 ${
                      missing.length === 0 ? 'text-emerald-600' : 'text-slate-500'
                    }`}
                  >
                    {m.itemId && (
                      <img src={itemIcon(ctx, m.itemId)} alt="" width={18} height={18} />
                    )}
                    <span>
                      {i > 0 && 'ou '}
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
                  className="btn-primary shrink-0 py-1"
                  disabled={pending || !usable}
                  title={
                    usable ? undefined : 'Le Pokémon doit être disponible (ni occupé, ni K.O.)'
                  }
                  onClick={() => onEvolve(option)}
                >
                  Faire évoluer
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {!!error && <p className="mt-2 text-xs text-red-600">{errorText(error)}</p>}
    </div>
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
  const inventory = useInventory();
  const pokedexForms = usePokedexForms();
  const options = megaOptions(ctx, p.speciesId);
  if (!p.megaStone && (p.formId !== null || options.length === 0)) return null;
  const busyTitle = p.busy ? 'Le Pokémon doit être disponible (ni en activité)' : undefined;
  const owned = (itemId: string) => inventory.data?.find((i) => i.itemId === itemId)?.quantity ?? 0;
  // Donjon qui laisse la gemme (indice pour l'obtenir).
  const dungeonOf = (itemId: string) => ctx.dungeons.find((d) => d.gemItemId === itemId);

  return (
    <div className="rounded-xl border border-violet-200 p-3 dark:border-violet-900">
      <p className="mb-2 font-medium">Méga-Évolution</p>
      {p.megaStone ? (
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <img src={itemIcon(ctx, p.megaStone)} alt="" width={32} height={32} />
          <div className="min-w-32 flex-1">
            <p className="text-sm font-medium">Tient : {itemName(ctx, p.megaStone)}</p>
            <p className="text-slate-500">
              En la retirant, il retrouve sa forme normale et la gemme revient dans ton sac.
            </p>
          </div>
          <button
            className="btn-ghost shrink-0 py-1"
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
              const dexForm = pokedexForms.data?.find((f) => f.formId === form.id);
              const caught = !!dexForm && (!p.isShiny || dexForm.caughtShiny);
              const quantity = owned(itemId);
              const dungeon = dungeonOf(itemId);
              return (
                <li key={`${form.id}:${itemId}`} className="flex items-center gap-3">
                  <PokemonSprite
                    speciesId={p.speciesId}
                    formId={form.id}
                    shiny={p.isShiny && caught}
                    size={48}
                    className={caught ? '' : 'opacity-50 grayscale'}
                  />
                  <div className="min-w-0 flex-1 text-xs">
                    <p className="text-sm font-medium">{form.nameFr}</p>
                    <p
                      className={`flex flex-wrap items-center gap-1 ${
                        quantity > 0 ? 'text-emerald-600' : 'text-slate-500'
                      }`}
                    >
                      <img src={itemIcon(ctx, itemId)} alt="" width={18} height={18} />
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
                      className="btn-primary shrink-0 py-1"
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
    </div>
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

/** Popin « Objet » de la fiche : le serveur vérifie de nouveau et consomme l'objet. */
function ItemUseDialog({
  ctx,
  pokemon: p,
  items,
  open,
  onClose,
}: {
  ctx: GameContext;
  pokemon: PokemonDto;
  items: ReturnType<typeof usableItems>;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [stat, setStat] = useState<StatName | ''>('');
  const use = useMutation({
    mutationFn: (input: UseItemInput) =>
      api<UseItemResponse>(`/api/pokemon/${p.id}/use-item`, { method: 'POST', json: input }),
    onSuccess: () => {
      setStat('');
      return Promise.all(
        [keys.pokemon, keys.inventory].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
  });

  return (
    <Modal open={open} onClose={onClose}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-semibold">Objet · {speciesName(ctx, p.speciesId, p.formId)}</h3>
        <button
          type="button"
          className="btn-ghost px-2.5 py-1"
          onClick={onClose}
          aria-label="Fermer"
          title="Fermer (Échap)"
        >
          ✕
        </button>
      </div>
      {items.length === 0 && (
        <p className="text-sm text-slate-500">Aucun objet utilisable sur ce Pokémon.</p>
      )}
      <ul className="max-h-[60dvh] space-y-2 overflow-y-auto">
        {items.map(({ itemId, quantity, options }) => {
          const { effect } = options;
          const needsStat = effect.type === 'ivCap' && !effect.all;
          const ready = options.usable && (!needsStat || stat !== '');
          return (
            <li key={itemId} className="flex flex-wrap items-center gap-2 text-xs">
              <img src={itemIcon(ctx, itemId)} alt="" width={24} height={24} />
              <div className="min-w-32 flex-1">
                <p className="text-sm font-medium">
                  {itemName(ctx, itemId)} <span className="text-slate-400">× {quantity}</span>
                </p>
                <p className="text-slate-500">
                  {options.usable ? effectText(effect) : 'Sans effet sur ce Pokémon'}
                </p>
                {options.usable && options.abilities.length > 0 && (
                  <p className="text-slate-500">
                    {options.abilities.length > 1 ? 'Au hasard : ' : 'Talent obtenu : '}
                    {options.abilities.map(abilityLabel).join(' ou ')}
                  </p>
                )}
              </div>
              {options.usable && needsStat && (
                <select
                  className="input w-auto py-1 text-xs"
                  value={stat}
                  onChange={(e) => setStat(e.target.value as StatName | '')}
                >
                  <option value="">IV à monter…</option>
                  {options.stats.map((s) => (
                    <option key={s} value={s}>
                      {STAT_LABELS[s]} ({p.ivs[s]})
                    </option>
                  ))}
                </select>
              )}
              {options.usable && (
                <button
                  className="btn-primary shrink-0 py-1"
                  disabled={!ready || use.isPending || p.busy}
                  title={p.busy ? 'Le Pokémon doit être disponible (ni en activité)' : undefined}
                  onClick={() =>
                    use.mutate({
                      itemId,
                      ...(needsStat && stat && { stat }),
                    })
                  }
                >
                  Utiliser
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {!!use.error && <p className="mt-2 text-xs text-red-600">{errorText(use.error)}</p>}
    </Modal>
  );
}
