FROM node:24-alpine AS deps

RUN apk add --no-cache libc6-compat \
    && npm install -g pnpm@10.0.0

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json .npmrc ./
COPY packages/dsl/package.json ./packages/dsl/
COPY packages/locator/package.json ./packages/locator/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --filter web... --frozen-lockfile

FROM deps AS builder

COPY packages/dsl ./packages/dsl
COPY packages/locator ./packages/locator
COPY apps/web ./apps/web

ARG NEXT_PUBLIC_API_URL=http://localhost
ARG NEXT_PUBLIC_REVERB_APP_KEY=local-reverb-key
ARG NEXT_PUBLIC_REVERB_HOST=localhost
ARG NEXT_PUBLIC_REVERB_PORT=80
ARG NEXT_PUBLIC_REVERB_SCHEME=http
ARG NEXT_PUBLIC_LIVE_HOST=
ARG NEXT_PUBLIC_LIVE_PORT=80
ARG NEXT_PUBLIC_S3_URL=

ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_REVERB_APP_KEY=${NEXT_PUBLIC_REVERB_APP_KEY}
ENV NEXT_PUBLIC_REVERB_HOST=${NEXT_PUBLIC_REVERB_HOST}
ENV NEXT_PUBLIC_REVERB_PORT=${NEXT_PUBLIC_REVERB_PORT}
ENV NEXT_PUBLIC_REVERB_SCHEME=${NEXT_PUBLIC_REVERB_SCHEME}
ENV NEXT_PUBLIC_LIVE_HOST=${NEXT_PUBLIC_LIVE_HOST}
ENV NEXT_PUBLIC_LIVE_PORT=${NEXT_PUBLIC_LIVE_PORT}
ENV NEXT_PUBLIC_S3_URL=${NEXT_PUBLIC_S3_URL}
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter @rpa/dsl build \
    && pnpm --filter @rpa/locator build \
    && pnpm --filter web build

FROM node:24-alpine AS runner

RUN apk add --no-cache libc6-compat curl \
    && npm install -g pnpm@10.0.0

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=builder --chown=node:node /app/package.json /app/pnpm-workspace.yaml /app/turbo.json /app/.npmrc ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/packages/dsl/package.json ./packages/dsl/
COPY --from=builder --chown=node:node /app/packages/dsl/dist ./packages/dsl/dist
COPY --from=builder --chown=node:node /app/packages/dsl/schema ./packages/dsl/schema
COPY --from=builder --chown=node:node /app/packages/locator/package.json ./packages/locator/
COPY --from=builder --chown=node:node /app/packages/locator/dist ./packages/locator/dist
COPY --from=builder --chown=node:node /app/apps/web/package.json ./apps/web/
COPY --from=builder --chown=node:node /app/apps/web/next.config.ts ./apps/web/
COPY --from=builder --chown=node:node /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=builder --chown=node:node /app/apps/web/.next ./apps/web/.next
COPY --from=builder --chown=node:node /app/apps/web/public ./apps/web/public

USER node

EXPOSE 3000

CMD ["pnpm", "--filter", "web", "start"]
