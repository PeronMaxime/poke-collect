/**
 * Carte d'une zone d'expédition : bandeau, Pokémon qu'on y rencontre, avancement du Pokédex et
 * départ. Partagée avec le simulateur de l'admin.
 */
import type { CSSProperties } from 'react';
import type { SpecialEncounter, Zone } from '@poke/content';
import { chainMultiplier, chainPerfectIvs } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type { RoamerDto, ShinyChainDto } from '@poke/shared';
import { PokemonSprite, ProgressBar, TypeBadge } from '../../components/ui';
import { usePokedex, usePokedexForms } from '../../lib/queries';
import {
  formatCountdown,
  formatMultiplier,
  speciesName,
  unlockConditionText,
} from '../../lib/labels';
import { BANNER_LABEL, CHECKER, TINTED_BANNER, zoneSpecies, zoneTint } from '../common/zoneBanner';
import { ZoneWeatherIcon } from '../common/WeatherIcon';

/** Ce que le joueur a vu et capturé, pour colorer les Pokémon d'une zone. */
export interface ZoneDex {
  seen: Set<number>;
  caught: Set<number>;
  /** Formes (régionales, Méga…) capturées : distinctes de l'espèce de base. */
  caughtForms: Set<number>;
  /** Espèces et formes dont la version shiny est capturée : affichées en shiny, avec un halo. */
  caughtShiny: Set<number>;
  caughtShinyForms: Set<number>;
}

/**
 * Pokédex du joueur, sous la forme qu'attendent les cartes de zone ; vide pendant le chargement.
 */
export function useZoneDex(): ZoneDex {
  const pokedex = usePokedex();
  const pokedexForms = usePokedexForms();
  const seen = new Set(pokedex.data?.filter((d) => d.seen).map((d) => d.speciesId));
  const caught = new Set(pokedex.data?.filter((d) => d.caught).map((d) => d.speciesId));
  const caughtForms = new Set(pokedexForms.data?.map((f) => f.formId));
  const caughtShiny = new Set(pokedex.data?.filter((d) => d.caughtShiny).map((d) => d.speciesId));
  const caughtShinyForms = new Set(
    pokedexForms.data?.filter((f) => f.caughtShiny).map((f) => f.formId),
  );
  return { seen, caught, caughtForms, caughtShiny, caughtShinyForms };
}

type ZoneSpecies = ReturnType<typeof zoneSpecies>;

/**
 * Carte d'une zone : grisée tant qu'elle est verrouillée (sa condition remplace alors le bouton de
 * départ). Les Pokémon sont en couleur une fois capturés, en gris si seulement vus, en silhouette
 * tant que l'espèce n'a pas été vue.
 */
export function ZoneCard({
  ctx,
  zone,
  seen,
  caught,
  caughtForms,
  caughtShiny,
  caughtShinyForms,
  unlocked,
  canLaunch,
  chain,
  roamers = [],
  specials = [],
  serverNow,
  onLaunch,
  favorite,
  onFavorite,
}: {
  ctx: GameContext;
  zone: Zone;
  seen: Set<number>;
  caught: Set<number>;
  /** Formes (régionales, Méga…) capturées : distinctes de l'espèce de base. */
  caughtForms: Set<number>;
  /** Espèces et formes dont la version shiny est capturée : affichées en shiny, avec un halo. */
  caughtShiny: Set<number>;
  caughtShinyForms: Set<number>;
  unlocked: boolean;
  canLaunch: boolean;
  chain: ShinyChainDto | undefined;
  /** Pokémon fuyards cachés dans la zone en ce moment. */
  roamers?: RoamerDto[];
  /** Rencontres spéciales qu'ouvrent les Pokémon du joueur (affichées avec les autres). */
  specials?: SpecialEncounter[];
  serverNow: number;
  onLaunch: () => void;
  favorite: boolean;
  onFavorite: (on: boolean) => void;
}) {
  const dex = { seen, caught, caughtForms, caughtShiny, caughtShinyForms };
  const expiresIn = chain?.expiresAt ? Date.parse(chain.expiresAt) - serverNow : null;
  const perfectIvs = chain ? chainPerfectIvs(ctx, chain.chain) : 0;
  const species = zoneSpecies(ctx, zone);
  const unlock = zone.unlock;
  return (
    <div className={`tile flex flex-col overflow-hidden ${unlocked ? '' : 'opacity-60'}`}>
      <ZoneBanner
        ctx={ctx}
        zone={zone}
        // Bandeau teinté selon le type le plus présent parmi les Pokémon de la zone.
        tint={zoneTint(species)}
        roamers={roamers}
        serverNow={serverNow}
        favorite={favorite}
        onFavorite={onFavorite}
      />
      <div className="flex flex-1 flex-col p-3">
        <p className="text-sm leading-snug text-slate-600 dark:text-slate-300">
          {zone.description}
        </p>
        {/* Phrase énigmatique : seulement quand le joueur possède le Pokémon requis. */}
        {specials
          .filter((s) => s.hint)
          .map((s, i) => (
            <p key={i} className="mt-1 text-xs text-violet-700 italic dark:text-violet-300">
              ✧ {s.hint}
            </p>
          ))}
        {chain && (expiresIn === null || expiresIn > 0) && (
          <p
            className="mt-2 rounded-md border-2 border-dashed border-amber-600 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 dark:border-[#a07a20] dark:bg-[#3d3416] dark:text-[#f8d878]"
            title="Relance la zone avant la fin du délai pour allonger la chaîne."
          >
            ✦ Chaîne {chain.chain} : chromatique{' '}
            {formatMultiplier(chainMultiplier(ctx, chain.chain))}
            {perfectIvs > 0 && ` · ${perfectIvs} IV parfait${perfectIvs > 1 ? 's' : ''}`}
            {expiresIn !== null && ` · à relancer sous ${formatCountdown(expiresIn)}`}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
          {zone.requiredTypes.map((r) => (
            <span key={r.type} className="flex items-center gap-1">
              Requis : {r.count} × <TypeBadge type={r.type} />
            </span>
          ))}
          {zone.affinityTypes.length > 0 && <span className="ml-1">Affinité :</span>}
          {zone.affinityTypes.map((t) => (
            <TypeBadge key={t} type={t} />
          ))}
        </div>
        <ZoneSpeciesGrid ctx={ctx} species={species} specials={specials} dex={dex} />
        <ZoneDexProgress species={species} dex={dex} />
        <div className="mt-auto pt-3">
          {unlocked ? (
            <button className="btn-primary w-full" disabled={!canLaunch} onClick={onLaunch}>
              {canLaunch ? 'Envoyer une équipe' : 'Aucun emplacement libre'}
            </button>
          ) : (
            <p className="text-center text-sm font-semibold text-slate-500 dark:text-slate-400">
              🔒 {unlockConditionText(ctx, unlock) ?? 'Région verrouillée'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Bandeau de la carte : image ou teinte de la zone, nom, PE requis, météo, fuyards et favori. */
function ZoneBanner({
  ctx,
  zone,
  tint,
  roamers,
  serverNow,
  favorite,
  onFavorite,
}: {
  ctx: GameContext;
  zone: Zone;
  tint: string | undefined;
  roamers: RoamerDto[];
  serverNow: number;
  favorite: boolean;
  onFavorite: (on: boolean) => void;
}) {
  return (
    <div
      className={`relative flex flex-col justify-end gap-1.5 border-b-[3px] border-ink p-2.5 ${zone.image ? 'h-28' : 'min-h-[4.5rem]'}`}
    >
      {zone.image ? (
        <img
          src={zone.image}
          alt=""
          className="absolute inset-0 h-full w-full object-cover dark:brightness-75"
        />
      ) : (
        <span
          aria-hidden
          className={`absolute inset-0 ${TINTED_BANNER}`}
          style={{ '--tint': tint, ...CHECKER } as CSSProperties}
        />
      )}
      {/* Ligne 1 : le nom de la zone, centré. Ligne 2 : PE requis à gauche, météo (et fuyards)
            au milieu, favori à droite. */}
      <h3 className={`relative max-w-full self-center text-center ${BANNER_LABEL}`}>{zone.name}</h3>
      <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
        {/* Même étiquette que le nom de la zone (bordure, police, hauteur). Le « ≥ » en police
              normale ne doit pas agrandir la ligne : `leading-none` dans un `inline-flex`. */}
        <span className="inline-flex items-center gap-1 justify-self-start rounded border-2 border-ink bg-win px-2 py-1 font-pixel text-[10px] leading-normal whitespace-nowrap">
          PE <span className="font-sans text-sm leading-none">≥</span> {zone.minPower}
        </span>
        <div className="flex items-center justify-center gap-1.5">
          <ZoneWeatherIcon
            zone={zone}
            at={serverNow}
            activity="expedition"
            className="rounded border-2 border-ink bg-win px-1 text-base leading-snug"
          />
          {roamers.map((r) => (
            <span
              key={r.questId}
              className="relative -my-2 flex"
              // Heure fixe plutôt qu'un compte à rebours : un titre qui change chaque seconde fait
              // clignoter l'infobulle.
              title={`${speciesName(ctx, r.speciesId, r.formId)} se cache ici jusqu’à ${new Date(r.movesAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} (fuyard : ${r.encounterChance} % de chances par rencontre)`}
            >
              <PokemonSprite
                speciesId={r.speciesId}
                formId={r.formId}
                size={40}
                className="animate-pulse"
                alt={speciesName(ctx, r.speciesId, r.formId)}
              />
            </span>
          ))}
        </div>
        <button
          type="button"
          className={`justify-self-end rounded border-2 border-ink bg-win px-1.5 text-lg leading-tight transition hover:scale-110 ${
            favorite ? 'text-amber-500' : 'text-slate-400 hover:text-amber-500 dark:text-slate-500'
          }`}
          onClick={() => onFavorite(!favorite)}
          title={favorite ? 'Retirer des favoris' : 'Mettre en favori (affichée en tête de page)'}
          aria-label={favorite ? 'Retirer des favoris' : 'Mettre en favori'}
          aria-pressed={favorite}
        >
          {favorite ? '★' : '☆'}
        </button>
      </div>
    </div>
  );
}

/**
 * Pokémon de la zone puis rencontres spéciales. Grille justifiée : la place restante est répartie
 * entre les colonnes, pour la même marge à gauche et à droite.
 */
function ZoneSpeciesGrid({
  ctx,
  species,
  specials,
  dex,
}: {
  ctx: GameContext;
  species: ZoneSpecies;
  specials: SpecialEncounter[];
  dex: ZoneDex;
}) {
  const { seen, caught, caughtForms, caughtShiny, caughtShinyForms } = dex;
  return (
    <div className="mt-3 grid grid-cols-[repeat(auto-fill,3rem)] justify-between gap-1">
      {species.map(({ speciesId: id, formId }) => {
        const shiny = formId != null ? caughtShinyForms.has(formId) : caughtShiny.has(id);
        const sprite = (
          <PokemonSprite
            speciesId={id}
            formId={formId}
            size={44}
            shiny={shiny}
            silhouette={!seen.has(id)}
            className={
              !shiny && seen.has(id) && !(formId != null ? caughtForms.has(formId) : caught.has(id))
                ? 'opacity-50 grayscale'
                : ''
            }
            alt={seen.has(id) ? ctx.species(id, formId)?.nameFr : '?'}
          />
        );
        const key = `${id}:${formId ?? ''}`;
        const name = seen.has(id) ? speciesName(ctx, id, formId) : '?';
        return (
          <span
            key={key}
            className={`sprite-well relative size-12 ${shiny ? 'shiny-well' : ''}`}
            title={shiny ? `${name} (chromatique capturé)` : name}
          >
            {sprite}
          </span>
        );
      })}
      {specials.map((s) => {
        const own = s.formId != null ? caughtForms.has(s.formId) : caught.has(s.speciesId);
        const name = speciesName(ctx, s.speciesId, s.formId);
        return (
          <span
            key={`special:${s.speciesId}:${s.formId ?? ''}`}
            className="sprite-well relative size-12 border-violet-400"
            title={`Rencontre spéciale : ${name}, avec ${speciesName(ctx, s.requiredSpeciesId, s.requiredFormId)} dans l’équipe (${s.chance} % de chances par rencontre)`}
          >
            <PokemonSprite
              speciesId={s.speciesId}
              formId={s.formId}
              size={44}
              className={own ? '' : 'opacity-50 grayscale'}
              alt={name}
            />
          </span>
        );
      })}
    </div>
  );
}

/** Part des Pokémon de la zone capturés, puis capturés en chromatique ; rien pour une zone vide. */
function ZoneDexProgress({ species, dex }: { species: ZoneSpecies; dex: ZoneDex }) {
  const { caught, caughtForms, caughtShiny, caughtShinyForms } = dex;
  const caughtCount = species.filter(({ speciesId: id, formId }) =>
    formId != null ? caughtForms.has(formId) : caught.has(id),
  ).length;
  const shinyCount = species.filter(({ speciesId: id, formId }) =>
    formId != null ? caughtShinyForms.has(formId) : caughtShiny.has(id),
  ).length;
  if (species.length === 0) return null;
  return (
    <div className="mt-3 grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1.5 text-xs text-slate-600 dark:text-slate-300">
      <span>Capturés</span>
      <ProgressBar value={caughtCount / species.length} />
      <span className="text-right tabular-nums">
        {caughtCount} / {species.length}
      </span>
      <span className="text-amber-600 dark:text-amber-400">✦ Chromatique</span>
      <ProgressBar value={shinyCount / species.length} barClassName="bg-amber-400" />
      <span className="text-right tabular-nums">
        {shinyCount} / {species.length}
      </span>
    </div>
  );
}
