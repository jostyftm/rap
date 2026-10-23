import type { RecipeDsl } from "@rpa/dsl";

/**
 * DSL inicial de una receta nueva.
 *
 * Fuente única de verdad: se usa tanto para inicializar el store del editor
 * como para enviar el `definition` obligatorio al crear una receta en el
 * backend. No debe mutarse directamente; usa `createInitialDefinition()`.
 */
export const DEFAULT_INITIAL_DSL: RecipeDsl = {
  schema: "rpa/v1",
  name: "Nueva Receta RPA",
  entry: "step_navigate",
  variables: [],
  nodes: {
    step_navigate: {
      id: "step_navigate",
      type: "navigate",
      description: "Navegar a la página web",
      params: { url: "https://example.com", waitUntil: "domcontentloaded" },
      next: "step_click",
    },
    step_click: {
      id: "step_click",
      type: "click",
      description: "Hacer clic en el botón principal",
      locator: {
        primary: { strategy: "role", value: "button[name='More information...']", score: 90 },
        fallbacks: [
          { strategy: "css", value: "a[href*='iana.org']", score: 70 },
        ],
      },
      params: { button: "left" },
    },
  },
  edges: [{ from: "step_navigate", to: "step_click" }],
};

/**
 * Devuelve una copia profunda del DSL inicial para evitar compartir
 * referencias mutables entre recetas o con el store.
 */
export function createInitialDefinition(name?: string): RecipeDsl {
  const clone = JSON.parse(JSON.stringify(DEFAULT_INITIAL_DSL)) as RecipeDsl;
  if (name && name.trim()) {
    clone.name = name.trim();
  }
  return clone;
}
