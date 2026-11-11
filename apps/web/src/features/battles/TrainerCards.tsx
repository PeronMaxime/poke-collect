/**
 * Tuiles des dresseurs : boîte à badges, dresseur ordinaire, et dresseur mis en avant (Champion, Conseil 4, Maître).
 */
import type { Trainer } from '@poke/content';
import { trainerName } from '../../lib/labels';
import { SECTION_TITLE } from '../common/dialogParts';
import { BANNER_LABEL } from '../common/zoneBanner';
import type { LeagueRank } from './trainerLists';
import {
  BadgeIcon,
  TrainerAction,
  TrainerBackdrop,
  TrainerFacts,
  TrainerRewards,
  TrainerRules,
  TrainerSprite,
  TrainerTeam,
  TrainerWeather,
  unlockText,
} from './trainerParts';
import type { TrainerCardProps } from './trainerParts';

/** Ancre de la tuile d'un Champion, pour y descendre depuis la boîte à badges. */
const trainerAnchor = (trainerId: string) => `trainer-${trainerId}`;

/**
 * Boîte à badges de la région : une case par badge, en couleur une fois gagné, grisé sinon. Un clic
 * descend jusqu'au Champion ; ceux qui ne sont pas encore découverts restent une case « ? ».
 */
export function BadgeCase({
  gyms,
  revealed,
  won,
}: {
  gyms: Trainer[];
  revealed: Set<string>;
  won: (trainer: Trainer) => boolean;
}) {
  const count = gyms.filter(won).length;
  return (
    <div className="tile flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
      <p className="flex shrink-0 items-center gap-2">
        <span className={SECTION_TITLE}>Badges</span>
        <span className="count-badge">
          {count} / {gyms.length}
        </span>
      </p>
      <ul className="grid w-full grid-cols-4 gap-1.5 sm:flex sm:w-auto sm:flex-wrap">
        {gyms.map((trainer) => {
          const badge = trainer.badge!;
          if (!revealed.has(trainer.id)) {
            return (
              <li key={trainer.id}>
                <span
                  title="Badge à découvrir"
                  className="sprite-well h-12 w-full border-dashed sm:size-10 font-pixel text-[10px] text-slate-400 dark:text-slate-500"
                >
                  ?
                </span>
              </li>
            );
          }
          const got = won(trainer);
          return (
            <li key={trainer.id}>
              <button
                type="button"
                title={`${badge.name} · ${trainerName(trainer)}${got ? ' (obtenu)' : ''}`}
                aria-label={`${badge.name}, ${got ? 'obtenu' : 'pas encore obtenu'}`}
                className={`sprite-well h-12 w-full transition sm:size-10 hover:-translate-y-0.5 ${
                  got ? 'shiny-well' : ''
                }`}
                onClick={() =>
                  document
                    .getElementById(trainerAnchor(trainer.id))
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
              >
                <BadgeIcon badge={badge} size={30} className={got ? '' : 'opacity-35 grayscale'} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Ligne du bas d'une tuile : gains à gauche, « Défier » (ou ce qui l'en empêche) à droite. */
const TILE_FOOTER =
  'mt-auto flex flex-wrap items-center justify-between gap-2 border-t-2 border-well-line px-3 py-2';

/** Tuile d'un dresseur ordinaire : bandeau, informations, équipe, puis gains et « Défier ». */
export function TrainerCard(props: TrainerCardProps) {
  const { ctx, trainer, status } = props;
  const locked = status.state === 'locked';
  const done = status.state === 'defeated';
  return (
    <div className={`tile flex flex-col overflow-hidden ${locked ? 'opacity-60' : ''}`}>
      {/* Bandeau : le dresseur sur le décor de sa zone, son nom et la météo. */}
      <div className="relative flex items-center gap-2 border-b-[3px] border-ink px-2.5 py-1.5">
        <TrainerBackdrop ctx={ctx} trainer={trainer} />
        <span className="relative shrink-0">
          <TrainerSprite trainer={trainer} size={64} />
        </span>
        <div className="relative flex min-w-0 flex-1 flex-col items-start gap-1">
          <span className="pixel-label max-w-full truncate rounded border-2 border-ink bg-win px-1.5 text-[8px] text-slate-600 dark:text-slate-300">
            {trainer.trainerClass}
          </span>
          <h3 className={`max-w-full truncate ${BANNER_LABEL}`}>
            {trainerName(trainer)}
            {done && <span className="ml-1.5 text-emerald-600">✓</span>}
          </h3>
        </div>
        <span className="relative shrink-0">
          <TrainerWeather {...props} />
        </span>
      </div>
      <div className="flex flex-col gap-3 p-3">
        <TrainerFacts {...props} />
        <TrainerTeam ctx={ctx} trainer={trainer} locked={locked} className="pb-1" />
        <TrainerRules rules={trainer.rules} />
        {locked && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            🔒 {unlockText(ctx, trainer)}
          </p>
        )}
      </div>
      <div className={TILE_FOOTER}>
        <TrainerRewards ctx={ctx} trainer={trainer} />
        {/* Hauteur du bouton « Défier » réservée : la barre ne change pas de hauteur sans lui. */}
        <div className="ml-auto flex min-h-10 shrink-0 items-center">
          <TrainerAction {...props} />
        </div>
      </div>
    </div>
  );
}

/**
 * Couleurs de chaque rang : liseré intérieur de la tuile, étiquette du rang et emblème. Un
 * Champion battu passe au vert, comme son badge obtenu.
 */
const RANK_STYLES: Record<LeagueRank, { ring: string; done?: string; tag: string; medal: string }> =
  {
    gym: {
      ring: 'shadow-[inset_0_0_0_3px_#f5d061] dark:shadow-[inset_0_0_0_3px_#8a6414]',
      done: 'shadow-[inset_0_0_0_3px_#6ccf98] dark:shadow-[inset_0_0_0_3px_#1f7a4c]',
      tag: 'border-amber-600 bg-done text-amber-800 dark:text-[#f8d878]',
      medal: '',
    },
    elite: {
      ring: 'shadow-[inset_0_0_0_3px_#b9a4f5] dark:shadow-[inset_0_0_0_3px_#5b3fa8]',
      tag: 'border-violet-600 bg-violet-50 text-violet-700 dark:border-violet-400 dark:bg-violet-950 dark:text-violet-300',
      medal: 'bg-violet-600 text-white',
    },
    master: {
      ring: 'shadow-[inset_0_0_0_3px_#f5d061,inset_0_0_0_6px_#e8707a] dark:shadow-[inset_0_0_0_3px_#8a6414,inset_0_0_0_6px_#9c3f48]',
      tag: 'border-rose-600 bg-rose-50 text-rose-700 dark:border-rose-400 dark:bg-rose-950 dark:text-rose-300',
      medal: 'bg-gradient-to-br from-yellow-300 to-rose-500 text-white',
    },
  };

/**
 * Champion d'arène, membre du Conseil 4 ou Maître de la Ligue : toute une ligne, qui clôt la
 * section des dresseurs qui mènent à lui. À gauche, le dresseur devant une Poké Ball et son badge
 * (ou l'emblème du Conseil et du Maître), grisés tant qu'il n'est pas battu ; « Défier » à droite.
 */
export function FeaturedTrainerCard(
  props: TrainerCardProps & { rank: LeagueRank; eliteIndex: number; eliteCount: number },
) {
  const { ctx, trainer, status, record, rank, eliteIndex, eliteCount } = props;
  const locked = status.state === 'locked';
  const won = (record?.wins ?? 0) > 0;
  const style = RANK_STYLES[rank];
  const dim = won ? '' : 'opacity-40 grayscale';
  const label =
    rank === 'gym'
      ? 'Champion d’arène'
      : rank === 'elite'
        ? `Conseil 4${eliteIndex >= 0 ? ` · ${eliteIndex + 1} / ${eliteCount}` : ''}`
        : 'Maître de la Ligue';
  return (
    <div
      id={trainerAnchor(trainer.id)}
      className={`tile col-span-full scroll-mt-4 overflow-hidden ${
        won && style.done ? style.done : style.ring
      } ${locked ? 'opacity-70' : ''}`}
    >
      <div className="flex flex-col sm:flex-row">
        {/* À gauche : le dresseur devant une Poké Ball (en couleur une fois battu), son badge
            à droite sur téléphone, dessous ailleurs. */}
        <div className="flex shrink-0 flex-row items-center justify-center gap-4 border-b-[3px] border-ink p-3 sm:w-56 sm:flex-col sm:gap-2 sm:border-r-[3px] sm:border-b-0">
          <span
            className={`relative grid place-items-center ${rank === 'master' ? 'size-32' : 'size-28'}`}
          >
            <PokeBall
              className={`absolute inset-0 size-full ${won ? '' : 'opacity-25 grayscale'}`}
            />
            <span className="relative">
              <TrainerSprite trainer={trainer} size={rank === 'master' ? 112 : 96} />
            </span>
          </span>
          <span className="grid size-14 place-items-center rounded-md border-2 border-ink bg-win shadow-[2px_2px_0_rgb(0_0_0/0.25)]">
            {rank === 'gym' && trainer.badge ? (
              <BadgeIcon badge={trainer.badge} size={44} className={dim} />
            ) : (
              <span
                className={`grid size-10 place-items-center rounded border-2 border-ink font-pixel text-sm ${style.medal} ${dim}`}
                aria-hidden
              >
                {rank === 'master' ? '♛' : eliteIndex >= 0 ? eliteIndex + 1 : '★'}
              </span>
            )}
          </span>
        </div>

        {/* Au centre : rang, nom et météo, informations, équipe et conditions. */}
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className={`pixel-label shrink-0 rounded border-2 px-1.5 text-[8px] uppercase ${style.tag}`}
            >
              {label}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {trainer.trainerClass}
            </span>
          </div>
          <div className="-mt-1 flex items-center gap-2">
            <h3 className="font-pixel text-xs text-title uppercase sm:text-sm">
              {trainerName(trainer)}
              {won && <span className="ml-2 text-emerald-600">✓</span>}
            </h3>
            <TrainerWeather {...props} />
          </div>
          <TrainerFacts {...props} />
          <TrainerTeam ctx={ctx} trainer={trainer} locked={locked} large className="pb-1" />
          <TrainerRules rules={trainer.rules} />
          {locked && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              🔒 {unlockText(ctx, trainer)}
            </p>
          )}
        </div>

        {/* À droite : « Défier », ou ce qui l'empêche (déjà battu, verrou…). */}
        <div className="flex shrink-0 items-center justify-center border-t-2 border-well-line p-3 sm:w-44 sm:border-t-0 sm:pr-4 sm:pl-0">
          <TrainerAction {...props} epic />
        </div>
      </div>
    </div>
  );
}

/** Poké Ball dessinée, derrière le sprite d'un dresseur mis en avant. */
function PokeBall({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <circle cx="32" cy="32" r="29" fill="#fbfaf2" />
      <path d="M3 32a29 29 0 0 1 58 0z" fill="#d83828" />
      <circle cx="32" cy="32" r="29" fill="none" stroke="#283048" strokeWidth="4" />
      <path d="M3 32h58" stroke="#283048" strokeWidth="4" />
      <circle cx="32" cy="32" r="9" fill="#fbfaf2" stroke="#283048" strokeWidth="4" />
      <circle cx="32" cy="32" r="4" fill="none" stroke="#b4bede" strokeWidth="2" />
    </svg>
  );
}
