import type { Monitoring } from '../../monitoring';
import type { RouteDeps } from '../deps';

/**
 * Ce que reçoivent les routes d'administration, en plus des dépendances communes.
 */

export interface AdminDeps extends RouteDeps {
  onContentPublished?: (() => Promise<void>) | undefined;
  monitoring: Monitoring;
}
