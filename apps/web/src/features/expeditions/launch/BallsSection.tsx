/**
 * Section « Balls à lancer » du formulaire de départ : une Ball par catégorie de Pokémon rencontré.
 */
import { planBall } from '@poke/game-core';
import { itemIcon, itemName } from '../../../lib/labels';
import { SELECTED_CELL } from '../../common/dialogParts';
import { BASE_BALL_CATEGORIES, capitalize } from './preview';
import type { LaunchModel } from './useLaunchExpedition';
import { BALL_ROWS, COUNT_BADGE, ItemBubble, Section } from './parts';

/**
 * Choix de la Ball de chaque catégorie, Balls par IV parfaits à la demande, et Balls lancées sur la
 * période.
 */
export function BallsSection({ launch }: { launch: LaunchModel }) {
  const { ctx, per, balls, showIvBalls, setShowIvBalls, ballPlan, encounterPace, usageText } =
    launch;
  return (
    <Section
      title="Balls à lancer"
      help={`Rien n’est réservé au départ : à chaque rencontre (${encounterPace}), la Ball de sa catégorie est prise dans ton sac. S’il n’en reste plus à ce moment-là, le Pokémon n’est pas capturé. Les captures se découvrent au retour.${
        showIvBalls
          ? ' Un Pokémon déjà capturé sans IV parfait reçoit la Ball de « Déjà capturé ».'
          : ''
      }`}
      summary={BASE_BALL_CATEGORIES.map((category) => {
        const id = planBall(ballPlan, category);
        return (
          <span key={category} className="inline-flex items-center gap-0.5 pl-1">
            {BALL_ROWS[category].short}
            {id ? (
              <img
                src={itemIcon(ctx, id)}
                alt={itemName(ctx, id)}
                className="size-6 [image-rendering:pixelated]"
              />
            ) : (
              <span className="font-pixel text-red-600 dark:text-red-400">⊘</span>
            )}
          </span>
        );
      })}
    >
      {balls.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Aucune Ball dans ton sac : aucun Pokémon ne sera capturé.
        </p>
      ) : (
        <BallTable launch={launch} />
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {balls.length > 0 && (
          <button
            type="button"
            className="rounded-md border-2 border-dashed border-well-line px-2.5 py-1 text-xs text-slate-600 hover:border-slate-500 dark:text-slate-300"
            aria-expanded={showIvBalls}
            onClick={() => setShowIvBalls(!showIvBalls)}
          >
            {showIvBalls
              ? '− Masquer les Balls par IV parfaits'
              : '+ Une Ball selon les IV parfaits'}
          </button>
        )}
        {usageText && (
          <p className="min-w-0 basis-full text-xs text-slate-500 sm:flex-1 sm:basis-0 sm:text-right dark:text-slate-400">
            {capitalize(per)} :{' '}
            <span className="text-slate-900 dark:text-slate-100">{usageText}</span>
          </p>
        )}
      </div>
    </Section>
  );
}

/**
 * Tableau des choix : une ligne par catégorie de Pokémon, une colonne par Ball du sac, plus « ne
 * pas capturer ».
 */
function BallTable({ launch }: { launch: LaunchModel }) {
  const { ctx, owned, unlimitedItems, balls, ballChoice, setBallChoice, ballCategories, ballPlan } =
    launch;
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b-2 border-well-line">
            <th
              scope="col"
              className="pb-1.5 align-bottom text-xs font-normal text-slate-500 dark:text-slate-400"
            >
              Pokémon rencontré
            </th>
            {balls.map((id) => (
              <th key={id} scope="col" className="pb-1.5 align-bottom sm:px-0.5">
                <ItemBubble ctx={ctx} itemId={id}>
                  <span className="relative mx-auto grid size-8 place-items-center sm:size-9">
                    <img
                      src={itemIcon(ctx, id)}
                      alt={itemName(ctx, id)}
                      className="size-7 [image-rendering:pixelated] sm:size-8"
                    />
                    {!unlimitedItems && <span className={COUNT_BADGE}>{owned(id)}</span>}
                  </span>
                </ItemBubble>
              </th>
            ))}
            <th
              scope="col"
              className="pb-1.5 text-center align-bottom text-[11px] leading-tight font-normal text-slate-500 sm:px-0.5 dark:text-slate-400"
            >
              <span aria-hidden className="font-pixel sm:hidden">
                ⊘
              </span>
              <span className="max-sm:sr-only">Ne pas capturer</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {ballCategories.map((category) => {
            const row = BALL_ROWS[category];
            const chosen = planBall(ballPlan, category);
            return (
              <tr key={category} className="border-b border-well-line/60 last:border-b-0">
                <th scope="row" className="py-1 pr-2 font-normal">
                  <span className="block text-sm font-medium">{row.label}</span>
                  <span className="hidden text-xs text-slate-500 sm:block dark:text-slate-400">
                    {row.hint}
                  </span>
                </th>
                {[...balls, null].map((id) => {
                  const on = chosen === id;
                  return (
                    <td key={id ?? 'none'} className="py-1 sm:px-0.5">
                      <button
                        type="button"
                        aria-pressed={on}
                        aria-label={`${row.label} : ${id ? itemName(ctx, id) : 'ne pas capturer'}`}
                        onClick={() => setBallChoice({ ...ballChoice, [category]: id })}
                        className={`mx-auto grid h-9 w-8 place-items-center sm:w-10 rounded-md border-2 ${
                          on ? SELECTED_CELL : 'border-transparent hover:border-well-line'
                        }`}
                      >
                        {!on ? (
                          <span className="size-2.5 rounded-full border-2 border-slate-400 dark:border-slate-500" />
                        ) : id ? (
                          <img
                            src={itemIcon(ctx, id)}
                            alt=""
                            className="size-7 [image-rendering:pixelated]"
                          />
                        ) : (
                          <span className="font-pixel text-xs text-red-600 dark:text-red-400">
                            ⊘
                          </span>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
