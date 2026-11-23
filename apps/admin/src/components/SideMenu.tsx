/**
 * Menu des pages de l'admin, comme celui du jeu : le tableau de bord, puis une section repliable
 * par catégorie (`sections.ts`). Les catégories dépliées sont gardées dans ce navigateur.
 */
import { useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router';
import { DASHBOARD, SECTION_GROUPS, type AdminSection } from '../sections';

const OPEN_GROUPS_KEY = 'dexpedition.admin.openMenuGroups';

function readOpenGroups(): Set<string> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(OPEN_GROUPS_KEY) ?? '[]');
    return new Set(Array.isArray(raw) ? raw.filter((t) => typeof t === 'string') : []);
  } catch {
    return new Set();
  }
}

function saveOpenGroups(groups: Set<string>) {
  try {
    localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify([...groups]));
  } catch {
    // Stockage indisponible : l'état reste en mémoire le temps de la visite.
  }
}

/** Vrai si `pathname` est la page `path` (ou une de ses sous-pages). */
function isCurrent(path: string, pathname: string) {
  return path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`);
}

/**
 * Catégories dépliées. Celle de la page affichée l'est toujours en arrivant sur la page ; on peut
 * la replier tant qu'on y reste.
 */
function useMenuGroups(pathname: string) {
  const [openGroups, setOpenGroups] = useState(readOpenGroups);
  // Page sur laquelle la catégorie de la page affichée a été repliée (sinon elle reste ouverte).
  const [closedOn, setClosedOn] = useState<string | null>(null);
  const currentGroup = SECTION_GROUPS.find((g) =>
    g.sections.some((s) => isCurrent(s.path, pathname)),
  )?.title;

  const groupOpen = (title: string) =>
    openGroups.has(title) || (title === currentGroup && closedOn !== pathname);
  function toggleGroup(title: string) {
    const open = groupOpen(title);
    const next = new Set(openGroups);
    if (open) next.delete(title);
    else next.add(title);
    setOpenGroups(next);
    saveOpenGroups(next);
    if (title === currentGroup) setClosedOn(open ? pathname : null);
  }
  return { groupOpen, toggleGroup };
}

/** Menu des pages (voir l'en-tête du fichier) ; `onNavigate` ferme le tiroir sur téléphone. */
export function SideMenu({ onNavigate }: { onNavigate: () => void }) {
  const { pathname } = useLocation();
  const { groupOpen, toggleGroup } = useMenuGroups(pathname);
  return (
    <nav className="flex flex-col gap-0.5">
      <MenuLink section={DASHBOARD} onNavigate={onNavigate} />
      {SECTION_GROUPS.map(({ title, sections }) => {
        const open = groupOpen(title);
        return (
          <div
            key={title}
            className="mt-1 flex flex-col gap-0.5 border-t border-slate-200 pt-1 dark:border-slate-800"
          >
            <button
              type="button"
              onClick={() => toggleGroup(title)}
              aria-expanded={open}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <span className="min-w-0 flex-1 truncate">{title}</span>
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
            <GroupPanel open={open}>
              <div className="flex flex-col gap-0.5">
                {sections.map((s) => (
                  <MenuLink key={s.path} section={s} onNavigate={onNavigate} />
                ))}
              </div>
            </GroupPanel>
          </div>
        );
      })}
    </nav>
  );
}

/** Lien vers une page, mis en avant quand elle est affichée. */
function MenuLink({ section, onNavigate }: { section: AdminSection; onNavigate: () => void }) {
  return (
    <NavLink
      to={section.path}
      end={section.path === '/'}
      title={section.description}
      onClick={onNavigate}
      className={({ isActive }) =>
        [
          'flex items-center rounded-lg px-3 py-2 text-sm transition',
          isActive
            ? 'bg-brand-500/10 font-medium text-brand-600 dark:text-brand-500'
            : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
        ].join(' ')
      }
    >
      {section.label}
    </NavLink>
  );
}

/** Contenu d'une catégorie, déplié ou replié en douceur (hauteur et opacité) ; inerte une fois replié. */
function GroupPanel({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      inert={!open}
      className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
      }`}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
