import type { AccountStatusCache } from '../../game/moderation';
import type { Monitoring } from '../../monitoring';
import type { RouteDeps } from '../deps';

/**
 * Ce que reçoivent les routes d'administration, en plus des dépendances communes.
 */

/**
 * Dépendances des routes d'administration : les communes, la supervision, le signal de
 * publication et l'état des comptes (à invalider après une suspension).
 */
export interface AdminDeps extends RouteDeps {
  onContentPublished?: (() => Promise<void>) | undefined;
  monitoring: Monitoring;
  accounts: AccountStatusCache;
}
