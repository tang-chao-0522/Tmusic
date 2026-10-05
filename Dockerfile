FROM node:24-alpine AS build
WORKDIR /app
COPY . .
RUN npm ci && npm run build

FROM node:24-alpine AS api
ENV NODE_ENV=production
WORKDIR /app/backend
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/backend/package.json /app/backend/package.json
COPY --from=build /app/backend/dist /app/backend/dist
COPY --from=build /app/packages/contracts/package.json /app/packages/contracts/package.json
COPY --from=build /app/packages/contracts/dist /app/packages/contracts/dist
USER node
EXPOSE 4100
CMD ["node", "dist/server.js"]

FROM nginx:stable-alpine AS web
COPY --from=build /app/frontend/dist /usr/share/nginx/html
COPY infra/nginx/tmusic-http.conf /etc/nginx/tmusic-http.conf
COPY infra/nginx/tmusic-https.conf /etc/nginx/tmusic-https.conf
COPY infra/nginx/start.sh /usr/local/bin/tmusic-nginx-start
EXPOSE 80 443
ENTRYPOINT ["/bin/sh", "/usr/local/bin/tmusic-nginx-start"]
