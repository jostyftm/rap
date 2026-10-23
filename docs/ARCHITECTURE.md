# RPA Studio — Arquitectura (v0)

## 1. Principio rector
La IA **crea y repara** recetas; la ejecución normal es **determinista, sin LLM**.

## 2. Monorepo
```
apps/api        Laravel (API, Reverb, Horizon, agentes laravel/ai)
apps/web        Next.js App Router + TS (UI, editor, consola)
apps/runner     Node + Playwright (ejecución, observación, grabadora remota)
apps/extension  Chrome MV3 (grabadora)
packages/dsl    JSON Schema de la receta (fuente única) + tipos TS + validador Zod generado
packages/locator  Puntuación de robustez + huella semántica (compartido runner/web)
testsite/       Sitio local para pruebas y evaluación de agentes
docker/ docs/ .github/
```
**Decisión:** el JSON Schema en `packages/dsl` es la fuente de verdad; Laravel valida con `opis/json-schema`, el frontend/runner con Zod generado desde el mismo schema (evita divergencias).

## 3. Diagrama
```
Next.js ──HTTP/WS──> Laravel (API + Reverb)
                       ├ Agentes (laravel/ai → LlmProvider → Gemini|OpenAI|Anthropic|Ollama)
                       ├ PostgreSQL
                       └ Redis (colas Horizon, streams, locks, cache, rate limit)
                            │  XADD rpa:cmd:{runner}      (Laravel → Runner)
                            │  XADD rpa:evt               (Runner → Laravel; consumer group)
                       Runner (Playwright, contexto efímero por ejecución)
                            └ MinIO/S3 (capturas, vídeo, trazas, descargas)
```

## 4. Protocolo Laravel ⇄ Runner (Redis Streams)
- Comandos: `run.start`, `run.pause|resume|stop|step`, `session.start`, `session.action` (acción decidida por BrowserAgent), `locator.test`, `record.start|stop`.
- Eventos: `run.step.started|finished|failed`, `log`, `screenshot` (ref S3), `observation` (estado de página), `needs.human`, `run.finished`.
- Idempotencia: cada mensaje lleva `id` ULID; el consumidor guarda último id procesado. Consumer groups + `XACK`; reintento de pendientes.
- **Bucle del agente:** runner emite `observation` → Job Laravel llama a `BrowserAgent` → `session.action` → runner ejecuta. Laravel mantiene los límites duros (pasos/tiempo/tokens/costo).
- **Secretos:** Laravel envía al runner solo referencias; el runner las descifra vía endpoint interno firmado (mTLS/HMAC, TTL corto) y sustituye `{{secret.x}}` al ejecutar. Logs y observaciones pasan por un redactor que enmascara esos valores.

## 5. DSL de la receta (resumen)
```jsonc
{ "schema": "rpa/v1", "variables": [...], "secrets": ["portal_password"],
  "entry": "n1",
  "nodes": { "n1": { "id":"n1","type":"navigate","params":{"url":"{{base_url}}"},
      "description":"…","timeout":30000,"onError":"retry",
      "retry":{"maxAttempts":3,"delayMs":1000,"backoff":"exponential"},
      "screenshot":"onError","locator":null,"next":"n2" } },
  "edges": [{"from":"n2","to":"n3","label":"then"}] }
```
- **Control de flujo por continuación**: `condition`, `loop` y `tryCatch` referencian sus ramas por id (`thenNodeId`/`elseNodeId`, `bodyEntryNodeId`, `tryEntryNodeId`/`catchEntryNodeId`/`finallyEntryNodeId`). Cada rama se ejecuta siguiendo `next` hasta el `next` del nodo de control (o hasta `null`); no se guardan listas explícitas de ids. Lienzo, lista y JSON son proyecciones del mismo grafo.
- **`retry` por nodo**: solo se aplica con `onError: "retry"`. `maxAttempts` 1–10 (por defecto 3), `delayMs` 0–60000 (1000), `backoff` `fixed`|`exponential` (exponencial). Los reintentos ocurren antes de propagar el error; `onError: "continue"` lo absorbe antes de llegar a un `tryCatch`.
- **Semántica de `tryCatch`**: captura `{ message, nodeId, type }` en `variables[errorVariable]` (por defecto `error`). `catch` solo corre si el bloque try falla; `finally` corre siempre salvo parada del usuario. Un fallo dentro de `catch` se propaga después de `finally`; `rethrow: true` relanza el error original tras catch y finally. Los logs de fase usan el contexto `{ scope: "tryCatch", phase: "try"|"catch"|"finally" }`.
- **Limitación conocida**: las ramas comparten la continuación del nodo de control. El validador rechaza solapamientos entre ramas, ciclos de `next`, reentradas al propio bloque y continuaciones que coinciden con el inicio de una rama.
- `locator`: `{ candidates:[{strategy,value,score}], fingerprint:{role,name,text,attrs,neighbors,container,relPos}, stats }`.
- Expresiones: **JSONata** (sin `eval`; librería madura en Node y PHP vía puerto en runner — la evaluación ocurre solo en el runner; Laravel solo valida sintaxis llamando al runner/paquete).
  *Justificación frente a CEL:* mejor soporte para transformar JSON y existe implementación JS oficial.
- Edición por NL → **JSON Patch (RFC 6902)** validado contra el schema resultante, mostrado como diff.
- Los bloques de IA llevan `budget` obligatorio y se marcan `deterministic:false`.

## 6. Localización y auto-reparación
Orden: testid/id/name → role+name → label/placeholder → texto → CSS → XPath → visión IA. Score 0–100 con penalizaciones (nth-child, clases hash, ids autogenerados, profundidad, posición). Unicidad y visibilidad verificadas antes de aceptar. Escalera de reparación: respaldos → huella semántica → visión → HealerAgent. Auto-aplicar solo si `confidence ≥ umbral` y paso **no destructivo** (clasificador por tipo de bloque + heurística de texto: enviar/pagar/borrar/confirmar). Cada parche crea nueva `recipe_version`.

## 7. IA (laravel/ai)
Verificado en la documentación oficial: agentes, tools, salida estructurada y múltiples proveedores existen en el SDK. Se implementará `LlmProvider` como fachada fina sobre el SDK (selección de proveedor/modelo por workspace/entorno, registro en `llm_calls`, cache, presupuesto). Antes de la Fase 2 se verificará con el SDK instalado la matriz exacta (visión, schema, Gemini) y se documentará en `docs/LLM_PROVIDERS.md`; si falta algo, adaptador propio.
Agentes: Planner, Browser, Compiler, Healer (+ `NlEditAgent` para parches; `LocatorVisionAgent`). Contenido de página siempre dentro de delimitadores `<untrusted_page_content>`; acciones validadas por esquema + dominios permitidos + SSRF.

## 8. Modelo de datos
Según lo solicitado (UUID público, `bigint` interno, soft deletes en workspaces/projects/recipes). Adiciones justificadas: `recipe_comments`, `locator_stats` (por paso/estrategia), `pairing_codes` (extensión), `recordings`, `secret_versions` (rotación de claves).

## 9. Seguridad (desde la Fase 0)
Policies por rol de workspace; rate limit Redis; cabeceras/CORS estrictos; SSRF en runner (resolución DNS validada, bloqueo RFC1918/link-local/metadata, redes Docker aisladas: runner solo sale a Internet y a Redis/Laravel interno por proxy); contenedor runner sin privilegios (`--cap-drop=ALL`, user no root, seccomp); cifrado de aplicación con keyring versionado (XChaCha20 vía libsodium).

## 10. Extras propuestos
- **JSONata** como lenguaje de expresiones (arriba).
- **Scramble** para OpenAPI (cero anotaciones).
- **Caddy** como proxy (TLS automático, config mínima).
- **pnpm workspaces + Turborepo** para el monorepo JS.

## 11. Riesgos / límites realistas
Es un producto de gran tamaño. Se entregará por fases, cada una verificable (`docker compose up`, tests, CI). Cada fase cierra con resumen: implementado, cómo probar, decisiones, pendientes.
