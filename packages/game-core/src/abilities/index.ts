/**
 * Talents : leurs effets (réglés dans l'admin) ne jouent que pour les Pokémon qui participent à
 * l'activité (équipe envoyée). Un talent sans entrée dans le contenu n'a aucun effet.
 *
 * Un effet est soit un **modificateur** chiffré d'un paramètre du catalogue (`params.ts` : PE,
 * capture, XP, durée…), soit une **mécanique** de combat (immunité, Intimidation…, traduite dans
 * `dungeon/traits.ts`). Chaque effet porte des conditions (`effects.ts`) évaluées contre
 * l'environnement de l'activité (`env.ts` : équipe, zone, météo, heure).
 *
 * Ordre de lecture : `activities.ts`, `params.ts`, `env.ts`, `effects.ts`, `modifiers.ts`.
 */

export * from './activities';
export * from './assistants';
export * from './params';
export * from './env';
export * from './effects';
export * from './modifiers';
export * from './power';
export * from './wild';
export * from './text';
