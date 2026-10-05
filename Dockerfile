FROM node:22-alpine AS build
WORKDIR /app

COPY . .
RUN npm ci

# 前端使用同源接口，避免指向 localhost
ENV VITE_API_URL=/api/v1
ENV VITE_REALTIME_URL=""

RUN npm run build

FROM build AS production-deps
RUN npm prune --omit=dev

FROM node:22-alpine AS api
WORKDIR /app
ENV NODE_ENV=production

COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/backend/package.json ./backend/package.json
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/packages ./packages

USER node
EXPOSE 4100
CMD ["node", "backend/dist/server.js"]

FROM caddy:2-alpine AS web
COPY --from=build /app/frontend/dist /srv
COPY deploy/Caddyfile /etc/caddy/Caddyfile