import type { Monitoring } from '../../monitoring';
import type { RouteDeps } from '../deps';

/**
 * Ce que reçoivent les routes d'administration, en plus des dépendances communes.
 */

/**
 * Dépendances des routes d'administration : les communes, la supervision et le signal de
 * publication.
 */
export interface AdminDeps extends RouteDeps {
  onContentPublished?: (() => Promise<void>) | undefined;
  monitoring: Monitoring;
}
