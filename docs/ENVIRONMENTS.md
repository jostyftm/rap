# Entornos de RPA Studio (`dev` y `prod`)

Este documento describe la arquitectura, las variables de entorno y los comandos de operación para los entornos de desarrollo (`dev`) y producción (`prod`) del monorepo **RPA Studio**.

---

## 1. Comparativa Dev vs Prod

| Aspecto | Desarrollo (`dev`) | Producción (`prod`) |
| --- | --- | --- |
| **Compose** | `docker-compose.yml` (Laravel Sail) | `docker-compose.prod.yml` |
| **Orquestador CLI** | `./dev` | `./prod` |
| **Plantilla de env** | `.env.dev.example` (alias `.env.example`) → `.env` | `.env.prod.example` → `.env.prod` |
| **Aislamiento Docker** | `COMPOSE_PROJECT_NAME=rpa-dev`, red `sail` | `COMPOSE_PROJECT_NAME=rpa-prod`, redes `rpa-prod-edge` + `rpa-prod-internal` |
| **Frontend (`apps/web`)** | `next dev` en el host (`:3000`) | Contenedor `web` (`next start`, `node:24-alpine`, usuario `node`) |
| **Runner (`apps/runner`)** | `tsx watch` en el host (`:8085`) | Contenedor `runner` (`node dist/index.js`, Playwright Chromium, `cap_drop: ALL`, `shm_size: 1gb`) |
| **API (`apps/api`)** | Contenedor Sail (`supervisord`: artisan serve, reverb, queue, scheduler, listen-events) | Contenedores separados por proceso: `api` (Nginx + PHP-FPM 8.4), `reverb`, `worker` (`horizon`), `events`, `scheduler` |
| **Reverse Proxy / TLS** | Sin proxy (puertos directos `:3000`, `:8000`, `:8080`, `:8085`) | `caddy:2-alpine` (`:80` / `:443` con HTTPS automático vía Let's Encrypt si se define dominio) |
| **BD / Redis / RustFS** | Puertos expuestos al host (`5432`, `6379`, `9000`, `9001`) | Solo en red `rpa-prod-internal` (`internal: true`), sin puertos publicados al host |
| **Telescope** | Activo en `APP_ENV=local` | No instalado en build (`--no-dev`) ni registrado fuera de `local` |

---

## 2. Topología de red y enrutamiento en Producción

```text
Internet ──HTTP/HTTPS (80/443)──> Caddy (rpa-prod-edge)
                                    ├── /api/*, /sanctum/*, /broadcasting/*, /up ──> api:8000 (Nginx + PHP-FPM)
                                    ├── /app/*                                   ──> reverb:8080
                                    ├── /live/ws/*                               ──> runner:8085
                                    └── /*                                       ──> web:3000 (Next.js)

Servicios internos (red rpa-prod-internal, internal: true, sin puertos externos):
  - pgsql (PostgreSQL 16)
  - redis (Redis 7 con contraseña)
  - rustfs (S3 compatible, consola deshabilitada)
```

- `api`, `reverb`, `worker`, `events`, `scheduler` y `runner` pertenecen a ambas redes (`rpa-prod-edge` y `rpa-prod-internal`) para comunicarse con los almacenes internos y realizar llamadas salientes (webhooks, LLMs, sitios web objetivo).
- `web` solo pertenece a `rpa-prod-edge` (SSR consulta a `API_INTERNAL_URL=http://api:8000`).
- Los artefactos (capturas/trazas en RustFS) se entregan al navegador mediante URLs firmadas temporalmente en `/api/v1/artifacts/{artifact}`, evitando exponer RustFS a Internet.

---

## 3. Operación de Desarrollo (`./dev`)

```bash
# 1. Inicializar .env desde .env.dev.example (solo si no existe .env)
./dev init

# 2. Levantar Sail + migrar + compilar @rpa/dsl y @rpa/locator + iniciar host (web, runner, testsite)
./dev start

# 3. Ver estado o logs
./dev status
./dev logs [web|runner|testsite|api|reverb|db|redis|storage|all]

# 4. Ejecutar artisan dentro de Sail
./dev artisan migrate

# 5. Detener todo
./dev stop
```

---

## 4. Operación de Producción (`./prod`)

### 4.1 Despliegue con dominio y HTTPS automático (recomendado)

```bash
# 1. Generar .env.prod con secretos criptográficos aleatorios y TLS automático
./prod init --domain rpa.tu-dominio.com

# 2. Editar .env.prod para añadir credenciales opcionales (ej. GEMINI_API_KEY)
#    Nota: no uses ${VAR} dentro de .env.prod; Docker Compose env_file no los interpola.

# 3. Compilar imágenes, esperar PostgreSQL, ejecutar migrate --force y levantar el stack
./prod deploy
```

### 4.2 Despliegue local o tras proxy externo en HTTP (`:80`)

```bash
./prod init
./prod deploy
```

> **Importante sobre Next.js (`NEXT_PUBLIC_*`)**: Las variables `NEXT_PUBLIC_*` se incrustan en el bundle cliente durante el build de `docker/web/Dockerfile`. Si modificas `APP_DOMAIN`, `NEXT_PUBLIC_API_URL` o `NEXT_PUBLIC_REVERB_*` en `.env.prod`, vuelve a compilar con `./prod build` (o `./prod deploy`).

### 4.3 Comandos disponibles en `./prod`

- `./prod init [--domain <dom>] [--env-file <ruta>] [--force]`: crea `.env.prod` con permisos `600` y secretos aleatorios (`APP_KEY`, `DB_PASSWORD`, `REDIS_PASSWORD`, `REVERB_APP_KEY/SECRET`, `S3_*`, `RUNNER_LIVE_TOKEN`, `RPA_INTERNAL_SECRET`, `RPA_SECRET_KEYS`).
- `./prod build`: compila las imágenes de `api`, `web` y `runner`.
- `./prod up` / `./prod start`: inicia base de datos/Redis/RustFS, ejecuta `php artisan migrate --force` y levanta todo el stack.
- `./prod deploy`: `build` + migraciones + `up -d --remove-orphans`.
- `./prod status`: muestra el estado y healthchecks de todos los contenedores.
- `./prod logs [servicio]`: muestra los logs en vivo.
- `./prod artisan <cmd>`: ejecuta Artisan dentro de `api` (bloquea `migrate:fresh`, `migrate:reset` y `db:wipe`).
- `./prod stop` / `./prod down`: detiene los contenedores **sin** eliminar volúmenes.
- `./prod config`: valida la sintaxis de `docker-compose.prod.yml`.

> Para usar un archivo de entorno distinto de `.env.prod`, exporta `PROD_ENV_FILE=/ruta/a/mi.env.prod`.

---

## 5. Checklist de seguridad y rotación de secretos

1. **No versionar secretos**: `.gitignore` ignora `.env` y `.env.*` (excepto las plantillas `.env*.example`).
2. **Keyring de secretos (`RPA_SECRET_KEYS`)**:
   - En producción `./prod init` genera una clave independiente de `APP_KEY` (`RPA_SECRET_ACTIVE_KEY=v1`, `RPA_SECRET_KEYS={"v1":"<32B base64>"}`).
   - Para rotar sin romper secretos existentes, añade `"v2"` al mapa JSON (`{"v1":"...","v2":"..."}`) y actualiza `RPA_SECRET_ACTIVE_KEY=v2`.
3. **Respaldos de base de datos y almacenamiento**:
   - Nunca ejecutes `docker compose down -v` ni `migrate:fresh` en producción.
   - Los datos persisten en los volúmenes `rpa-prod-pgsql-data`, `rpa-prod-redis-data`, `rpa-prod-storage-data`, `rpa-prod-api-storage` y los certificados TLS en `rpa-prod-caddy-data`.
