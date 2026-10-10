FROM node:24-alpine AS base

RUN apk add --no-cache libc6-compat
RUN npm install -g pnpm@10.0.0

WORKDIR /app

COPY package.json pnpm-workspace.yaml turbo.json .npmrc ./
COPY apps/web/package.json ./apps/web/

RUN pnpm install --filter web...

COPY apps/web ./apps/web

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN pnpm --filter web build

EXPOSE 3000

WORKDIR /app/apps/web

CMD ["pnpm", "start"]
