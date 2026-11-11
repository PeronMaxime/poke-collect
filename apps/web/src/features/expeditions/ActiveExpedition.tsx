/**
 * Case d'une expédition en cours : zone, temps écoulé, compte à rebours, et son résumé au survol.
 */
import { Fragment } from 'react';
import {
  IV_BALL_CATEGORIES,
  WEATHER_LABELS,
  abilityMultiplier,
  planAfter,
  resolveWeather,
  shinyProbability,
} from '@poke/game-core';
import type { AbilityEnv, GameContext } from '@poke/game-core';
import type { ExpeditionDto, PokemonDto } from '@poke/shared';
import { CancelButton, PokemonSprite, ShinyStar } from '../../components/ui';
import { useShinyBonus } from '../../lib/queries';
import {
  formatCountdown,
  formatDuration,
  formatShinyRate,
  itemIcon,
  itemName,
  speciesName,
} from '../../lib/labels';
import { ActiveAbilities } from './ActiveAbilities';
import { ExpeditionTrail } from './ExpeditionTrail';
import { autoTransferLabel } from './AutoTransferSettings';
import { roamerName } from './RoamerSightingNotice';
import { WEATHER_ICONS } from '../common/WeatherIcon';

/**
 * Expédition en cours : ce qui s'est passé jusqu'ici, puis « Annuler » avant la durée minimale,
 * « Arrêter et récupérer » ensuite, « Récupérer » une fois revenue d'elle-même.
 */
export function ActiveExpedition({
  ctx,
  expedition,
  serverNow,
  teamSpecies,
  team,
  abilityEnv,
  charm,
  claiming,
  onClaim,
  cancelling,
  onCancel,
}: {
  ctx: GameContext;
  expedition: ExpeditionDto;
  serverNow: number;
  teamSpecies: (PokemonDto | undefined)[];
  /** Membres de l'équipe encore au PC, dans l'ordre (ceux de `abilityEnv`). */
  team: PokemonDto[];
  abilityEnv: AbilityEnv | undefined;
  /** Multiplicateur du Charme Chroma (compté au retour). */
  charm: number;
  claiming: boolean;
  onClaim: () => void;
  cancelling: boolean;
  onCancel: () => void;
}) {
  const start = Date.parse(expedition.startedAt);
  const minEnd = Date.parse(expedition.minEndsAt);
  const end = Date.parse(expedition.endsAt);
  const done = serverNow >= end;
  const stoppable = serverNow >= minEnd;
  const zone = expedition.zoneId ? ctx.zone(expedition.zoneId) : undefined;
  const quest = expedition.questId ? ctx.quest(expedition.questId) : undefined;
  // Compté au rythme calculé par le serveur (contenu, équipe et météo du départ) : exact.
  const elapsedMinutes = (Math.min(serverNow, end) - start) / 60_000;
  const sofar = expedition.pace ? planAfter(expedition.pace, Math.max(0, elapsedMinutes)) : null;
  // Fuyards pas encore croisés : ceux déjà rencontrés ont leur propre ligne.
  const tracked = expedition.roamerQuestIds.filter((id) => !expedition.roamersMet.includes(id));
  return (
    <div className={`tile group/exp relative p-3.5 ${done ? 'bg-done' : ''}`} tabIndex={0}>
      <ExpeditionSummary
        ctx={ctx}
        expedition={expedition}
        team={team}
        abilityEnv={abilityEnv}
        charm={charm}
      />
      <div className="min-w-0">
        {expedition.questId && (
          <p className="text-xs font-medium text-amber-600">✦ Ancienne expédition légendaire</p>
        )}
        {tracked.length > 0 && (
          <p className="text-xs font-medium text-amber-600">
            ✦ Sur la piste de {tracked.map((id) => roamerName(ctx, id)).join(' et ')}
          </p>
        )}
        {expedition.roamersMet.map((id) => (
          <p key={id} className="text-xs font-semibold text-amber-600">
            ✦ {roamerName(ctx, id)} a été rencontré !
          </p>
        ))}
        <p className="text-lg leading-tight font-bold">
          {zone?.name ?? quest?.name ?? expedition.zoneId ?? expedition.questId}
        </p>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {formatDuration(Math.floor(elapsedMinutes))} écoulées
          {expedition.shinyChain > 0 && (
            <span className="ml-1 text-amber-600 dark:text-amber-400">
              · ✦ chaîne {expedition.shinyChain}
            </span>
          )}
          {expedition.captureFilter && ' · captures filtrées'}
        </p>
      </div>
      <ExpeditionTrail
        habitat={zone?.habitat}
        team={teamSpecies.filter((p) => p !== undefined)}
        done={done}
      />
      {sofar && (
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
          {sofar.encounters} rencontre{sofar.encounters > 1 ? 's' : ''} · {sofar.lootRolls} tirage
          {sofar.lootRolls > 1 ? 's' : ''} de butin
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className={`text-sm ${done ? 'font-bold' : 'text-slate-500 dark:text-slate-400'}`}>
          {done ? (
            'Terminée !'
          ) : stoppable ? (
            <>
              Retour de lui-même dans{' '}
              <span className="font-mono">{formatCountdown(end - serverNow)}</span>
            </>
          ) : (
            <>
              Arrêt possible dans{' '}
              <span className="font-mono">{formatCountdown(minEnd - serverNow)}</span>
            </>
          )}
        </span>
        {stoppable ? (
          <button className="btn-primary" disabled={claiming} onClick={onClaim}>
            {claiming ? 'Ouverture…' : done ? 'Récupérer' : 'Arrêter et récupérer'}
          </button>
        ) : (
          <CancelButton label="Annuler l’expédition" pending={cancelling} onConfirm={onCancel} />
        )}
      </div>
    </div>
  );
}

const SHINY_FILTER_LABELS = {
  any: null,
  always: 'chromatiques toujours tentés',
  only: 'chromatiques uniquement',
} as const;

/** Image d'un objet (Ball, baie), avec sa quantité et son nom si demandés ; nom complet au survol. */
function ItemChip({
  ctx,
  itemId,
  quantity,
  showName = false,
}: {
  ctx: GameContext;
  itemId: string;
  quantity?: number;
  showName?: boolean;
}) {
  const name = itemName(ctx, itemId);
  return (
    <span className="inline-flex items-center gap-0.5 whitespace-nowrap" title={name}>
      <img
        src={itemIcon(ctx, itemId)}
        alt={name}
        className="size-6 shrink-0 [image-rendering:pixelated]"
      />
      {quantity !== undefined && <span className="font-semibold">×{quantity}</span>}
      {showName && <span>{name}</span>}
    </span>
  );
}

const NONE = <span className="text-slate-400 dark:text-slate-500">aucune</span>;

/** Titre d'une ligne du résumé. */
const label = (text: string) => <dt className="text-slate-500">{text}</dt>;

/** Trait entre deux blocs du résumé. */
const divider = (
  <div className="col-span-2 my-1 border-t border-dashed border-slate-300 dark:border-slate-600" />
);

/**
 * Résumé d'une expédition en cours, au survol, en trois blocs : durée, météo et taux
 * chromatique ; Balls et baies (en images) ; règles de capture, transfert auto et talents.
 */
function ExpeditionSummary({
  ctx,
  expedition: e,
  team,
  abilityEnv,
  charm,
}: {
  ctx: GameContext;
  expedition: ExpeditionDto;
  team: PokemonDto[];
  abilityEnv: AbilityEnv | undefined;
  charm: number;
}) {
  const shinyBonus = useShinyBonus();
  const filter = e.captureFilter;
  const time = (iso: string) =>
    new Date(iso).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  // Météo figée au départ (talents compris) : celle de la zone a pu changer depuis.
  const weather = e.zoneId && abilityEnv ? (resolveWeather(ctx, abilityEnv) ?? 'clear') : null;
  // Comme au serveur : chaîne du départ, Charme Chroma et bonus permanent au retour et, hors
  // expédition légendaire, talents de l'équipe.
  const shinyRate = Math.min(
    1,
    shinyProbability(ctx, { chain: e.shinyChain, charm, bonus: shinyBonus }) *
      (abilityEnv && !e.questId ? abilityMultiplier(ctx, abilityEnv, 'shinyChance') : 1),
  );
  const plan = e.ballPlan;
  return (
    <div className="invisible absolute top-full left-0 z-30 mt-1 w-full min-w-[min(16rem,calc(100vw-2rem))] rounded-md border-2 border-ink bg-win p-3 text-xs opacity-0 shadow-xl transition-opacity group-focus-within/exp:visible group-focus-within/exp:opacity-100 group-hover/exp:visible group-hover/exp:opacity-100">
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1">
        {/* Durée, météo, taux chromatique. */}
        {label(e.minEndsAt === e.endsAt ? 'Retour' : 'Arrêt possible')}
        <dd>{time(e.minEndsAt)}</dd>
        {e.minEndsAt !== e.endsAt && (
          <>
            {label('Au plus tard')}
            <dd>{time(e.endsAt)}</dd>
          </>
        )}
        {weather && (
          <>
            {label('Météo')}
            <dd className="flex items-center gap-1" title="Météo au départ de l’expédition">
              <span aria-hidden className="text-base leading-none">
                {WEATHER_ICONS[weather]}
              </span>
              {WEATHER_LABELS[weather]}
            </dd>
          </>
        )}
        {label('Chromatique')}
        <dd className="flex items-center gap-1">
          <ShinyStar /> {formatShinyRate(shinyRate)}
        </dd>

        {divider}
        <SummaryItems ctx={ctx} expedition={e} />

        {(!plan || e.zoneId) && divider}
        {/* Règles de capture et transfert. */}
        {!plan && <SummaryCaptures ctx={ctx} filter={filter} />}
        {e.zoneId && (
          <>
            {label('Transfert auto')}
            <dd>{autoTransferLabel(e.autoTransfer)}</dd>
          </>
        )}
        {/* Talents : toute la largeur, titre centré au-dessus. */}
        {abilityEnv && (
          <>
            {divider}
            <dt className="col-span-2 text-center text-slate-500">Talents</dt>
            <dd className="col-span-2">
              <ActiveAbilities ctx={ctx} env={abilityEnv} members={team} empty="aucun actif" />
            </dd>
          </>
        )}
      </dl>
    </div>
  );
}

/** Balls et baies du résumé : Ball de chaque catégorie, Balls lancées, baies emportées. */
function SummaryItems({ ctx, expedition: e }: { ctx: GameContext; expedition: ExpeditionDto }) {
  const plan = e.ballPlan;
  const planRows: [string, string | null][] = plan
    ? [
        ['Nouveau', plan.new],
        ['Shiny', plan.shiny],
        ['Déjà capturé', plan.caught],
        ...IV_BALL_CATEGORIES.flatMap((category, i): [string, string | null][] =>
          plan[category] !== undefined
            ? [[`Déjà capturé, ${i + 1} IV parfait${i > 0 ? 's' : ''}`, plan[category] ?? null]]
            : [],
        ),
      ]
    : [];
  const berries = [
    e.berryItemId && { itemId: e.berryItemId, quantity: e.berries },
    e.encounterBerryItemId && { itemId: e.encounterBerryItemId, quantity: e.encounterBerries },
  ].filter((b): b is { itemId: string; quantity: number } => !!b);
  return (
    <>
      {plan ? (
        <>
          {planRows.map(([text, itemId]) => (
            <Fragment key={text}>
              {label(text)}
              <dd>{itemId ? <ItemChip ctx={ctx} itemId={itemId} showName /> : NONE}</dd>
            </Fragment>
          ))}
          {label('Balls lancées')}
          <dd className="flex flex-wrap gap-x-2">
            {e.ballsUsed.length > 0
              ? e.ballsUsed.map((b) => (
                  <ItemChip key={b.itemId} ctx={ctx} itemId={b.itemId} quantity={b.quantity} />
                ))
              : NONE}
          </dd>
        </>
      ) : (
        <>
          {label('Balls')}
          <dd>
            {e.ballItemId ? (
              <ItemChip ctx={ctx} itemId={e.ballItemId} quantity={e.balls} showName />
            ) : (
              <span className="text-slate-400 dark:text-slate-500">aucune (observation)</span>
            )}
          </dd>
        </>
      )}
      {label('Baies')}
      <dd className="flex flex-col gap-0.5">
        {berries.length > 0
          ? berries.map((b) => (
              <ItemChip key={b.itemId} ctx={ctx} itemId={b.itemId} quantity={b.quantity} showName />
            ))
          : NONE}
      </dd>
    </>
  );
}

/** Règles de capture des anciennes expéditions (sans Ball par catégorie). */
function SummaryCaptures({
  ctx,
  filter,
}: {
  ctx: GameContext;
  filter: ExpeditionDto['captureFilter'];
}) {
  const filters = filter
    ? [
        filter.newOnly && 'absents du Pokédex',
        filter.minPerfectIvs > 0 &&
          `au moins ${filter.minPerfectIvs} IV parfait${filter.minPerfectIvs > 1 ? 's' : ''}`,
        SHINY_FILTER_LABELS[filter.shiny],
      ].filter((f): f is string => !!f)
    : [];
  return (
    <>
      {label('Captures')}
      <dd>
        {filter && filter.speciesIds.length > 0 && (
          <span className="mb-0.5 flex flex-wrap gap-0.5">
            {filter.speciesIds.map((id) => (
              <PokemonSprite key={id} speciesId={id} size={32} alt={speciesName(ctx, id)} />
            ))}
          </span>
        )}
        {filters.length > 0
          ? filters.join(' · ')
          : !filter?.speciesIds.length && 'tous les Pokémon rencontrés'}
      </dd>
    </>
  );
}
