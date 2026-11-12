/**
 * Appels à l'API depuis l'admin : `api()` de `@poke/client`, commun avec le jeu (JSON, cookie de
 * session, erreurs en `ApiError`), avec un délai plus long que dans le jeu : import du contenu,
 * publication et télémétrie peuvent prendre du temps.
 */
import { createApi } from '@poke/client';

export { ApiError } from '@poke/client';

/** Appel à l'API ; `json` est envoyé en JSON ; un refus lève une `ApiError`. */
export const api = createApi({ timeoutMs: 120_000 });
