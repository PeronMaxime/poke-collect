/**
 * En-têtes du jeu : bandeau du dresseur sur ordinateur, barre et menu en tiroir sur téléphone, liens
 * du compte.
 */
import { type ReactNode } from 'react';
import { formatMoney } from '../../lib/labels';
import { WIKI_HASH, wikiLink } from '../../features/wiki/wiki';
import { openChangelog } from '../ChangelogPage';
import { PAGE_LABELS } from './menu';
import type { HomeModel } from './useHomeShell';
import { TabLinks } from './TabMenu';

/**
 * Liens du compte : en-tête sur ordinateur, bas du menu burger sur mobile. « Widgets » n'est
 * proposé que là où la colonne des widgets s'affiche (bandeau, grand écran).
 */
function AccountLinks({
  h,
  className,
  activeClassName,
  widgetsClassName,
}: {
  h: HomeModel;
  className: string;
  activeClassName: string;
  widgetsClassName?: string;
}) {
  const { me, tab, setSettingsOpen, setWidgetsOpen, setMenuOpen, unseenChangelog, signOut } = h;
  return (
    <>
      {me.user.role === 'admin' && (
        <a className={className} href={import.meta.env.VITE_ADMIN_URL ?? 'http://localhost:5174'}>
          Admin
        </a>
      )}
      <button
        className={`${className} relative`}
        onClick={() => {
          setMenuOpen(false);
          openChangelog();
        }}
      >
        Nouveautés
        {unseenChangelog && (
          <span
            className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-ink"
            title="Nouvelle mise à jour"
          />
        )}
      </button>
      <a
        className={`${className} ${tab === WIKI_HASH ? activeClassName : ''}`}
        href={wikiLink()}
        onClick={() => setMenuOpen(false)}
      >
        Wiki
      </a>
      {widgetsClassName !== undefined && (
        <button className={`${className} ${widgetsClassName}`} onClick={() => setWidgetsOpen(true)}>
          Widgets
        </button>
      )}
      <button
        className={className}
        onClick={() => {
          setMenuOpen(false);
          setSettingsOpen(true);
        }}
      >
        Réglages
      </button>
      <button className={className} onClick={signOut}>
        Déconnexion
      </button>
    </>
  );
}

/** Bureau : bandeau du dresseur sur toute la largeur (dresseur, titre, compte). */
export function DesktopHeader({ h }: { h: HomeModel }) {
  const { profile, hudRef } = h;
  return (
    <header
      ref={hudRef}
      className="sticky top-0 z-30 hidden grid-cols-[1fr_auto_1fr] items-center gap-x-6 border-b-4 border-brand-500 bg-hud px-6 py-3 text-white md:grid"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <HudPill label="Dresseur">
          <span className="font-bold">{profile.trainerName}</span>
        </HudPill>
        <HudPill label="Argent" title="Poké Dollars">
          <span className="font-bold text-[#f8d030]">{formatMoney(profile.currency)}</span>
        </HudPill>
      </div>
      <a
        href="#expeditions"
        className="relative font-pixel text-lg text-[#f8d030] [text-shadow:3px_3px_0_#d83828]"
      >
        DEXPEDITION
        {/* Hors du flux : le titre reste centré dans la bannière. */}
        <span className="absolute bottom-1/2 -right-11 -rotate-12 font-pixel text-[9px] text-[#ff5040] [text-shadow:1px_1px_0_#10203a]">
          BÊTA
        </span>
      </a>
      <nav className="flex flex-wrap items-center justify-end gap-2" aria-label="Compte">
        <AccountLinks
          h={h}
          className="cursor-pointer rounded-md border-2 border-hud-line px-3 py-1.5 text-sm text-white transition hover:bg-hud-pill"
          activeClassName="bg-hud-pill text-[#f8d030]"
          widgetsClassName="hidden xl:block"
        />
      </nav>
    </header>
  );
}

/** Téléphone : barre avec le bouton du menu, l'onglet affiché, l'argent et le dresseur. */
export function MobileBar({ h }: { h: HomeModel }) {
  const { profile, tab, menuOpen, setMenuOpen, pending, tabLabel } = h;
  return (
    <div className="sticky top-0 z-10 -mx-4 mb-4 flex items-center gap-2 border-b-4 border-brand-500 bg-hud px-2 py-2 text-white md:hidden">
      <button
        className="relative rounded-md p-2 text-white hover:bg-hud-pill"
        onClick={() => setMenuOpen(true)}
        aria-label="Ouvrir le menu"
        aria-expanded={menuOpen}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        {pending && (
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-brand-500 ring-2 ring-hud" />
        )}
      </button>
      <span className="min-w-0 flex-1 truncate font-pixel text-[10px] text-[#f8d030] uppercase">
        {tab === WIKI_HASH ? PAGE_LABELS[tab] : tabLabel(tab)}
      </span>
      <span
        className="shrink-0 rounded-md border-2 border-hud-line bg-hud-pill px-2 py-0.5 text-sm font-bold text-[#f8d030]"
        title="Poké Dollars"
      >
        {formatMoney(profile.currency)}
      </span>
      <span className="max-w-[35%] shrink-0 truncate font-bold">{profile.trainerName}</span>
    </div>
  );
}

/** Téléphone : menu en tiroir depuis la gauche. */
export function MobileMenu({ h }: { h: HomeModel }) {
  const { menuOpen, setMenuOpen } = h;
  if (!menuOpen) return null;
  return (
    <div className="fixed inset-0 z-40 md:hidden">
      <div className="absolute inset-0 bg-black/50" onClick={() => setMenuOpen(false)} />
      <nav className="absolute inset-y-0 left-0 flex w-64 max-w-[80vw] flex-col gap-0.5 overflow-y-auto overscroll-contain border-r-4 border-ink bg-win p-3 shadow-xl">
        <div className="mb-2 flex items-center justify-between px-2.5 py-1">
          <span className="font-pixel text-[10px] text-title uppercase">Menu</span>
          <button
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            onClick={() => setMenuOpen(false)}
            aria-label="Fermer le menu"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <TabLinks h={h} />
        <div className="mt-2 flex flex-col gap-0.5 border-t-2 border-dashed border-slate-300 pt-2 dark:border-slate-700">
          <AccountLinks
            h={h}
            className="rounded-md px-2.5 py-2.5 text-left font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            activeClassName="bg-selected font-bold text-slate-900 dark:text-slate-100"
          />
        </div>
      </nav>
    </div>
  );
}

/** Pastille du bandeau du dresseur : petit libellé pixel, puis la valeur. */
function HudPill({
  label,
  title,
  children,
}: {
  label: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="flex items-center gap-2.5 rounded-md border-2 border-hud-line bg-hud-pill px-3 py-1.5"
      title={title}
    >
      <span className="font-pixel text-[9px] text-[#b8c8e0] uppercase">{label}</span>
      {children}
    </div>
  );
}
