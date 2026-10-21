import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { GameContext } from '@poke/game-core';
import { PokemonSprite } from '../../components/ui';
import { wikiAbilities, wikiEntries, wikiLink } from './wiki';
import { WikiAbilitiesPage } from './WikiAbilitiesPage';
import { DEFAULT_POKEMON_FILTERS, WikiPokemonPage } from './WikiPokemonPage';
import type { PokemonFilters } from './WikiPokemonPage';
import { WikiTutorialPage } from './WikiTutorialPage';

/** Parties de l'ancre après `#wiki/` (`['pokemon', '25']`). */
function useWikiPath(): string[] {
  const hash = useSyncExternalStore(
    (onChange) => {
      window.addEventListener('hashchange', onChange);
      return () => window.removeEventListener('hashchange', onChange);
    },
    () => window.location.hash,
  );
  return hash.slice(1).split('/').slice(1).filter(Boolean).map(decodeURIComponent);
}

/** Wiki : accueil (cartes des sous-pages), Pokémon et leurs fiches, talents, tutoriel. */
export function WikiPage({ ctx }: { ctx: GameContext }) {
  const [section, ...rest] = useWikiPath();
  // Filtres de la liste des Pokémon, conservés quand on ouvre une fiche puis qu'on revient.
  const [filters, setFilters] = useState<PokemonFilters>(DEFAULT_POKEMON_FILTERS);
  const view = `${section ?? ''}/${rest.join('/')}`;
  const listScroll = useRef(0);
  const previousView = useRef(view);

  useEffect(() => {
    const previous = previousView.current;
    previousView.current = view;
    if (previous === view) return;
    // Retour à la liste des Pokémon : on retrouve sa position ; ailleurs, haut de page.
    window.scrollTo(0, view === 'pokemon/' ? listScroll.current : 0);
  }, [view]);

  useEffect(() => {
    if (view !== 'pokemon/') return;
    const onScroll = () => (listScroll.current = window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [view]);

  if (section === 'pokemon') {
    const speciesId = Number(rest[0]);
    const formId = rest[1] !== undefined ? Number(rest[1]) : null;
    return (
      <WikiPokemonPage
        ctx={ctx}
        selected={Number.isInteger(speciesId) && speciesId > 0 ? { speciesId, formId } : null}
        filters={filters}
        onFiltersChange={setFilters}
      />
    );
  }
  if (section === 'talents') return <WikiAbilitiesPage ctx={ctx} selected={rest[0] ?? null} />;
  if (section === 'tutoriel') return <WikiTutorialPage ctx={ctx} />;
  return <WikiHome ctx={ctx} />;
}

function WikiHome({ ctx }: { ctx: GameContext }) {
  const pokemonCount = useMemo(() => wikiEntries(ctx).length, [ctx]);
  const abilityCount = useMemo(() => wikiAbilities(ctx).length, [ctx]);
  const regions = ctx.regions.map((r) => r.name).join(', ');
  const starters = ctx.regions[0]?.starterSpeciesIds ?? [];

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h2 className="text-xl font-bold">Wiki</h2>
        <p className="mt-1 text-sm text-slate-500">
          Un guide pour bien débuter, puis tout ce qu’il faut savoir sur les Pokémon et les talents
          des régions disponibles ({regions}).
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <WikiCard
          href={wikiLink('tutoriel')}
          title="Tutoriel"
          subtitle="Pour bien débuter"
          text="Les bases du jeu en quelques minutes : expéditions, progression, combats et plus."
          visual={<span className="text-5xl">📘</span>}
        />
        <WikiCard
          href={wikiLink('pokemon')}
          title="Pokémon"
          subtitle={`${pokemonCount} Pokémon et formes`}
          text="Statistiques de base, talents, localisation, sexe, évolutions, faiblesses et résistances."
          visual={
            <div className="flex -space-x-4">
              {(starters.length > 0 ? starters : [1, 4, 7]).slice(0, 3).map((id) => (
                <PokemonSprite key={id} speciesId={id} size={72} />
              ))}
            </div>
          }
        />
        <WikiCard
          href={wikiLink('talents')}
          title="Talents"
          subtitle={`${abilityCount} talents`}
          text="L’effet de chaque talent dans le jeu, et les Pokémon qui peuvent l’avoir."
          visual={<span className="text-5xl text-violet-500">✦</span>}
        />
      </div>
    </div>
  );
}

function WikiCard({
  href,
  title,
  subtitle,
  text,
  visual,
}: {
  href: string;
  title: string;
  subtitle: string;
  text: string;
  visual: ReactNode;
}) {
  return (
    <a
      href={href}
      className="card group flex flex-col gap-3 p-5 transition hover:border-brand-500/60 hover:shadow-md"
    >
      <div className="grid h-20 place-items-center">{visual}</div>
      <div>
        <h3 className="text-lg font-semibold group-hover:text-brand-600 dark:group-hover:text-brand-500">
          {title}
        </h3>
        <p className="text-xs font-medium text-slate-400">{subtitle}</p>
      </div>
      <p className="text-sm text-slate-500">{text}</p>
    </a>
  );
}
