import type { FastifyInstance } from 'fastify';
import type { Db } from '@poke/db';
import { markShopSeenInputSchema, purchaseInputSchema, sellInputSchema } from '@poke/shared';
import type { PurchaseResponse, SellResponse, ShopResponse } from '@poke/shared';
import type { ContentCache } from '../content-cache';
import { markShopSeen, purchase, sell, shopState } from '../game/shop';
import type { sessionHooks } from '../plugins/session';

interface Deps {
  db: Db;
  content: ContentCache;
  hooks: ReturnType<typeof sessionHooks>;
  now: () => Date;
}

/** Boutique : articles visibles, achat, vente, badge « Nouveau ! ». */
export async function shopRoutes(app: FastifyInstance, { db, content, hooks, now }: Deps) {
  app.addHook('preHandler', hooks.requireUser);

  app.get('/api/shop', async (request): Promise<ShopResponse> =>
    shopState(db, content, request.user!.id, now()),
  );

  app.post('/api/shop/purchase', async (request): Promise<PurchaseResponse> => {
    const input = purchaseInputSchema.parse(request.body);
    return purchase(db, content, request.user!.id, input, now());
  });

  app.post('/api/shop/sell', async (request): Promise<SellResponse> => {
    const input = sellInputSchema.parse(request.body);
    return sell(db, content, request.user!.id, input, now());
  });

  app.post('/api/shop/seen', async (request, reply) => {
    const { entryIds } = markShopSeenInputSchema.parse(request.body);
    await markShopSeen(db, request.user!.id, entryIds, now());
    return reply.code(204).send();
  });
}
