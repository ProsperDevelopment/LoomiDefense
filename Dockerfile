# syntax=docker/dockerfile:1
# ============================================================
# LoomiDefense — two images from one repo:
#   game-server : Express REST + WebSocket lobby (port4000)
#   web         : static client build behind nginx (port80,
#                 proxies /api and /ws to game-server)
# ============================================================

# Shared dependency layer
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- Game server ----
FROM deps AS game-server
COPY . .
EXPOSE 4000
CMD ["npx", "tsx", "server/index.ts"]

# ---- Client build ----
FROM deps AS web-build
COPY . .
RUN npm run build

# ---- Client behind nginx ----
FROM nginx:1.27-alpine AS web
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/dist /usr/share/nginx/html
EXPOSE 80
