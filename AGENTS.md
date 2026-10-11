# RPA Studio — Directrices para Agentes y Desarrolladores

## 1. Arquitectura del Monorepo
El repositorio utiliza `pnpm workspaces` y `turborepo`:
- `packages/dsl`: Esquemas Zod, tipos de receta, validación y compilador Playwright.
- `packages/locator`: Motor de selectores heurísticos y puntuación de elementos.
- `apps/web`: Aplicación Next.js (App Router con Turbopack) para el editor visual de recetas.
- `apps/runner`: Motor de ejecución en Playwright conectado por WebSockets y Redis.

---

## 2. Reglas de Sincronización y Compilación (Obligatorio)

### 2.1 Paquetes compartidos (`@rpa/dsl` y `@rpa/locator`)
1. **Compilación automática en desarrollo (`predev` y `prebuild`)**:
   `apps/web` y `apps/runner` tienen hooks `predev` configurados para compilar automáticamente `@rpa/dsl` y `@rpa/locator`.
2. **Turbopack y Transpilación en Vivo**:
   `apps/web/next.config.ts` utiliza `transpilePackages: ["@rpa/dsl", "@rpa/locator"]` y `apps/web/tsconfig.json` mapea `@rpa/dsl` directamente al código fuente TypeScript.
3. **Compilación de paquetes tras cambios**:
   Siempre que se agregue o modifique un tipo de nodo, esquema o validador en `packages/dsl` o `packages/locator`, se debe ejecutar:
   ```bash
   pnpm --filter @rpa/dsl build
   pnpm --filter @rpa/locator build
   ```

---

## 3. Paridad de Esquemas y Nodos (Regla Crítica)

1. **Paridad UI ↔ DSL ↔ Zod**:
   - Todo nuevo bloque registrado en `apps/web/src/components/editor/nodes/` DEBE tener su respectivo esquema en `packages/dsl/src/validator.ts` y estar incluido en el discriminador `RecipeNodeSchema = z.discriminatedUnion("type", [...])`.
   - La suite de tests `packages/dsl/test/schema-parity.test.ts` valida automáticamente que todos los 11 tipos de nodos reconocidos por la UI pasen la validación Zod sin errores de discriminador.
2. **Ejecutar tests antes de finalizar cualquier tarea**:
   ```bash
   pnpm --filter @rpa/dsl test
   ```

---

## 4. Gestión de Base de Datos y Servicios Locales

1. **Prohibido `migrate:fresh`**:
   Bajo ninguna circunstancia se debe ejecutar `migrate:fresh` o comandos que destruyan datos o tablas existentes. Usar siempre `migrate`.
2. **Script orquestador `./dev`**:
   - Iniciar entorno: `./dev start`
   - Detener entorno: `./dev stop`
   - Ver estado: `./dev status`
