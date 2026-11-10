import type { FastifyInstance } from 'fastify';
import { markShopSeenInputSchema, purchaseInputSchema, sellInputSchema } from '@poke/shared';
import type { PurchaseResponse, SellResponse, ShopResponse } from '@poke/shared';
import { markShopSeen, purchase, sell, shopState } from '../game/shop';
import { currentUserId } from './deps';
import type { RouteDeps } from './deps';

/** Boutique : articles visibles, achat, vente, badge « Nouveau ! ». */
export async function shopRoutes(app: FastifyInstance, { db, content, hooks, now }: RouteDeps) {
  app.addHook('preHandler', hooks.requireUser);

  app.get('/api/shop', async (request): Promise<ShopResponse> =>
    shopState(db, content, currentUserId(request), now()),
  );

  app.post('/api/shop/purchase', async (request): Promise<PurchaseResponse> => {
    const input = purchaseInputSchema.parse(request.body);
    return purchase(db, content, currentUserId(request), input, now());
  });

  app.post('/api/shop/sell', async (request): Promise<SellResponse> => {
    const input = sellInputSchema.parse(request.body);
    return sell(db, content, currentUserId(request), input, now());
  });

  app.post('/api/shop/seen', async (request, reply) => {
    const { entryIds } = markShopSeenInputSchema.parse(request.body);
    await markShopSeen(db, currentUserId(request), entryIds, now());
    return reply.code(204).send();
  });
}
