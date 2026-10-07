import { NavLink, Outlet } from 'react-router';
import { useAdminUser } from '../lib/admin-user';
import { CURRENT_PHASE, SECTIONS } from '../sections';
import { SignOutButton } from './SignOutButton';

export function Layout() {
  const user = useAdminUser();
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b border-slate-200 bg-white md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0 md:border-r md:border-b-0 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex h-full flex-col p-4">
          <div className="px-2 pb-4">
            <p className="text-lg font-bold">Poké Collect</p>
            <p className="text-xs text-slate-500">Administration</p>
          </div>
          <nav className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
            {SECTIONS.map((s) => (
              <NavLink
                key={s.path}
                to={s.path}
                end={s.path === '/'}
                className={({ isActive }) =>
                  [
                    'flex shrink-0 items-center justify-between rounded-lg px-3 py-2 text-sm whitespace-nowrap transition',
                    isActive
                      ? 'bg-brand-500/10 font-medium text-brand-600 dark:text-brand-500'
                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                    s.phase > CURRENT_PHASE ? 'opacity-60' : '',
                  ].join(' ')
                }
              >
                {s.label}
                {s.phase > CURRENT_PHASE && (
                  <span className="ml-2 text-[10px] text-slate-400">P{s.phase}</span>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto hidden space-y-2 px-2 pt-4 md:block">
            <p className="truncate text-xs text-slate-500" title={user.email}>
              {user.email}
            </p>
            <SignOutButton className="btn-ghost w-full" />
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}
