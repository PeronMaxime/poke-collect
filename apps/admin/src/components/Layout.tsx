/**
 * Cadre des pages : le menu à gauche (replié derrière un bouton sur téléphone), le compte connecté,
 * la page au centre.
 */
import { useState } from 'react';
import { Outlet, useNavigation } from 'react-router';
import { useAdminUser } from '../lib/admin-user';
import { SideMenu } from './SideMenu';
import { SignOutButton } from './SignOutButton';

/**
 * Cadre des pages (voir l'en-tête du fichier) ; pendant le téléchargement de la page suivante,
 * celle d'avant s'estompe.
 */
export function Layout() {
  const user = useAdminUser();
  const loading = useNavigation().state === 'loading';
  // Menu déplié sur téléphone (toujours visible sur grand écran).
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b border-slate-200 bg-white md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0 md:border-r md:border-b-0 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex h-full flex-col p-4">
          <div className="flex items-center justify-between px-2 md:pb-4">
            <div>
              <p className="text-lg font-bold">Dexpedition</p>
              <p className="text-xs text-slate-500">Administration</p>
            </div>
            <button
              type="button"
              className="btn-ghost md:hidden"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? 'Fermer' : 'Menu'}
            </button>
          </div>
          <div
            className={`min-h-0 flex-1 overflow-y-auto pt-4 md:block md:pt-0 ${menuOpen ? '' : 'hidden'}`}
          >
            <SideMenu onNavigate={() => setMenuOpen(false)} />
          </div>
          <div className={`space-y-2 px-2 pt-4 md:block ${menuOpen ? '' : 'hidden'}`}>
            <p className="truncate text-xs text-slate-500" title={user.email}>
              {user.email}
            </p>
            <SignOutButton className="btn-ghost w-full" />
          </div>
        </div>
      </aside>
      <main
        aria-busy={loading}
        className={`min-w-0 flex-1 p-4 transition-opacity md:p-8 ${loading ? 'opacity-50' : ''}`}
      >
        <Outlet />
      </main>
    </div>
  );
}
