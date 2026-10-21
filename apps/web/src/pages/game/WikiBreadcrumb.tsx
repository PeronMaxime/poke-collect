import { wikiLink } from './wiki';

/** Fil d'Ariane des sous-pages du wiki : « Wiki › Pokémon › Pikachu ». */
export function WikiBreadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm text-slate-500">
      <a href={wikiLink()} className="hover:text-brand-600 hover:underline">
        Wiki
      </a>
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1">
          <span className="text-slate-300 dark:text-slate-600">›</span>
          {item.href ? (
            <a href={item.href} className="hover:text-brand-600 hover:underline">
              {item.label}
            </a>
          ) : (
            <span className="font-medium text-slate-700 dark:text-slate-200">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
