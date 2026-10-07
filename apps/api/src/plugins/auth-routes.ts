import type { FastifyInstance } from 'fastify';
import type { Auth } from '../auth';

/**
 * Monte le handler Better Auth sur /api/auth/*.
 * Les corps sont gardés bruts (chaînes) pour être retransmis tels quels.
 */
export async function authRoutes(app: FastifyInstance, { auth }: { auth: Auth }) {
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('*', { parseAs: 'string' }, (_req, body, done) => done(null, body));

  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request, reply) {
      const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) {
        if (value !== undefined)
          headers.append(key, Array.isArray(value) ? value.join(', ') : value);
      }
      const body =
        typeof request.body === 'string' && request.body.length > 0 ? request.body : undefined;

      const response = await auth.handler(
        new Request(url, { method: request.method, headers, body }),
      );

      reply.status(response.status);
      response.headers.forEach((value, key) => {
        if (key !== 'set-cookie') reply.header(key, value);
      });
      for (const cookie of response.headers.getSetCookie()) reply.header('set-cookie', cookie);
      return reply.send(response.body ? await response.text() : null);
    },
  });
}
