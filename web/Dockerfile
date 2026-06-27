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
# better-sqlite3 + sharp ship prebuilt binaries; no build toolchain needed at runtime.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Drizzle migrations + scripts needed to init/import a fresh volume.
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts ./scripts
RUN mkdir -p /app/data/media
ENV DATABASE_FILE=/app/data/cookless.db
ENV MEDIA_ROOT=/app/data/media
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
