import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';

/** Images téléchargées par `pnpm sprites:download`. */
const SPRITES_DIR = fileURLToPath(new URL('../../sprites/', import.meta.url));
/** Dossier, puis nom de fichier : rien d'autre n'est servi (pas de `..`). */
const PATH =
  /^(?:(?:items|trainers|pokemon|pokemon\/shiny)\/[a-z0-9-]+\.png|artwork(?:\/shiny)?\/[a-z0-9-]+\.webp)$/;
const CONTENT_TYPES = { png: 'image/png', webp: 'image/webp' } as Record<string, string>;

/** Sprites des Pokémon, objets et dresseurs (publics, sans session). */
export async function spriteRoutes(app: FastifyInstance) {
  app.get<{ Params: { '*': string } }>('/api/sprites/*', async (request, reply) => {
    const path = request.params['*'];
    if (!PATH.test(path)) return reply.code(404).send();
    const data = await readFile(`${SPRITES_DIR}${path}`).catch(() => null);
    if (!data) return reply.code(404).send();
    return reply
      .header('Content-Type', CONTENT_TYPES[path.slice(path.lastIndexOf('.') + 1)])
      .header('Cache-Control', 'public, max-age=604800')
      .send(data);
  });
}
