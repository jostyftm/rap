import type { ExecutionContext } from "./types.js";

const MAX_KEYS_IN_MESSAGE = 12;

/**
 * Lista las claves consultables del contexto de ejecución para ayudar a
 * diagnosticar tokens `{{...}}` mal escritos o referencias a pasos sin salida.
 */
export function describeAvailableKeys(variables: Record<string, unknown>): string[] {
  const keys = new Set<string>();

  for (const [key, value] of Object.entries(variables)) {
    if (key === "steps" || key === "loop") continue;
    keys.add(key);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const child of Object.keys(value as Record<string, unknown>)) {
        keys.add(`${key}.${child}`);
      }
    }
  }

  const steps = variables.steps;
  if (steps && typeof steps === "object" && !Array.isArray(steps)) {
    for (const nodeId of Object.keys(steps as Record<string, unknown>)) {
      keys.add(`steps.${nodeId}.output`);
    }
  }

  return Array.from(keys).sort();
}

/**
 * Crea el callback que `interpolateString` invoca cuando deja tokens sin
 * resolver, registrando un aviso en el log del run con las claves disponibles.
 */
export function createMissingTokenReporter(
  nodeId: string,
  nodeType: string,
  ctx: ExecutionContext
): (tokens: string[]) => void {
  return (tokens) => {
    if (!ctx.warn || tokens.length === 0) return;

    const available = describeAvailableKeys(ctx.variables);
    const shown = available.slice(0, MAX_KEYS_IN_MESSAGE);
    const suffix =
      available.length > shown.length ? `, … (+${available.length - shown.length} más)` : "";
    const hint =
      shown.length > 0
        ? `Claves disponibles: ${shown.join(", ")}${suffix}.`
        : "No hay variables disponibles todavía. Ejecuta un paso que genere salida (webhook, extract, setVariable).";

    ctx.warn(
      `Paso [${nodeId}] (${nodeType}): no se pudo resolver ${tokens
        .map((token) => `{{${token}}}`)
        .join(", ")}. ${hint}`,
      {
        node_id: nodeId,
        node_type: nodeType,
        missing_tokens: tokens,
        available_keys: available,
      }
    );
  };
}
