# syntax=docker/dockerfile:1

ARG BUN_VERSION=1.3.11

FROM oven/bun:${BUN_VERSION}-slim AS deps
WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/i18n/package.json packages/i18n/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN bun install --frozen-lockfile

FROM deps AS build
WORKDIR /app

COPY . .

ENV NODE_ENV=production
ENV VITE_API_BASE_URL=/

RUN bun run build

FROM oven/bun:${BUN_VERSION}-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV MINA_API_PORT=3000
ENV VITE_API_BASE_URL=/

COPY package.json bun.lock bunfig.toml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/i18n/package.json packages/i18n/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN bun install --frozen-lockfile --production

COPY --from=build /app/apps/web/dist apps/web/dist
COPY --from=build /app/apps/api/src apps/api/src
COPY --from=build /app/packages/contracts/src packages/contracts/src
COPY --from=build /app/packages/i18n/src packages/i18n/src
COPY --from=build /app/scripts/docker/start.ts scripts/docker/start.ts

USER bun

EXPOSE 3000

CMD ["bun", "scripts/docker/start.ts"]
