FROM mcr.microsoft.com/playwright:v1.49.0-noble

WORKDIR /app

# Instalar pnpm
RUN npm install -g pnpm@10.0.0

# Copiar archivos de dependencias
COPY package.json pnpm-workspace.yaml turbo.json .npmrc ./
COPY apps/runner/package.json ./apps/runner/

# Instalar dependencias del workspace
RUN pnpm install --filter @rpa/runner... --prod=false

# Copiar código del runner
COPY apps/runner ./apps/runner

# Compilar TypeScript
RUN pnpm --filter @rpa/runner build

WORKDIR /app/apps/runner

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
