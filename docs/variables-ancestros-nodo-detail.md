# Disponibilidad de Variables de Salida de Nodos Ancestros en el Editor

## 1. Resumen Ejecutivo

Anteriormente, al abrir el modal de edición de un nodo, el panel izquierdo de **"Entrada de Datos"** solo mostraba las variables del nodo predecesor inmediato directo (`e.to === currentNodeId`). Si un flujo iniciaba con un trigger como un **Webhook** en el Paso 1, sus datos no se encontraban accesibles en los Pasos 4, 6 o posteriores a menos que estuvieran inmediatamente antes.

Con esta actualización, el panel de Entrada de Datos implementa resolución completa de **nodos ancestros (upstream)** en la topología del grafo. Todas las salidas generadas en cualquier paso previo del flujo están permanentemente disponibles para inspeccionarse, arrastrarse e insertarse en cualquier nodo downstream.

---

## 2. Arquitectura de Resolución de Ancestros

La función `resolveAncestorNodes` en `apps/web/src/components/editor/detail/input-data-panel.tsx` opera de la siguiente manera:

1. **Construcción del Grafo de Flujo**:
   - Mapea las aristas explícitas de `definition.edges`.
   - Incluye las conexiones implícitas de control de flujo:
     - Puntero estándar `node.next`.
     - Ramas de bifurcación condicional: `condition.params.thenNodeId` y `elseNodeId`.
     - Bucles: `loop.params.bodyEntryNodeId`.
     - Bloques de excepción: `tryCatch.params.tryEntryNodeId`, `catchEntryNodeId` y `finallyEntryNodeId`.

2. **Travesía en Reversa (Backward BFS)**:
   - Partiendo de `currentNodeId`, recorre hacia atrás todos los nodos que conducen a él directa o indirectamente.
   - Previene ciclos mediante un conjunto de nodos visitados.

3. **Garantía para Nodos Inicializadores / Webhook**:
   - Todo nodo con rol de disparador o inicializador (`type === "webhook"`, `isInitializer === true` o `definition.entry`) se preserva como fuente disponible siempre que pertenezca a la receta y no sea el nodo actualmente en edición.

4. **Ordenamiento Topológico Cronológico**:
   - Los ancestros identificados se ordenan desde el punto de entrada de la receta (`definition.entry`) hacia adelante hasta el predecesor inmediato.
   - En la interfaz se presentan como:
     - `Paso 1: Webhook (webhook_1)`
     - `Paso 2: Navegar a Login (navigate_2)`
     - `Paso 3: Extraer Token (extract_3)`
     - `[Nodo en Edición]: Enviar Petición (node_4)`

---

## 3. Experiencia de Usuario (UI/UX)

El panel izquierdo de Entrada de Datos cuenta con:

1. **Selector Dropdown con Recuento y Estado**:
   - Opción global: `★ Todas las variables (N pasos)`.
   - Opciones individuales numeradas con indicador de ejecución: `✓ Con datos` o `○ Sin ejecutar`.
2. **Pastillas Rápidas (Chips)**:
   - Barra horizontal debajo del selector que permite cambiar entre `Todas` y pasos específicos con 1 solo clic.
   - Iconos distintivos (ej. icono de webhook para pasos tipo webhook) y puntos de estado verde cuando hay datos listos.
3. **Visor de Datos Multimodal (`DataViewer`)**:
   - **Schema**: Árbol jerárquico expandible con badges de tipo de dato (`string`, `number`, `boolean`, `array`, `object`) y agarraderas (`GripVertical`) para arrastrar la variable directamente a cualquier campo o expresión.
   - **Table**: Vista tabular de arreglos u objetos para lectura estructurada.
   - **JSON**: Visor de código JSON crudo con botón de copiado rápido al portapapeles.
4. **Banner Contextual de Ayuda para Webhooks**:
   - Cuando se selecciona un paso Webhook, se expone un banner informativo con el atajo global `{{webhook.body}}` y un botón de copiado o inserción instantánea.
5. **Ejecución Asíncrona de Pasos Previos**:
   - Si un nodo previo aún no se ha ejecutado en la sesión de prueba, el panel muestra un botón interactivo **"Ejecutar [nodeId]"**, permitiendo capturar datos en tiempo real sin salir del modal de edición.
6. **Soporte Completo Modo Claro y Oscuro**:
   - Adaptación de paletas mediante clases Tailwind `dark:`, garantizando contraste óptimo de textos, badges, botones y bordes en ambos temas.

---

## 4. Sintaxis de Expresiones y Tokens Interpolados

El sistema es 100% compatible con múltiples formatos de interpolación:

| Formato | Ejemplo | Soporte DSL | Soporte Runner |
| :--- | :--- | :---: | :---: |
| **Estándar de Paso** | `{{steps.webhook_1.output.body.email}}` | Soportado | Soportado |
| **Directo de Paso** | `{{steps.webhook_1.body.email}}` | Soportado | Soportado |
| **Salida Completa de Paso** | `{{steps.extract_1.output}}` | Soportado | Soportado |
| **Atajo Global Webhook** | `{{webhook.body.email}}` | Soportado | Soportado |
| **Variables Globales** | `{{variables.miVariable}}` o `{{miVariable}}` | Soportado | Soportado |
| **Secretos** | `{{secret.API_KEY}}` | Soportado | Soportado |

---

## 5. Verificación y Pruebas

Se ejecutaron las siguientes suites de pruebas de forma exitosa:
- **DSL (`packages/dsl`)**: 61 pruebas unitarias pasando (`validator.test.ts`, `expressions.test.ts`, `schema-parity.test.ts`, `playwright-exporter.test.ts`, `initializer.test.ts`).
- **Runner (`apps/runner`)**: 45 pruebas pasando, incluyendo las pruebas de interpolación y evaluación JSONata (`jsonata-evaluator.test.ts`).
- **Web (`apps/web`)**: Verificación de tipos TypeScript (`tsc --noEmit`) y análisis estático ESLint con 0 errores y 0 advertencias.
