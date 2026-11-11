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
import { applyTransfer, newInDexTracker, patchPokemon, usePokemon } from '../../lib/queries';
import { errorText, natureLabel, speciesName } from '../../lib/labels';
import { CornerTag, CrossIcon, LAUNCH_DIALOG_CLASS, ResultFrame } from './dialogParts';

const STEP = 0.5; // secondes entre deux éclosions

/** Œuf ou fossile : titre de la fenêtre et image qui tremble avant chaque Pokémon. */
const KINDS = {
  egg: {
    title: (n: number) => `${n} œuf${n > 1 ? 's' : ''} éclo${n > 1 ? 's' : ''} !`,
    cover: <Egg size={64} />,
  },
  fossil: {
    title: (n: number) => `${n} fossile${n > 1 ? 's' : ''} restauré${n > 1 ? 's' : ''} !`,
    cover: <FossilStone />,
  },
} satisfies Record<string, { title: (n: number) => string; cover: ReactNode }>;

/**
 * Largeur de la fenêtre des fossiles selon le nombre de colonnes (au plus 6) : tuiles de 9,5 rem,
 * marges et barre de défilement comprises, et au moins 36 rem pour les boutons de la barre du bas.
 */
const FOSSIL_WIDTHS = [
  '',
  'max-w-[36rem]!',
  'max-w-[36rem]!',
  'max-w-[36rem]!',
  'max-w-[43rem]!',
  'max-w-[53rem]!',
  'max-w-[63rem]!',
];

/** Grille des œufs : 6 par rangée sur ordinateur. */
const EGG_GRID = 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6';

/** Grille des fossiles : tuiles de largeur fixe, centrées, autant que la fenêtre en contient. */
const FOSSIL_GRID = 'grid-cols-2 sm:grid-cols-[repeat(auto-fit,9.5rem)] sm:justify-center';

/**
 * Éclosion animée : chaque œuf tremble, se brise, puis révèle son Pokémon. Sert aussi au Musée
 * (fossiles restaurés, `kind="fossil"`).
 */
export function HatchReveal({
  ctx,
  data,
  onClose,
  kind = 'egg',
}: {
  ctx: GameContext;
  data: HatchEggsResponse | null;
  onClose: () => void;
  kind?: keyof typeof KINDS;
}) {
  return (
    <Modal
      open={!!data}
      onClose={onClose}
      wide="xl"
      className={`${LAUNCH_DIALOG_CLASS} ${
        kind === 'fossil' && data ? FOSSIL_WIDTHS[Math.min(data.hatched.length, 6)] : ''
      }`}
    >
      {data && <HatchContent ctx={ctx} data={data} onClose={onClose} kind={kind} />}
    </Modal>
  );
}

/** Pierre fossile (animation de restauration). */
function FossilStone({ size = 64 }: { size?: number }) {
  return (
    <div
      aria-hidden
      className="relative rounded-[45%_55%_50%_50%/55%_50%_50%_45%] border border-stone-400 bg-gradient-to-br from-stone-200 to-stone-400 shadow-inner dark:border-stone-600 dark:from-stone-400 dark:to-stone-600"
      style={{ width: size, height: size * 0.82 }}
    >
      <span className="absolute inset-[22%] rounded-full border-4 border-dotted border-stone-500/60" />
    </div>
  );
}

function HatchContent({
  ctx,
  data,
  onClose,
  kind,
}: {
  ctx: GameContext;
  data: HatchEggsResponse;
  onClose: () => void;
  kind: keyof typeof KINDS;
}) {
  const { title, cover } = KINDS[kind];
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
    onSuccess: (res, ids) => {
      markTransferred(ids);
      setConfirmingAll(false);
      const gone = new Set(ids);
      return applyTransfer(
        queryClient,
        transferable.filter((p) => gone.has(p.id)),
        res.gained,
      );
    },
  });
  const allCandies = transferAll.data?.gained.reduce((sum, g) => sum + g.quantity, 0) ?? 0;
  const confirming = confirmingAll && transferable.length > 0;

  return (
    <ResultFrame
      title={title(data.hatched.length)}
      onClose={onClose}
      note={
        transferAll.error ? (
          <p className="text-red-600">{errorText(transferAll.error)}</p>
        ) : confirming ? (
          <p className="text-slate-600 dark:text-slate-300">
            Transférer {transferable.length} Pokémon (favoris exclus)
            {shinyCount > 0 && (
              <strong className="text-amber-600 dark:text-[#f8d878]">
                {' '}
                dont {shinyCount} chromatique{shinyCount > 1 ? 's' : ''}
              </strong>
            )}{' '}
            ?
          </p>
        ) : (
          transferAll.data && (
            <p className="text-slate-500 dark:text-slate-400">
              {transferAll.data.transferred} transféré{transferAll.data.transferred > 1 ? 's' : ''}{' '}
              · +{allCandies} Bonbon{allCandies > 1 ? 's' : ''}
            </p>
          )
        )
      }
      footer={
        <>
          {!instant && (
            <button className="btn-ghost mr-auto" onClick={() => setSkipped(true)}>
              Tout afficher
            </button>
          )}
          {confirming ? (
            <>
              <button className="btn-ghost" onClick={() => setConfirmingAll(false)}>
                Annuler
              </button>
              <button
                className="btn-danger"
                disabled={transferAll.isPending}
                onClick={() => transferAll.mutate(transferable.map((p) => p.id))}
              >
                Confirmer
              </button>
            </>
          ) : (
            data.hatched.length > 1 && (
              <button
                className="btn-ghost"
                disabled={transferable.length === 0 || transferAll.isPending}
                title="Transférer tous les Pokémon contre des Bonbons de lignée (favoris exclus)"
                onClick={() => setConfirmingAll(true)}
              >
                Tout transférer
              </button>
            )
          )}
          <button className="btn-primary px-6 py-3" onClick={onClose}>
            Continuer
          </button>
        </>
      }
    >
      {/* Remonté au clic sur « Tout afficher » : les animations en cours gardent sinon leur délai. */}
      <div
        key={String(instant)}
        className={`grid gap-x-2 gap-y-4 pt-1.5 ${kind === 'fossil' ? FOSSIL_GRID : EGG_GRID}`}
      >
        {data.hatched.map((p, i) => {
          const perfect = STAT_NAMES.filter((s) => p.ivs[s] === MAX_IV).length;
          const total = STAT_NAMES.reduce((sum, s) => sum + p.ivs[s], 0);
          const appear = {
            initial: instant ? false : { opacity: 0 },
            animate: { opacity: 1 },
            transition: { delay: delay(i) },
          } as const;
          return (
            <div
              key={p.id}
              className={`tile relative flex flex-col items-center px-1.5 pt-3 pb-2 text-center text-xs ${
                p.isShiny ? 'border-amber-600 bg-done dark:border-[#f8d878]' : ''
              }`}
            >
              {firstNew.has(p.id) && (
                <motion.span {...appear}>
                  <CornerTag className="bg-brand-500">Nouveau !</CornerTag>
                </motion.span>
              )}
              <span
                className={`sprite-well relative size-24 shrink-0 ${p.isShiny ? 'shiny-well' : ''}`}
              >
                {!instant && (
                  <motion.span
                    // Reste en place une fois invisible : sans ça, il intercepte les clics.
                    className="pointer-events-none absolute inset-0 grid place-items-center"
                    initial={{ opacity: 1, rotate: 0 }}
                    animate={{ rotate: [0, -12, 12, -8, 8, 0], opacity: [1, 1, 1, 1, 1, 0] }}
                    transition={{ delay: delay(i) - 0.6, duration: 0.6 }}
                  >
                    {cover}
                  </motion.span>
                )}
                <motion.span
                  className="relative"
                  initial={instant ? false : { opacity: 0, scale: 0.4 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: delay(i), type: 'spring', stiffness: 260, damping: 16 }}
                >
                  {p.isShiny && <ShinySparkles delay={delay(i)} loop />}
                  <IvHover ivs={p.ivs}>
                    <PokemonSprite
                      priority
                      speciesId={p.speciesId}
                      formId={p.formId}
                      shiny={p.isShiny}
                      size={72}
                    />
                  </IvHover>
                </motion.span>
              </span>
              <motion.div className="mt-1.5 flex w-full flex-col items-center" {...appear}>
                <span className="leading-tight font-semibold">
                  {speciesName(ctx, p.speciesId, p.formId)} <GenderSymbol gender={p.gender} />{' '}
                  {p.isShiny && <ShinyStar />}
                </span>
                <span className="text-slate-500 dark:text-slate-400">{natureLabel(p.nature)}</span>
                <span
                  className={
                    perfect >= 3
                      ? 'font-semibold text-amber-700 dark:text-[#f8d878]'
                      : 'text-slate-500 dark:text-slate-400'
                  }
                >
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
    </ResultFrame>
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
    onSuccess: (updated) => patchPokemon(queryClient, updated),
  });
  const transfer = useMutation({
    mutationFn: () =>
      api<TransferPokemonResponse>('/api/pokemon/transfer', {
        method: 'POST',
        json: { ids: [p.id] },
      }),
    onSuccess: (res) => {
      onTransferred?.();
      return applyTransfer(queryClient, [p], res.gained);
    },
  });
  if (transfer.data) {
    const candies = transfer.data.gained.reduce((sum, g) => sum + g.quantity, 0);
    return (
      <p className="mt-2 text-slate-500 dark:text-slate-400">
        Transféré · +{candies} Bonbon{candies > 1 ? 's' : ''}
      </p>
    );
  }
  if (transferred) return <p className="mt-2 text-slate-500 dark:text-slate-400">Transféré</p>;
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

/** Petit bouton sous un Pokémon d'un résultat (favori, transfert). */
const MINI_BUTTON =
  'pixel-label grid h-7 place-items-center rounded border-2 border-ink bg-white text-[8px] text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600';

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
    <div className="mt-2 flex w-full flex-col items-center">
      <div className="flex w-full flex-wrap justify-center gap-1">
        <button
          type="button"
          className={`${MINI_BUTTON} w-7 font-sans text-sm ${
            p.locked ? 'text-amber-500 dark:text-[#f8d878]' : 'text-slate-400 dark:text-slate-400'
          }`}
          disabled={lockPending}
          onClick={onToggleLock}
          title={p.locked ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          aria-label={p.locked ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          aria-pressed={p.locked}
        >
          {p.locked ? '♥' : '♡'}
        </button>
        {transferable &&
          (confirming ? (
            <>
              <button
                type="button"
                className={`${MINI_BUTTON} flex-auto border-red-700 bg-red-600 px-1.5 text-white hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700`}
                disabled={transferPending}
                onClick={onTransfer}
              >
                Confirmer
              </button>
              <button
                type="button"
                className={`${MINI_BUTTON} w-7`}
                onClick={() => setConfirming(false)}
                title="Annuler"
                aria-label="Annuler le transfert"
              >
                <CrossIcon className="size-2.5" />
              </button>
            </>
          ) : (
            <button
              type="button"
              className={`${MINI_BUTTON} flex-auto px-1.5 hover:text-red-700 dark:hover:text-red-300`}
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
          ))}
      </div>
      {!!lockError && <p className="mt-1 text-red-600">{errorText(lockError)}</p>}
      {tags}
      {!!transferError && <p className="mt-1 text-red-600">{errorText(transferError)}</p>}
    </div>
  );
}
