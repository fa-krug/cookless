# web/Dockerfile
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Next standalone server + assets.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Schema-migration toolchain: full deps (incl. tsx + drizzle migrator) OVERRIDE the
# pruned standalone node_modules, plus the TS sources scripts/db-migrate.ts imports.
# The entrypoint runs Drizzle migrations on every boot before serving.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/lib ./lib
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/package.json ./package.json
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh && mkdir -p /app/data/media
ENV DATABASE_FILE=/app/data/cookless.db
ENV MEDIA_ROOT=/app/data/media
ENV PORT=8000
# Next.js standalone server.js binds to $HOSTNAME; Docker auto-sets HOSTNAME to
# the container ID, so force 0.0.0.0 or loopback (healthcheck) can't reach it.
ENV HOSTNAME=0.0.0.0
EXPOSE 8000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
