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

function walkPath(source: unknown, path: string): unknown {
  if (!path) return source;
  let current: unknown = source;
  for (const part of path.split(".")) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Cuando una plantilla consiste en un único token `{{...}}`, resuelve el valor
 * nativo del contexto (objeto, arreglo, número o booleano) sin convertirlo a string.
 */
export function resolveSingleTokenValue(
  template: string,
  ctx: ExecutionContext
): { isSingleToken: boolean; found: boolean; value: unknown } {
  const match = template.trim().match(/^\{\{([^{}]+)\}\}$/);
  if (!match) {
    return { isSingleToken: false, found: false, value: undefined };
  }

  const key = match[1].trim();
  if (key.startsWith("secret.")) {
    const secretName = key.slice("secret.".length);
    const found = Object.prototype.hasOwnProperty.call(ctx.secrets, secretName);
    return { isSingleToken: true, found, value: ctx.secrets[secretName] };
  }

  if (Object.prototype.hasOwnProperty.call(ctx.variables, key)) {
    return { isSingleToken: true, found: true, value: ctx.variables[key] };
  }

  if (key.startsWith("variables.")) {
    const subPath = key.slice("variables.".length);
    const val = walkPath(ctx.variables, subPath);
    return { isSingleToken: true, found: val !== undefined, value: val };
  }

  if (key.startsWith("steps.")) {
    const rest = key.slice("steps.".length);
    const parts = rest.split(".");
    const stepId = parts[0];
    const fieldPath = parts.slice(1).join(".");
    const stepOut =
      ctx.stepResults[stepId] !== undefined
        ? ctx.stepResults[stepId]
        : (ctx.variables.steps as Record<string, Record<string, unknown>> | undefined)?.[stepId]?.output ??
          ctx.variables[`steps.${stepId}.output`];

    if (stepOut !== undefined) {
      if (!fieldPath || fieldPath === "output") {
        return { isSingleToken: true, found: true, value: stepOut };
      }
      const cleanPath = fieldPath.startsWith("output.")
        ? fieldPath.slice("output.".length)
        : fieldPath;
      const val = walkPath(stepOut, cleanPath);
      return { isSingleToken: true, found: val !== undefined, value: val };
    }
    return { isSingleToken: true, found: false, value: undefined };
  }

  const nested = walkPath(ctx.variables, key);
  return { isSingleToken: true, found: nested !== undefined, value: nested };
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
        : "No hay variables disponibles todavía. Ejecuta un paso que genere salida (webhook, httpRequest, extract, setVariable, javascript).";

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
