import { Fragment, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'motion/react';
import type { Zone } from '@poke/content';
import type { GameContext, PokemonInstance } from '@poke/game-core';
import type { ClaimExpeditionResponse, ExpeditionDto, StartExpeditionInput } from '@poke/shared';
import {
  GenderSymbol,
  IvHover,
  Modal,
  PokemonSprite,
  ShinySparkles,
  ShinyStar,
} from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import {
  refreshAfterExpeditionStart,
  newInDexTracker,
  useInventory,
  usePokemon,
  utcOffsetMinutes,
} from '../../lib/game';
import { GAME_ERRORS, candyName, itemIcon, itemName, speciesName } from '../../lib/labels';
import { Notice, StateTag } from './BuildingParts';
import {
  CornerTag,
  CrossIcon,
  InfoCell,
  LAUNCH_DIALOG_CLASS,
  ResultFrame,
  SECTION_TITLE,
  SheetSection,
} from './dialogParts';
import { NewbornActions } from './HatchReveal';
import { BANNER_LABEL, CHECKER, TINTED_BANNER, zoneSpecies, zoneTint } from './zoneBanner';

// Secondes entre deux rencontres : on accélère quand il y en a beaucoup, pour que
// l'apparition dure au plus ~REVEAL_BUDGET secondes (sans descendre sous MIN_STEP).
const MAX_STEP = 0.45;
const MIN_STEP = 0.06;
const REVEAL_BUDGET = 6;

function revealStep(count: number): number {
  return Math.max(MIN_STEP, Math.min(MAX_STEP, REVEAL_BUDGET / Math.max(1, count)));
}

/** Issue d'une rencontre : étiquette sous le Pokémon. */
const OUTCOMES = {
  captured: { text: 'Capturé !', tone: 'ok' },
  escaped: { text: 'Échappé…', tone: 'bad' },
  noBall: { text: 'Observé', tone: 'idle' },
  ignored: { text: 'Ignoré', tone: 'idle' },
  fled: { text: 'Fuite', tone: 'idle' },
} as const;

/** Ouverture animée du résultat d'une expédition : rencontres une à une, puis butin et XP. */
export function LootReveal({
  ctx,
  data,
  onClose,
}: {
  ctx: GameContext;
  data: ClaimExpeditionResponse | null;
  onClose: () => void;
}) {
  return (
    <Modal open={!!data} onClose={onClose} wide className={`${LAUNCH_DIALOG_CLASS} max-w-[56rem]!`}>
      {data && <RevealContent key={data.expedition.id} ctx={ctx} data={data} onClose={onClose} />}
    </Modal>
  );
}

function RevealContent({
  ctx,
  data,
  onClose,
}: {
  ctx: GameContext;
  data: ClaimExpeditionResponse;
  onClose: () => void;
}) {
  const pokemon = usePokemon();
  const pokemonById = new Map(pokemon.data?.map((p) => [p.id, p]));
  const capturedById = new Map(data.captured.map((p) => [p.id, p]));
  const queryClient = useQueryClient();
  const { berryItemId, berries, encounterBerryItemId, encounterBerries, zoneId } = data.expedition;
  // Pas de relance d'une expédition qui a emporté un fuyard : il faut le traquer à nouveau.
  const canRelaunch = !!zoneId && data.expedition.roamerQuestIds.length === 0;
  // Relance : repartir dans la même zone avec les mêmes réglages (équipe, Balls, baies), pour
  // enchaîner les maillons. Le serveur plafonne les baies au stock restant.
  const relaunch = useMutation({
    mutationFn: (e: ExpeditionDto) => {
      const input: StartExpeditionInput = {
        zoneId: e.zoneId!,
        team: e.team,
        // Ancienne expédition : sa Ball pour toutes les catégories.
        balls: e.ballPlan ?? { new: e.ballItemId, shiny: e.ballItemId, caught: e.ballItemId },
        berryItemId: e.berryItemId,
        ...(e.berryItemId ? { berryCount: e.berries } : {}),
        encounterBerryItemId: e.encounterBerryItemId,
        ...(e.encounterBerryItemId ? { encounterBerryCount: e.encounterBerries } : {}),
        autoTransfer: e.autoTransfer,
      };
      return api<ExpeditionDto>('/api/expeditions', {
        method: 'POST',
        json: { ...input, utcOffsetMinutes: utcOffsetMinutes() },
      });
    },
    onSuccess: () => {
      onClose();
      return refreshAfterExpeditionStart(queryClient);
    },
  });
  // Stock rafraîchi après la récupération (baies non utilisées rendues) : on attend la fin du
  // rechargement pour ne pas avertir à tort. Les Balls ne sont pas réservées au départ.
  const inventory = useInventory();
  const shortage = (itemId: string | null, needed: number) => {
    if (!itemId || needed === 0 || !inventory.data || inventory.isFetching) return null;
    const owned = inventory.data.find((i) => i.itemId === itemId)?.quantity ?? 0;
    return owned < needed ? { itemId, owned, needed } : null;
  };
  const shortages = [
    shortage(berryItemId, berries),
    shortage(encounterBerryItemId, encounterBerries),
  ].flatMap((s) => s ?? []);

  return (
    <ExpeditionRevealView
      ctx={ctx}
      expedition={data.expedition}
      pokemon={(id) => pokemonById.get(id) ?? capturedById.get(id)}
      renderNewborn={(id) => {
        const p = pokemonById.get(id) ?? capturedById.get(id);
        return capturedById.has(id) && p && <NewbornActions ctx={ctx} pokemon={p} />;
      }}
      onClose={onClose}
      note={
        (relaunch.error || (canRelaunch && shortages.length > 0)) && (
          <div className="space-y-1">
            {canRelaunch &&
              shortages.map(({ itemId, owned, needed }) => (
                <p key={itemId} className="text-amber-700 dark:text-[#f8d878]">
                  Stock de {itemName(ctx, itemId)} insuffisant pour relancer à l’identique :{' '}
                  {owned === 0
                    ? 'il n’en reste aucune, l’expédition partirait sans.'
                    : `${owned} / ${needed} seraient emportées.`}
                </p>
              ))}
            {relaunch.error && (
              <p className="text-red-600 dark:text-red-400">
                Relance impossible :{' '}
                {relaunch.error instanceof ApiError
                  ? (GAME_ERRORS[relaunch.error.code] ?? relaunch.error.code)
                  : 'erreur inconnue'}
              </p>
            )}
          </div>
        )
      }
      footer={
        <>
          {canRelaunch && (
            <button
              className="btn-ghost"
              disabled={relaunch.isPending}
              onClick={() => relaunch.mutate(data.expedition)}
              title="Repartir avec la même équipe, les mêmes Balls, baies et le même transfert automatique"
            >
              {relaunch.isPending
                ? 'Relance…'
                : shortages.length > 0
                  ? '↻ Relancer quand même'
                  : '↻ Relancer'}
            </button>
          )}
          <button className="btn-primary px-6 py-3" onClick={onClose}>
            Continuer
          </button>
        </>
      }
    />
  );
}

/** Pokémon affiché dans le résultat : membre de l'équipe ou Pokémon capturé. */
export type RevealPokemon = Pick<
  PokemonInstance,
  'speciesId' | 'formId' | 'isShiny' | 'gender' | 'ivs'
>;

/** Bandeau du retour : celui de la zone (image ou teinte du type dominant), comme au départ. */
function ReturnBanner({
  ctx,
  zone,
  onClose,
}: {
  ctx: GameContext;
  zone: Zone;
  onClose: () => void;
}) {
  return (
    <header className="relative flex min-h-[4.5rem] shrink-0 flex-wrap items-center gap-2 border-b-[3px] border-ink px-3 py-3 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:px-4">
      {zone.image ? (
        <img
          src={zone.image}
          alt=""
          className="absolute inset-0 h-full w-full object-cover dark:brightness-75"
        />
      ) : (
        <span
          aria-hidden
          className={`absolute inset-0 ${TINTED_BANNER}`}
          style={{ '--tint': zoneTint(zoneSpecies(ctx, zone)), ...CHECKER } as CSSProperties}
        />
      )}
      <div className="relative">
        <span className={`inline-block whitespace-nowrap ${BANNER_LABEL}`}>De retour !</span>
      </div>
      {/* z-10 : placé en tête par `order-first`, le nom serait peint sous le fond du bandeau. */}
      <h2 className="relative z-10 order-first max-w-full rounded border-2 border-ink bg-win px-3 py-1.5 text-center font-pixel text-xs leading-normal sm:order-none">
        {zone.name}
      </h2>
      <div className="relative ml-auto flex justify-end sm:ml-0">
        <button
          type="button"
          className="btn-ghost px-2.5 py-2"
          aria-label="Fermer"
          onClick={onClose}
        >
          <CrossIcon />
        </button>
      </div>
    </header>
  );
}

/** Case « Balls » du résumé : chaque Ball lancée et son nombre, puis les baies utilisées. */
function BallsCell({
  ctx,
  result,
  berriesUsed,
}: {
  ctx: GameContext;
  result: NonNullable<ExpeditionDto['result']>;
  berriesUsed: number;
}) {
  const counts = new Map<string, number>();
  for (const e of result.encounters) {
    if (e.ballItemId) counts.set(e.ballItemId, (counts.get(e.ballItemId) ?? 0) + 1);
  }
  return (
    <div className="card min-w-0 px-2.5 py-1.5">
      <dt className="pixel-label text-[8px] text-slate-500 uppercase">Balls</dt>
      {counts.size === 0 ? (
        <dd className="font-semibold">{result.ballsUsed}</dd>
      ) : (
        <dd className="flex flex-wrap justify-center gap-x-2.5 gap-y-0.5">
          {[...counts].map(([itemId, n]) => (
            <span
              key={itemId}
              className="inline-flex items-center gap-0.5 font-semibold"
              title={itemName(ctx, itemId)}
            >
              <img src={itemIcon(ctx, itemId)} alt={itemName(ctx, itemId)} className="h-6 w-6" />×{' '}
              {n}
            </span>
          ))}
        </dd>
      )}
      {berriesUsed > 0 && (
        <dd className="truncate text-xs text-slate-500">
          {berriesUsed} baie{berriesUsed > 1 ? 's' : ''}
        </dd>
      )}
    </div>
  );
}

/**
 * Résultat d'une expédition, rencontres une à une puis butin et XP. Sans accès aux données du
 * joueur : le jeu et le simulateur de l'admin le partagent. À poser dans un `Modal` aux classes
 * `LAUNCH_DIALOG_CLASS` : bandeau en haut, boutons (`footer`) dans la barre du bas.
 */
export function ExpeditionRevealView({
  ctx,
  expedition,
  pokemon,
  renderNewborn,
  onClose,
  note,
  footer,
}: {
  ctx: GameContext;
  expedition: Pick<ExpeditionDto, 'zoneId' | 'questId' | 'result'>;
  /** Pokémon par identifiant (équipe, captures). */
  pokemon: (id: string) => RevealPokemon | undefined;
  /** Actions sous un Pokémon capturé (surnom, étiquettes…). */
  renderNewborn?: (pokemonId: string) => ReactNode;
  onClose: () => void;
  /** Message au-dessus des boutons (stock insuffisant, erreur). */
  note?: ReactNode;
  /** Boutons de la barre du bas, après « Tout afficher ». */
  footer: ReactNode;
}) {
  const reduced = useReducedMotion();
  const [skipped, setSkipped] = useState(false);
  const instant = reduced || skipped;
  // « Tout afficher » mène directement en bas du récap (butin, XP).
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (skipped) bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [skipped]);
  const result = expedition.result!;
  const { zoneId, questId } = expedition;
  const zone = zoneId ? ctx.zone(zoneId) : undefined;
  const place = zone?.name ?? (questId && ctx.quest(questId)?.name);
  // Captures transférées automatiquement : pas affichées une à une, résumées sous la grille.
  const encounters = result.encounters.filter((e) => !e.transferred);
  const transferred = result.autoTransferred;
  // Échappés déjà au Pokédex (ni chromatiques ni fuyards) : pas affichés non plus, résumés en
  // une ligne.
  const escapedCount = encounters.filter((e) => e.filtered).length;
  // Observés sans Ball et ignorés : comptés dans les rencontres, pas affichés.
  const shown = encounters.filter(
    (e) => !e.filtered && e.outcome !== 'noBall' && e.outcome !== 'ignored',
  );
  // Captures gardées et transférées automatiquement.
  const captured = result.encounters.filter((e) => e.outcome === 'captured').length;
  const shinies = shown.filter((e) => e.isShiny).length;
  const firstShiny = shown.findIndex((e) => e.isShiny);
  // « Nouveau ! » sur la première capture de chaque nouvelle espèce ou forme seulement.
  const isFirstNew = newInDexTracker(result);
  const firstNew = new Set<number>();
  shown.forEach((e, i) => {
    if (e.outcome === 'captured' && isFirstNew(e)) firstNew.add(i);
  });
  const step = revealStep(shown.length);
  const delay = (i: number) => (instant ? 0 : 0.3 + i * step);
  const after = delay(shown.length);
  const berriesUsed = result.berriesUsed + (result.encounterBerriesUsed ?? 0);
  const fadeIn = {
    initial: instant ? false : { opacity: 0 },
    animate: { opacity: 1 },
    transition: { delay: after },
  } as const;

  return (
    <ResultFrame
      title={`Retour de ${place || 'l’expédition'}`}
      header={zone && <ReturnBanner ctx={ctx} zone={zone} onClose={onClose} />}
      onClose={onClose}
      note={note}
      footer={
        <>
          {!instant && (
            <button className="btn-ghost mr-auto" onClick={() => setSkipped(true)}>
              Tout afficher
            </button>
          )}
          {footer}
        </>
      }
    >
      <dl className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
        <InfoCell label="Rencontres" value={String(result.encounters.length)} />
        <InfoCell label="Captures" value={String(captured)} />
        <BallsCell ctx={ctx} result={result} berriesUsed={berriesUsed} />
        <InfoCell label="Transférés" value={String(transferred?.count ?? 0)} />
      </dl>

      {/* Remonté au clic sur « Tout afficher » : les animations en cours gardent sinon leur délai. */}
      <Fragment key={String(instant)}>
        {shinies > 0 && (
          <motion.p
            className="card shiny-card bg-done px-3 py-2.5 text-center font-pixel text-[10px] leading-normal text-amber-800 uppercase sm:text-xs dark:text-[#f8d878]"
            initial={instant ? false : { opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: [0.8, 1.08, 1] }}
            transition={{ delay: delay(firstShiny) + 0.2, duration: 0.5 }}
          >
            ✨ {shinies > 1 ? `${shinies} Pokémon chromatiques !` : 'Un Pokémon chromatique !'} ✨
          </motion.p>
        )}

        {/* Anciennes expéditions légendaires (historique). */}
        {questId && encounters[0] && (
          <motion.div {...fadeIn}>
            <Notice tone={captured > 0 ? 'ok' : 'bad'}>
              {captured > 0
                ? `${speciesName(ctx, encounters[0].speciesId, encounters[0].formId)} a été capturé !`
                : encounters[0].outcome === 'fled'
                  ? 'Tu as pris la fuite.'
                  : `${speciesName(ctx, encounters[0].speciesId, encounters[0].formId)} s’est enfui…`}
            </Notice>
          </motion.div>
        )}

        {shown.length > 0 && (
          <SheetSection title="Tableau de chasse">
            <div className="grid grid-cols-2 gap-x-2 gap-y-4 pt-1.5 sm:grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))]">
              {shown.map((e, i) => {
                const captive = (e.pokemonId ? pokemon(e.pokemonId) : undefined) ?? e.pokemon;
                const outcome = OUTCOMES[e.outcome];
                return (
                  <motion.div
                    key={i}
                    className={`tile relative flex flex-col items-center px-1.5 pt-3 pb-2 text-center text-xs ${
                      e.isShiny ? 'border-amber-600 bg-done dark:border-[#f8d878]' : ''
                    }`}
                    initial={instant ? false : { opacity: 0, scale: 0.6, rotate: -8 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    transition={{ delay: delay(i), type: 'spring', stiffness: 260, damping: 18 }}
                  >
                    {firstNew.has(i) ? (
                      <CornerTag className="bg-brand-500">Nouveau !</CornerTag>
                    ) : e.questId ? (
                      <CornerTag className="bg-amber-600">Fuyard !</CornerTag>
                    ) : (
                      e.special && <CornerTag className="bg-violet-600">Spécial !</CornerTag>
                    )}
                    <motion.span
                      initial={instant ? false : { y: -6 }}
                      animate={
                        e.isShiny && !instant
                          ? { y: 0, filter: ['brightness(1)', 'brightness(1.8)', 'brightness(1)'] }
                          : { y: 0 }
                      }
                      transition={{ delay: delay(i) + 0.15, duration: 0.6 }}
                      className={`sprite-well relative size-[4.5rem] shrink-0 ${e.isShiny ? 'shiny-well' : ''}`}
                    >
                      {e.isShiny && <ShinySparkles delay={delay(i) + 0.15} loop />}
                      <IvHover ivs={captive?.ivs}>
                        <PokemonSprite
                          speciesId={e.speciesId}
                          formId={e.formId}
                          shiny={e.isShiny}
                          size={64}
                        />
                      </IvHover>
                    </motion.span>
                    <span className="mt-1.5 leading-tight font-semibold">
                      {speciesName(ctx, e.speciesId, e.formId)}{' '}
                      {captive && <GenderSymbol gender={captive.gender} />}{' '}
                      {e.isShiny && <ShinyStar />}
                    </span>
                    <span className="mb-1 text-slate-500 dark:text-slate-400">N.{e.level}</span>
                    <StateTag tone={outcome.tone}>{outcome.text}</StateTag>
                    {e.pokemonId && renderNewborn?.(e.pokemonId)}
                  </motion.div>
                );
              })}
            </div>
          </SheetSection>
        )}

        {escapedCount > 0 && (
          <motion.div {...fadeIn}>
            <Notice tone="bad">
              {escapedCount} Pokémon se {escapedCount > 1 ? 'sont échappés' : 'est échappé'}
            </Notice>
          </motion.div>
        )}

        {/* Bonbons des captures transférées automatiquement. */}
        {transferred && transferred.candies.length > 0 && (
          <motion.div {...fadeIn}>
            <Notice tone="ok">
              {transferred.candies
                .map((c) => `+${c.quantity} × ${candyName(ctx, c.lineageId)}`)
                .join(', ')}
            </Notice>
          </motion.div>
        )}

        {result.questItems && result.questItems.length > 0 && (
          <motion.section
            className="card shiny-card bg-done p-3"
            initial={instant ? false : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: after, type: 'spring' }}
          >
            <h3 className={`${SECTION_TITLE} text-amber-800 dark:text-[#f8d878]`}>
              Objet de quête trouvé !
            </h3>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {result.questItems.map((q) => (
                <li key={q.itemId} className="flex items-center gap-1.5">
                  <img src={itemIcon(ctx, q.itemId)} alt="" className="h-7 w-7" />
                  {itemName(ctx, q.itemId)} <span className="font-semibold">× {q.quantity}</span>
                </li>
              ))}
            </ul>
          </motion.section>
        )}

        <motion.div
          initial={instant ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: after }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <SheetSection title="Butin">
            {result.loot.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Rien cette fois-ci.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {result.loot.map((l, i) => (
                  <motion.li
                    key={l.itemId}
                    className="flex items-center gap-2"
                    initial={instant ? false : { opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: after + 0.1 * (i + 1) }}
                  >
                    <img src={itemIcon(ctx, l.itemId)} alt="" className="h-7 w-7" />
                    {itemName(ctx, l.itemId)}
                    <span className="font-semibold">× {l.quantity}</span>
                  </motion.li>
                ))}
              </ul>
            )}
          </SheetSection>
          <SheetSection title="Équipe">
            <ul className="space-y-1 text-sm">
              {result.team.map((m) => {
                const p = pokemon(m.id);
                return (
                  p && (
                    <li key={m.id} className="flex items-center gap-2">
                      <span className="sprite-well size-9 shrink-0">
                        <PokemonSprite
                          speciesId={p.speciesId}
                          formId={p.formId}
                          shiny={p.isShiny}
                          size={32}
                        />
                      </span>
                      <span className="flex-1 truncate">
                        {speciesName(ctx, p.speciesId, p.formId)} {p.isShiny && <ShinyStar />}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400">+{m.xpGained} XP</span>
                      {m.levelAfter > m.levelBefore && (
                        <motion.span
                          initial={instant ? false : { scale: 0 }}
                          animate={{ scale: [0, 1.3, 1] }}
                          transition={{ delay: after + 0.3 }}
                        >
                          <StateTag tone="ok">N.{m.levelAfter} !</StateTag>
                        </motion.span>
                      )}
                    </li>
                  )
                );
              })}
            </ul>
          </SheetSection>
        </motion.div>
      </Fragment>
      <div ref={bottom} />
    </ResultFrame>
  );
}
