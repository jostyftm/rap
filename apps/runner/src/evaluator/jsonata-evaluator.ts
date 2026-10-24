import jsonata from "jsonata";

export async function evaluateExpression(
  expressionStr: string,
  context: Record<string, unknown>
): Promise<unknown> {
  try {
    const expr = jsonata(expressionStr);
    const result = await expr.evaluate(context);
    // Si JSONata retorna una secuencia interna con propiedad 'sequence: true', normalizar a arreglo plano
    if (Array.isArray(result)) {
      return Array.from(result);
    }
    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Error evaluando expresión JSONata '${expressionStr}': ${message}`);
  }
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  if (path in obj) return obj[path];
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function interpolateString(
  template: string,
  variables: Record<string, unknown>,
  secrets: Record<string, string> = {}
): string {
  return template.replace(/\{\{([^{}]+)\}\}/g, (_, rawKey) => {
    const key = rawKey.trim();
    if (key.startsWith("secret.")) {
      const secretName = key.replace("secret.", "");
      return secrets[secretName] ?? `[SECRET_NOT_FOUND: ${secretName}]`;
    }

    // Direct match
    if (key in variables) {
      const val = variables[key];
      return typeof val === "object" && val !== null ? JSON.stringify(val) : String(val ?? "");
    }

    // If starts with "variables."
    if (key.startsWith("variables.")) {
      const varKey = key.slice("variables.".length);
      const val = getNestedValue(variables, varKey);
      if (val !== undefined) {
        return typeof val === "object" && val !== null ? JSON.stringify(val) : String(val);
      }
    }

    // Soporte para steps.<nodeId>.output.<path> o steps.<nodeId>.<path>
    if (key.startsWith("steps.")) {
      const rest = key.slice("steps.".length);
      const parts = rest.split(".");
      const stepId = parts[0];
      const fieldPath = parts.slice(1).join(".");

      const stepsObj = variables.steps as Record<string, unknown> | undefined;
      const stepItem = stepsObj?.[stepId] as Record<string, unknown> | undefined;
      const stepOut =
        stepItem?.output !== undefined
          ? stepItem.output
          : (variables[`steps.${stepId}.output`] ?? stepItem);

      if (stepOut !== undefined) {
        if (!fieldPath || fieldPath === "output") {
          return typeof stepOut === "object" && stepOut !== null ? JSON.stringify(stepOut) : String(stepOut);
        }
        const cleanPath = fieldPath.startsWith("output.") ? fieldPath.slice("output.".length) : fieldPath;
        const resolved = getNestedValue(
          typeof stepOut === "object" && stepOut !== null ? (stepOut as Record<string, unknown>) : {},
          cleanPath
        );
        if (resolved !== undefined) {
          return typeof resolved === "object" && resolved !== null ? JSON.stringify(resolved) : String(resolved);
        }
      }
    }

    // Nested dot path search
    const nested = getNestedValue(variables, key);
    if (nested !== undefined) {
      return typeof nested === "object" && nested !== null ? JSON.stringify(nested) : String(nested);
    }

    return `{{${key}}}`;
  });
}

