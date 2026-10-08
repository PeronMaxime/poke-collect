# Images de production (voir MISE-EN-PRODUCTION.md), construites par docker-compose.prod.yml :
#  - api   : l'API Node (Fastify, lancée avec tsx comme en développement) ;
#  - caddy : le serveur web (HTTPS automatique) avec les pages du jeu et de l'admin, et les sprites.

# --- Dépendances et sources, communes aux deux images
FROM node:24-slim AS base
ENV CI=1
RUN npm install -g pnpm@10.18.0
WORKDIR /app

# Les package.json d'abord : l'installation reste en cache tant que les dépendances ne changent pas.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/admin/package.json apps/admin/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/content/package.json packages/content/
COPY packages/data/package.json packages/data/
COPY packages/db/package.json packages/db/
COPY packages/game-core/package.json packages/game-core/
COPY packages/shared/package.json packages/shared/
COPY scripts/import-pokeapi/package.json scripts/import-pokeapi/
# Installation complète : tsx lance l'API, sharp sert au téléchargement des illustrations.
RUN pnpm install --frozen-lockfile

COPY . .

# --- Pages du jeu et de l'admin
FROM base AS build
RUN pnpm --filter @poke/web --filter @poke/admin build

# --- API
FROM base AS api
ENV NODE_ENV=production
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "--import", "tsx", "src/server.ts"]

# --- Serveur web
FROM caddy:2.11-alpine AS caddy
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv/web
COPY --from=build /app/apps/admin/dist /srv/admin
# Sprites versionnés dans Git ; les illustrations (artwork/) viennent d'un volume.
COPY apps/api/sprites /srv/sprites
