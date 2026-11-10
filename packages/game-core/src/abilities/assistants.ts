import type { AbilityParam } from '@poke/content';
import type { GameContext } from '../context';
import type { PokemonInstance } from '../pokemon';
import type { AbilityActivity } from './activities';
import { helpsAsAssistant } from './effects';
import { effectiveAbility } from './env';

/**
 * Postes d'assistant des bâtiments : où un Pokémon peut aider, et à quelle condition (type ou
 * talent utile au poste).
 */

/**
 * Postes d'assistant : un Pokémon affecté à un bâtiment (une pension, une couveuse, une place du
 * Musée, un Centre Pokémon, la ferme à baies) y apporte les effets de son talent, pour ce bâtiment
 * seulement.
 */
export const ASSISTANT_POSTS = [
  'daycare',
  'incubator',
  'museum',
  'center',
  'farm',
  'harvest',
] as const;

export type AssistantPost = (typeof ASSISTANT_POSTS)[number];

/**
 * Places couvertes par un assistant : une couveuse et un Centre Pokémon en ont 6 chacun (les
 * places suivantes forment une autre couveuse, un autre Centre) ; une pension, une place du Musée ;
 * l'arrosage et la récolte de la ferme, un champ de 9 parcelles (les suivantes forment un autre
 * champ).
 */
export const ASSISTANT_POST_PLACES: Record<AssistantPost, number> = {
  daycare: 1,
  incubator: 6,
  museum: 1,
  center: 6,
  farm: 9,
  harvest: 9,
};

/** Poste d'assistant (bâtiment) dont dépend une place. */
export const assistantSlotOf = (post: AssistantPost, place: number) =>
  Math.floor(place / ASSISTANT_POST_PLACES[post]);

/** Postes d'assistant (bâtiments) pour `places` places. */
export const assistantSlotCount = (post: AssistantPost, places: number) =>
  Math.ceil(places / ASSISTANT_POST_PLACES[post]);

export const ASSISTANT_POST_INFO: Record<
  AssistantPost,
  {
    label: string;
    activity: AbilityActivity;
    help: string;
    /** Type exigé de l'assistant (la ferme : un Pokémon Eau pour arroser). */
    requiredType?: string;
    /** Talent exigé : il doit augmenter ce paramètre au poste (récolte de la ferme). */
    requiredParam?: AbilityParam;
  }
> = {
  daycare: {
    label: 'Assistant de la Pension',
    activity: 'breeding',
    help: 'Son talent agit sur la ponte et sur les œufs de cette pension.',
  },
  incubator: {
    label: 'Assistant de la couveuse',
    activity: 'incubator',
    help: 'Son talent agit sur la durée d’éclosion des œufs posés dans cette couveuse (Corps Ardent, Armumagma).',
  },
  museum: {
    label: 'Assistant du Musée',
    activity: 'museum',
    help: 'Son talent agit sur la restauration du fossile déposé ici et sur le Pokémon ranimé.',
  },
  center: {
    label: 'Assistant du Centre Pokémon',
    activity: 'center',
    help: 'Son talent agit sur la durée des soins des Pokémon déposés dans ce Centre (Cœur Soin).',
  },
  farm: {
    label: 'Assistant de la ferme',
    activity: 'farm',
    help: 'Un Pokémon de type Eau arrose le champ : sans lui, les baies ne poussent pas. Son talent peut accélérer la pousse.',
    requiredType: 'water',
  },
  harvest: {
    label: 'Assistant de récolte',
    activity: 'farm',
    help: 'Seul un Pokémon dont le talent augmente la récolte peut tenir ce poste : il ajoute des baies à chaque parcelle récoltée.',
    requiredParam: 'berryYield',
  },
};

/**
 * Le Pokémon peut-il tenir ce poste ? Type exigé (forme comprise) : l'arroseur de la ferme sert
 * par son type, son talent n'est qu'un plus. Talent exigé : un effet qui augmente le paramètre
 * chez l'assistant. Ailleurs, pas d'assistant inutile : son talent doit avoir au moins un effet
 * qui agit chez l'assistant de ce poste (conditions non vérifiées).
 */
export function canAssist(
  ctx: GameContext,
  post: AssistantPost,
  p: Pick<PokemonInstance, 'speciesId' | 'formId' | 'ability'>,
): boolean {
  const { activity, requiredType, requiredParam } = ASSISTANT_POST_INFO[post];
  if (requiredType && !ctx.species(p.speciesId, p.formId)?.types.includes(requiredType)) {
    return false;
  }
  const effects = (ctx.ability(effectiveAbility(ctx, p))?.effects ?? []).filter((e) =>
    helpsAsAssistant(e, activity),
  );
  if (requiredParam) {
    return effects.some((e) => e.type === 'modifier' && e.param === requiredParam && e.value > 0);
  }
  return Boolean(requiredType) || effects.length > 0;
}
