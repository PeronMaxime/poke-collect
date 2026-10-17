import { useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'motion/react';
import { STAT_NAMES } from '@poke/data';
import { MAX_IV, isTransferableSpecies } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type { HatchEggsResponse, PokemonDto, TransferPokemonResponse } from '@poke/shared';
import {
  Egg,
  GenderSymbol,
  IvHover,
  Modal,
  PokemonSprite,
  ShinySparkles,
  ShinyStar,
} from '../../components/ui';
import { TagPicker } from '../../components/tags';
import { api } from '../../lib/api';
import { PLAYER_STATE_KEYS, keys, newInDexTracker, usePokemon } from '../../lib/game';
import { errorText, natureLabel, speciesName } from '../../lib/labels';

const STEP = 0.5; // secondes entre deux éclosions

interface RevealOptions {
  /** Titre selon le nombre de Pokémon ; par défaut « N œufs éclos ! ». */
  title?: (count: number) => string;
  /** Ce qui tremble puis disparaît avant chaque Pokémon ; par défaut un œuf. */
  cover?: ReactNode;
}

/**
 * Éclosion animée : chaque œuf tremble, se brise, puis révèle son Pokémon. Sert aussi au Musée
 * (fossiles restaurés), avec un autre titre et une autre image.
 */
export function HatchReveal({
  ctx,
  data,
  onClose,
  ...options
}: {
  ctx: GameContext;
  data: HatchEggsResponse | null;
  onClose: () => void;
} & RevealOptions) {
  return (
    <Modal open={!!data} onClose={onClose} wide>
      {data && <HatchContent ctx={ctx} data={data} onClose={onClose} {...options} />}
    </Modal>
  );
}

const eggTitle = (n: number) => `${n} œuf${n > 1 ? 's' : ''} éclo${n > 1 ? 's' : ''} !`;

function HatchContent({
  ctx,
  data,
  onClose,
  title = eggTitle,
  cover = <Egg size={64} />,
}: {
  ctx: GameContext;
  data: HatchEggsResponse;
  onClose: () => void;
} & RevealOptions) {
  const reduced = useReducedMotion();
  const [skipped, setSkipped] = useState(false);
  const instant = reduced || skipped;
  // « Nouveau ! » sur le premier Pokémon de chaque nouvelle espèce ou forme seulement.
  const isFirstNew = newInDexTracker(data);
  const firstNew = new Set(data.hatched.filter(isFirstNew).map((p) => p.id));
  const delay = (i: number) => (instant ? 0 : 0.6 + i * STEP);
  // État à jour (favori, étiquettes) une fois le PC rechargé ; sinon celui de l'éclosion.
  const pokemon = usePokemon();
  const current = new Map(pokemon.data?.map((p) => [p.id, p]));
  const queryClient = useQueryClient();
  // Pokémon transférés depuis cette fenêtre, un par un ou tous d'un coup.
  const [transferred, setTransferred] = useState<ReadonlySet<string>>(new Set());
  const markTransferred = (ids: string[]) => setTransferred((cur) => new Set([...cur, ...ids]));
  const [confirmingAll, setConfirmingAll] = useState(false);
  const transferable = data.hatched
    .map((p) => current.get(p.id) ?? p)
    .filter(
      (p) =>
        !transferred.has(p.id) && !p.locked && !p.busy && isTransferableSpecies(ctx, p.speciesId),
    );
  const shinyCount = transferable.filter((p) => p.isShiny).length;
  const transferAll = useMutation({
    mutationFn: (ids: string[]) =>
      api<TransferPokemonResponse>('/api/pokemon/transfer', { method: 'POST', json: { ids } }),
    onSuccess: (_, ids) => {
      markTransferred(ids);
      setConfirmingAll(false);
      return Promise.all(
        PLAYER_STATE_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
  });
  const allCandies = transferAll.data?.gained.reduce((sum, g) => sum + g.quantity, 0) ?? 0;

  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-xl font-bold">{title(data.hatched.length)}</h2>
        {!instant && (
          <button
            className="text-sm text-slate-500 hover:underline"
            onClick={() => setSkipped(true)}
          >
            Tout afficher
          </button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {data.hatched.map((p, i) => {
          const perfect = STAT_NAMES.filter((s) => p.ivs[s] === MAX_IV).length;
          const total = STAT_NAMES.reduce((sum, s) => sum + p.ivs[s], 0);
          return (
            <div
              key={p.id}
              className={`relative flex min-h-36 flex-col items-center justify-center rounded-xl border p-2 text-center text-xs ${
                p.isShiny
                  ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/40'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              {!instant && (
                <motion.div
                  // Reste en place une fois invisible : sans ça, il intercepte les clics sur Favori.
                  className="pointer-events-none absolute"
                  initial={{ opacity: 1, rotate: 0 }}
                  animate={{ rotate: [0, -12, 12, -8, 8, 0], opacity: [1, 1, 1, 1, 1, 0] }}
                  transition={{ delay: delay(i) - 0.6, duration: 0.6 }}
                >
                  {cover}
                </motion.div>
              )}
              <motion.div
                // Remonté au clic sur « Tout afficher » : l'animation en cours garde sinon son délai.
                key={String(instant)}
                className="flex flex-col items-center"
                initial={instant ? false : { opacity: 0, scale: 0.4 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: delay(i), type: 'spring', stiffness: 260, damping: 16 }}
              >
                {firstNew.has(p.id) && (
                  <span className="rounded-full bg-brand-500 px-1.5 text-[10px] font-bold text-white">
                    Nouveau !
                  </span>
                )}
                <span className="relative">
                  {p.isShiny && <ShinySparkles delay={delay(i)} loop />}
                  <IvHover ivs={p.ivs}>
                    <PokemonSprite
                      speciesId={p.speciesId}
                      formId={p.formId}
                      shiny={p.isShiny}
                      size={72}
                    />
                  </IvHover>
                </span>
                <span className="font-medium">
                  {speciesName(ctx, p.speciesId, p.formId)} <GenderSymbol gender={p.gender} />{' '}
                  {p.isShiny && <ShinyStar />}
                </span>
                <span className="text-slate-500">{natureLabel(p.nature)}</span>
                <span className={perfect >= 3 ? 'font-semibold text-amber-600' : 'text-slate-500'}>
                  IV {total} / {MAX_IV * 6}
                  {perfect > 0 && ` · ${perfect} × 31`}
                </span>
                <NewbornActions
                  ctx={ctx}
                  pokemon={current.get(p.id) ?? p}
                  transferred={transferred.has(p.id)}
                  onTransferred={() => markTransferred([p.id])}
                />
              </motion.div>
            </div>
          );
        })}
      </div>

      {transferAll.error && (
        <p className="mt-4 text-right text-sm text-red-600">{errorText(transferAll.error)}</p>
      )}
      <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
        {transferAll.data && !confirmingAll && (
          <span className="text-sm text-slate-500">
            {transferAll.data.transferred} transféré{transferAll.data.transferred > 1 ? 's' : ''} ·
            +{allCandies} Bonbon{allCandies > 1 ? 's' : ''}
          </span>
        )}
        {confirmingAll && transferable.length > 0 ? (
          <span className="flex flex-wrap items-center justify-end gap-2 text-sm">
            <span className="text-slate-600 dark:text-slate-300">
              Transférer {transferable.length} Pokémon (favoris exclus)
              {shinyCount > 0 && (
                <strong className="text-amber-600"> dont {shinyCount} shiny</strong>
              )}{' '}
              ?
            </span>
            <button
              className="btn-danger"
              disabled={transferAll.isPending}
              onClick={() => transferAll.mutate(transferable.map((p) => p.id))}
            >
              Confirmer
            </button>
            <button className="btn-ghost" onClick={() => setConfirmingAll(false)}>
              Annuler
            </button>
          </span>
        ) : (
          data.hatched.length > 1 && (
            <button
              className="btn-ghost"
              disabled={transferable.length === 0 || transferAll.isPending}
              title="Transférer tous les Pokémon éclos contre des Bonbons de lignée (favoris exclus)"
              onClick={() => setConfirmingAll(true)}
            >
              Tout transférer
            </button>
          )
        )}
        <button className="btn-primary" onClick={onClose}>
          Continuer
        </button>
      </div>
    </div>
  );
}

/**
 * Favori, étiquettes et transfert directement depuis l'éclosion, le Musée ou l'expédition, sans
 * passer par le PC.
 */
export function NewbornActions({
  ctx,
  pokemon: p,
  transferred = false,
  onTransferred,
}: {
  ctx: GameContext;
  pokemon: PokemonDto;
  /** Déjà transféré par un transfert groupé du parent. */
  transferred?: boolean;
  onTransferred?: () => void;
}) {
  const queryClient = useQueryClient();
  const toggleLock = useMutation({
    mutationFn: () =>
      api<PokemonDto>(`/api/pokemon/${p.id}`, { method: 'PATCH', json: { locked: !p.locked } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.pokemon }),
  });
  const transfer = useMutation({
    mutationFn: () =>
      api<TransferPokemonResponse>('/api/pokemon/transfer', {
        method: 'POST',
        json: { ids: [p.id] },
      }),
    onSuccess: () => {
      onTransferred?.();
      return Promise.all(
        PLAYER_STATE_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
  });
  if (transfer.data) {
    const candies = transfer.data.gained.reduce((sum, g) => sum + g.quantity, 0);
    return (
      <p className="mt-1 text-slate-500">
        Transféré · +{candies} Bonbon{candies > 1 ? 's' : ''}
      </p>
    );
  }
  if (transferred) return <p className="mt-1 text-slate-500">Transféré</p>;
  return (
    <NewbornActionsView
      pokemon={p}
      transferable={isTransferableSpecies(ctx, p.speciesId)}
      tags={<TagPicker pokemon={p} compact />}
      lockPending={toggleLock.isPending}
      lockError={toggleLock.error}
      onToggleLock={() => toggleLock.mutate()}
      transferPending={transfer.isPending}
      transferError={transfer.error}
      onTransfer={() => transfer.mutate()}
    />
  );
}

/**
 * Boutons Favori, étiquettes et Transférer, sans accès au serveur : le simulateur d'expédition de
 * l'admin affiche le même rendu, sans effet.
 */
export function NewbornActionsView({
  pokemon: p,
  transferable = true,
  tags,
  lockPending = false,
  lockError,
  onToggleLock,
  transferPending = false,
  transferError,
  onTransfer,
}: {
  pokemon: Pick<PokemonDto, 'locked' | 'busy'>;
  /** Faux pour un légendaire ou un fabuleux : pas de bouton Transférer. */
  transferable?: boolean;
  tags: ReactNode;
  lockPending?: boolean;
  lockError?: unknown;
  onToggleLock: () => void;
  transferPending?: boolean;
  transferError?: unknown;
  onTransfer: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <button
        type="button"
        className={`mt-1 rounded-full px-2 py-0.5 transition hover:bg-slate-100 dark:hover:bg-slate-800 ${
          p.locked ? 'text-amber-500' : 'text-slate-500'
        }`}
        disabled={lockPending}
        onClick={onToggleLock}
        title={p.locked ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      >
        {p.locked ? '♥ Favori' : '♡ Favori'}
      </button>
      {!!lockError && <p className="text-red-600">{errorText(lockError)}</p>}
      {tags}
      {!transferable ? null : confirming ? (
        <span className="mt-1 flex items-center gap-1">
          <button
            type="button"
            className="rounded-full bg-red-600 px-2 py-0.5 font-semibold text-white hover:bg-red-700"
            disabled={transferPending}
            onClick={onTransfer}
          >
            Confirmer
          </button>
          <button
            type="button"
            className="rounded-full px-2 py-0.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            onClick={() => setConfirming(false)}
          >
            Annuler
          </button>
        </span>
      ) : (
        <button
          type="button"
          className="mt-1 rounded-full px-2 py-0.5 text-slate-500 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-950/40"
          disabled={p.locked || p.busy}
          title={
            p.locked
              ? 'Retire-le des favoris pour pouvoir le transférer'
              : 'Transférer contre des Bonbons de lignée'
          }
          onClick={() => setConfirming(true)}
        >
          Transférer
        </button>
      )}
      {!!transferError && <p className="text-red-600">{errorText(transferError)}</p>}
    </>
  );
}
