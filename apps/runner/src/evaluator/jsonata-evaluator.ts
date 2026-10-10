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
    const val = variables[key];
    return val !== undefined ? String(val) : `{{${key}}}`;
  });
}
