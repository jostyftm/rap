FROM node:24-bookworm-slim AS builder

RUN npm install -g pnpm@10.0.0

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json .npmrc ./
COPY packages/dsl/package.json ./packages/dsl/
COPY packages/locator/package.json ./packages/locator/
COPY apps/runner/package.json ./apps/runner/

RUN pnpm install --filter @rpa/runner... --frozen-lockfile

COPY packages/dsl ./packages/dsl
COPY packages/locator ./packages/locator
COPY apps/runner ./apps/runner

RUN pnpm --filter @rpa/dsl build \
    && pnpm --filter @rpa/locator build \
    && pnpm --filter @rpa/runner build

FROM node:24-bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g pnpm@10.0.0

WORKDIR /app

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json .npmrc ./
COPY packages/dsl/package.json ./packages/dsl/
COPY packages/locator/package.json ./packages/locator/
COPY apps/runner/package.json ./apps/runner/

RUN pnpm install --filter @rpa/runner... --prod --frozen-lockfile \
    && pnpm --filter @rpa/runner exec playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/packages/dsl/dist ./packages/dsl/dist
COPY --from=builder /app/packages/dsl/schema ./packages/dsl/schema
COPY --from=builder /app/packages/locator/dist ./packages/locator/dist
COPY --from=builder /app/apps/runner/dist ./apps/runner/dist

RUN chown -R node:node /app /ms-playwright

USER node

WORKDIR /app/apps/runner

ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-http-header-size=262144
ENV RUNNER_HEADLESS=true

EXPOSE 8085

CMD ["node", "dist/index.js"]
