# HomeGarden demo image: the API and the built SPA in one container, the SPA
# serving /api from the same origin (docs/PRODUCTION-READINESS.md).
#
#   docker build -t home-garden .
#   docker run -p 8080:8080 -v home-garden-data:/data home-garden
#
# Then open http://localhost:8080. The SQLite database lives on the /data
# volume, so it survives restarts and redeploys.

ARG NODE_VERSION=24.21.0

FROM node:${NODE_VERSION}-bookworm-slim AS build
# better-sqlite3 builds from source when no prebuilt binary matches the platform.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
ENV NX_DAEMON=false NX_NO_CLOUD=true
WORKDIR /repo
COPY . .
RUN npm ci
RUN npx nx run-many -t build -p @itp-home-garden/api web --configuration=production \
  && npx nx run @itp-home-garden/api:prune
# The API's own dependencies only, from the lockfile the prune step wrote.
RUN cd apps/api/dist && npm ci --omit=dev

FROM node:${NODE_VERSION}-bookworm-slim
ENV NODE_ENV=production PORT=8080 DB_PATH=/data/db.sqlite
WORKDIR /app
COPY --from=build /repo/apps/api/dist ./api
COPY --from=build /repo/apps/web/dist/web/browser ./web
COPY --from=build /repo/tools/serve-dist.mjs /repo/tools/start-demo.mjs ./tools/
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080
CMD ["node", "tools/start-demo.mjs"]
