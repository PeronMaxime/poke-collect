import type { ReactNode } from 'react';
import type { GameContext } from '@poke/game-core';
import { WikiBreadcrumb } from './WikiBreadcrumb';
import { wikiLink } from './wiki';

/** Lien vers un onglet du jeu ou une page du wiki. */
function Go({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="font-medium text-brand-600 hover:underline dark:text-brand-500">
      {children}
    </a>
  );
}

/** Étape du tutoriel, numérotée. */
function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="card flex gap-4 p-4">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-500 text-sm font-bold text-white">
        {n}
      </span>
      <div className="min-w-0 space-y-1 text-sm">
        <h3 className="text-base font-semibold">{title}</h3>
        {children}
      </div>
    </section>
  );
}

/** Les bases du jeu pour un nouveau joueur, sans entrer dans le détail. */
export function WikiTutorialPage({ ctx }: { ctx: GameContext }) {
  const firstRegion = ctx.regions[0]?.name ?? 'la première région';
  return (
    <div className="space-y-4">
      <WikiBreadcrumb items={[{ label: 'Tutoriel' }]} />
      <div className="card p-5">
        <h2 className="text-xl font-bold">Bien débuter</h2>
        <p className="mt-1 text-sm text-slate-500">
          Le but : attraper des Pokémon, les faire grandir et compléter le Pokédex de chaque région,
          en commençant par {firstRegion}. Le jeu avance même quand tu n’es pas là : lance tes
          activités, puis reviens en récolter les fruits.
        </p>
      </div>

      <Step n={1} title="Pars en expédition">
        <p>
          Dans <Go href="#expeditions">Expéditions</Go>, choisis une zone, une durée et une équipe,
          puis emporte des Poké Balls. Pendant ce temps, ton équipe rencontre des Pokémon sauvages
          et tente de les capturer avec tes Balls ; elle ramène aussi des objets.
        </p>
        <p className="text-slate-500">
          Chaque zone demande une puissance d’équipe minimale (PE), parfois certains types. Les
          Pokémon des types en affinité avec la zone aident à capturer.
        </p>
      </Step>

      <Step n={2} title="Récupère tes captures">
        <p>
          À la fin du compte à rebours, réclame l’expédition : les Pokémon capturés rejoignent ton{' '}
          <Go href="#pc">PC</Go> et ton équipe gagne de l’expérience. Relance aussitôt pour ne
          jamais laisser un emplacement vide.
        </p>
      </Step>

      <Step n={3} title="Fais progresser tes Pokémon">
        <p>
          L’expérience fait monter les niveaux. Depuis le PC, fais évoluer tes Pokémon quand ils
          remplissent la condition (niveau, objet, bonheur…) : la pastille « Évol. » te prévient. La
          fiche de chaque Pokémon dans le <Go href={wikiLink('pokemon')}>wiki</Go> indique comment
          il évolue et où le trouver.
        </p>
      </Step>

      <Step n={4} title="Affronte des dresseurs">
        <p>
          Dans <Go href="#battles">Combats</Go>, défie un dresseur en temps réel, comme dans un
          donjon : ses Pokémon entrent un par un, et tu choisis qui envoyer au combat. Les victoires
          rapportent des Poké Dollars, et les Champions d’arène donnent des badges qui débloquent de
          nouvelles zones.
        </p>
      </Step>

      <Step n={5} title="Dépense tes Poké Dollars">
        <p>
          La <Go href="#shop">Boutique</Go> vend des Balls, des baies et d’autres objets. Tout ce
          que tu possèdes se trouve dans le <Go href="#bag">Sac</Go>. Garde toujours des Balls
          d’avance pour tes expéditions.
        </p>
      </Step>

      <Step n={6} title="Et ensuite ?">
        <ul className="list-disc space-y-1 pl-4">
          <li>
            <Go href="#pokedex">Pokédex</Go> : des récompenses t’attendent à chaque palier d’espèces
            capturées.
          </li>
          <li>
            <Go href="#quests">Quêtes</Go> : des objectifs à suivre, jusqu’aux Pokémon légendaires.
          </li>
          <li>
            <Go href="#daycare">Pension</Go> : deux Pokémon compatibles y pondent des œufs.
          </li>
          <li>
            <Go href="#dungeons">Donjons</Go> : des combats en temps réel contre un boss, pour les
            équipes aguerries.
          </li>
          <li>
            Une Pilule Talent ou un Patch Talent donne à un Pokémon un{' '}
            <Go href={wikiLink('talents')}>talent</Go> qui peut t’aider dans certaines activités.
          </li>
        </ul>
      </Step>
    </div>
  );
}
