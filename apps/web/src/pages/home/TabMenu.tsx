/**
 * Menu des onglets du jeu, commun à la barre latérale et au tiroir du téléphone : sections
 * repliables, onglets verrouillés (leur condition au survol ou au toucher) et pastilles.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { tabUnlock } from '@poke/content';
import type { MenuTabId as TabId } from '@poke/content';
import { unlockConditionText } from '../../lib/labels';
import { tabPending } from './menu';
import type { HomeModel } from './useHomeShell';

/** Liens des onglets, section par section. */
export function TabLinks({ h }: { h: HomeModel }) {
  const {
    ctx,
    tab,
    setMenuOpen,
    lockedTabs,
    counts,
    menuSections,
    sectionOpen,
    toggleSection,
    tabLabel,
    widgetTabs,
    hint,
    setHint,
  } = h;
  // Sans le contenu, on ne sait pas encore quels onglets sont verrouillés.
  if (!ctx) return null;
  return menuSections.map(({ title, tabs }, i) => {
    const open = sectionOpen(title);
    // Section repliée : un point signale qu'un de ses onglets attend le joueur.
    const waiting = !open && tabs.some((id) => !lockedTabs.has(id) && tabPending(id, counts));
    // Grand écran : section masquée quand tous ses onglets sont des widgets de la colonne.
    // Le menu mobile n'existe pas à cette largeur, la règle ne concerne que la barre latérale.
    const allWidgets = tabs.every((id) => widgetTabs.has(id));
    // Première section affichée en grand écran : pas de séparateur au-dessus.
    const firstOnXl = menuSections
      .slice(0, i)
      .every((s) => s.tabs.every((id) => widgetTabs.has(id)));
    return (
      <div
        key={`${i}:${title}`}
        className={`flex flex-col gap-0.5 ${i > 0 ? 'mt-1 border-t-2 border-dashed border-slate-300 pt-1 dark:border-slate-700' : ''} ${
          allWidgets ? 'xl:hidden' : ''
        } ${i > 0 && firstOnXl ? 'xl:mt-0 xl:border-t-0 xl:pt-0' : ''}`}
      >
        <button
          type="button"
          onClick={() => toggleSection(title)}
          aria-expanded={open}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left font-pixel text-[9px] leading-relaxed tracking-wide text-slate-500 uppercase hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <span className="min-w-0 flex-1 truncate">{title}</span>
          {waiting && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-500" />}
          <svg
            viewBox="0 0 24 24"
            className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <SectionPanel open={open}>
          {/* Onglets précédés de la place du curseur (flèche de l'onglet affiché). */}
          <div className="flex flex-col gap-0.5">
            {tabs.map((id) =>
              lockedTabs.has(id) ? (
                // Onglet verrouillé : pas de page, sa condition au survol (au toucher sur mobile).
                <div key={id} className="group relative" data-tab-hint>
                  <button
                    type="button"
                    // Au toucher seulement : à la souris, le survol suffit et le clic ne fait rien.
                    onPointerUp={(e) =>
                      e.pointerType !== 'mouse' && setHint(hint === id ? null : id)
                    }
                    aria-expanded={hint === id}
                    className="flex w-full cursor-default items-center rounded-md px-2.5 py-2.5 text-left font-medium text-slate-400 md:py-2 dark:text-slate-500"
                  >
                    <MenuCursor shown={false} />
                    {tabLabel(id)}
                    <span className="ml-auto text-xs" aria-label="Verrouillé">
                      🔒
                    </span>
                  </button>
                  <p
                    role="tooltip"
                    className={`absolute top-full left-3 z-20 mt-1 w-56 rounded-md border-2 border-ink bg-slate-900 px-3 py-2 text-xs text-white shadow-lg md:top-1/2 md:left-full md:mt-0 md:ml-3 md:-translate-y-1/2 dark:bg-slate-700 ${
                      hint === id ? 'block' : 'hidden group-hover:block'
                    }`}
                  >
                    {unlockConditionText(ctx, tabUnlock(ctx.content.balance, id)) ?? 'Bientôt'}
                  </p>
                </div>
              ) : (
                <a
                  key={id}
                  href={`#${id}`}
                  onClick={() => setMenuOpen(false)}
                  aria-current={tab === id ? 'page' : undefined}
                  className={`flex items-center rounded-md px-2.5 py-2.5 transition md:py-2 ${
                    widgetTabs.has(id) ? 'xl:hidden' : ''
                  } ${
                    tab === id
                      ? 'bg-selected font-bold text-slate-900 dark:text-slate-100'
                      : 'font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                  }`}
                >
                  <MenuCursor shown={tab === id} />
                  {tabLabel(id)}
                  <TabBadges h={h} id={id} />
                </a>
              ),
            )}
          </div>
        </SectionPanel>
      </div>
    );
  });
}

/** Pastilles d'un onglet (compteurs, objets à réclamer…). */
function TabBadges({ h, id }: { h: HomeModel; id: TabId }) {
  const {
    ctx,
    caught,
    expeditions,
    battles,
    dungeons,
    finished,
    daycareReady,
    koWaiting,
    fossilsReady,
    berriesReady,
    questsReady,
    shopNew,
    rewardsReady,
    evolutionsReady,
  } = h;
  return (
    <span className="ml-auto flex items-center">
      {id === 'expeditions' && expeditions.data && (
        <span className="ml-1.5 text-xs text-slate-400" title="Emplacements utilisés">
          {expeditions.data.active.length}/{expeditions.data.slots}
        </span>
      )}
      {id === 'expeditions' && finished > 0 && (
        <span className="ml-1.5 count-badge bg-brand-500 text-white">{finished}</span>
      )}
      {id === 'battles' && battles.data?.active && (
        <span
          className="ml-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-brand-500"
          title="Combat en cours"
        />
      )}
      {id === 'dungeons' && dungeons.data?.active && (
        <span
          className="ml-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-brand-500"
          title="Donjon en cours"
        />
      )}
      {id === 'daycare' && daycareReady > 0 && (
        <span className="ml-1.5 count-badge bg-brand-500 text-white">{daycareReady}</span>
      )}
      {id === 'center' && koWaiting > 0 && (
        <span className="ml-1.5 count-badge bg-red-500 text-white" title="Pokémon K.O. à soigner">
          {koWaiting}
        </span>
      )}
      {id === 'museum' && fossilsReady > 0 && (
        <span className="ml-1.5 count-badge bg-brand-500 text-white">{fossilsReady}</span>
      )}
      {id === 'farm' && berriesReady > 0 && (
        <span className="ml-1.5 count-badge bg-brand-500 text-white">{berriesReady}</span>
      )}
      {id === 'quests' && questsReady > 0 && (
        <span
          className="ml-1.5 count-badge bg-[#f8d030] text-[#1a1400]"
          title="Récompenses de quête à réclamer"
        >
          {questsReady}
        </span>
      )}
      {id === 'shop' && shopNew > 0 && (
        <span className="ml-1.5 count-badge bg-[#f8d030] text-[#1a1400]">{shopNew}</span>
      )}
      {id === 'pokedex' && ctx && <span className="ml-1.5 text-xs text-slate-400">{caught}</span>}
      {id === 'pokedex' && rewardsReady > 0 && (
        <span
          className="ml-1.5 count-badge bg-[#f8d030] text-[#1a1400]"
          title="Récompenses à réclamer"
        >
          {rewardsReady}
        </span>
      )}
      {id === 'pc' && evolutionsReady > 0 && (
        <span
          className="ml-1.5 count-badge bg-emerald-500 text-white"
          title="Pokémon prêts à évoluer"
        >
          {evolutionsReady}
        </span>
      )}
    </span>
  );
}

/** Flèche du menu devant l'onglet affiché (place gardée sur les autres, pour l'alignement). */
function MenuCursor({ shown }: { shown: boolean }) {
  return (
    <svg
      viewBox="0 0 4 7"
      width="8"
      height="14"
      shapeRendering="crispEdges"
      aria-hidden
      className={`mr-2 shrink-0 text-brand-500 ${shown ? '' : 'invisible'}`}
    >
      <path d="M0 0h1v1h1v1h1v1h1v1h-1v1h-1v1h-1v1h-1z" fill="currentColor" />
    </svg>
  );
}
/** Durée de l'animation d'ouverture/fermeture d'une section du menu (ms). */
const SECTION_ANIM_MS = 200;

/**
 * Contenu d'une section du menu, déplié ou replié en douceur (hauteur et opacité). Le contenu
 * reste rendu mais inerte une fois replié ; il ne déborde (infobulles des onglets verrouillés)
 * qu'une fois l'ouverture terminée, pour ne pas chevaucher la section suivante pendant l'animation.
 */
function SectionPanel({ open, children }: { open: boolean; children: ReactNode }) {
  // État (ouvert ou non) auquel l'animation s'est achevée.
  const [settled, setSettled] = useState(open);
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(open), open ? SECTION_ANIM_MS : 0);
    return () => window.clearTimeout(t);
  }, [open]);
  return (
    <div
      inert={!open}
      style={{ transitionDuration: `${SECTION_ANIM_MS}ms` }}
      className={`grid transition-[grid-template-rows,opacity] ease-out motion-reduce:transition-none ${
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
      }`}
    >
      <div className={`min-h-0 ${open && settled ? 'overflow-visible' : 'overflow-hidden'}`}>
        {children}
      </div>
    </div>
  );
}
