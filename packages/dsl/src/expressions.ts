import type { RecipeDsl } from "./types.js";

export interface EvaluationResult {
  value: unknown;
  resolvedStr: string;
  hasError: boolean;
  error?: string;
  missingTokens: string[];
  usedTokens: string[];
}

export interface AvailableToken {
  token: string;
  label: string;
  group: "steps" | "variables" | "webhook" | "secrets";
  nodeId?: string;
  dataType: string;
  preview?: unknown;
}

/**
 * Obtiene una propiedad anidada mediante notación de puntos o corchetes
 * Ejemplos: "user.name", "items[0].title", "data.total"
 */
export function getNestedValue(obj: unknown, path: string): unknown {
  if (obj === null || obj === undefined) return undefined;
  if (!path) return obj;

  const normalized = path.replace(/\[(\w+)\]/g, ".$1").replace(/^\./, "");
  const parts = normalized.split(".");

  let current: any = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

export interface ExpressionContext {
  definition?: RecipeDsl;
  nodeOutputs?: Record<string, unknown>;
  variables?: Record<string, unknown>;
  secrets?: Record<string, string>;
}

/**
 * Resuelve una cadena con interpolaciones {{ ... }}
 * Devuelve el valor final (o texto resultante), avisos de tokens faltantes y detalles de error.
 */
export function resolveExpression(
  expression: string,
  context: ExpressionContext = {}
): EvaluationResult {
  if (!expression || typeof expression !== "string") {
    return {
      value: expression,
      resolvedStr: String(expression ?? ""),
      hasError: false,
      missingTokens: [],
      usedTokens: [],
    };
  }

  const { definition, nodeOutputs = {}, variables = {}, secrets = {} } = context;

  // Variables globales del DSL como fallback
  const mergedVariables: Record<string, unknown> = { ...variables };
  if (definition?.variables) {
    for (const v of definition.variables) {
      if (mergedVariables[v.name] === undefined && v.defaultValue !== undefined) {
        mergedVariables[v.name] = v.defaultValue;
      }
    }
  }

  const tokenRegex = /\{\{([^{}]+)\}\}/g;
  const matches = Array.from(expression.matchAll(tokenRegex));

  if (matches.length === 0) {
    return {
      value: expression,
      resolvedStr: expression,
      hasError: false,
      missingTokens: [],
      usedTokens: [],
    };
  }

  const missingTokens: string[] = [];
  const usedTokens: string[] = [];

  // Si la expresión es exactamente un único token, ej: "{{steps.node_1.output.items}}"
  const isSingleExactToken = matches.length === 1 && matches[0][0].trim() === expression.trim();

  let singleExactValue: unknown = undefined;

  const resolvedStr = expression.replace(tokenRegex, (_, rawToken) => {
    const token = rawToken.trim();
    usedTokens.push(token);

    let resolvedVal: unknown = undefined;
    let found = false;

    // 1. Secretos: {{secret.API_KEY}}
    if (token.startsWith("secret.")) {
      const secKey = token.slice("secret.".length);
      if (secrets[secKey] !== undefined) {
        resolvedVal = secrets[secKey];
        found = true;
      }
    }
    // 2. Salidas de Pasos: {{steps.<nodeId>.output}} o {{steps.<nodeId>.output.campo}}
    else if (token.startsWith("steps.")) {
      const rest = token.slice("steps.".length);
      const parts = rest.split(".");
      const stepId = parts[0];
      const fieldPath = parts.slice(1).join(".");

      const stepOut = nodeOutputs[stepId];
      if (stepOut !== undefined) {
        if (!fieldPath || fieldPath === "output") {
          resolvedVal = stepOut;
          found = true;
        } else {
          const cleanPath = fieldPath.startsWith("output.")
            ? fieldPath.slice("output.".length)
            : fieldPath;
          resolvedVal = getNestedValue(stepOut, cleanPath);
          found = resolvedVal !== undefined;
        }
      }
    }
    // 3. Webhook: {{webhook.body}}, {{webhook.query.param}}, etc.
    else if (token.startsWith("webhook.")) {
      const webhookSubPath = token.slice("webhook.".length);
      // Buscar el nodo webhook en la receta
      const webhookNode = Object.values(definition?.nodes || {}).find((n) => n.type === "webhook");
      const webhookOutput = webhookNode ? nodeOutputs[webhookNode.id] : undefined;

      if (webhookOutput && typeof webhookOutput === "object") {
        resolvedVal = getNestedValue(webhookOutput, webhookSubPath);
        found = resolvedVal !== undefined;
      }
    }
    // 4. Variables globales: {{variables.nombre}} o {{nombre}}
    else if (token.startsWith("variables.")) {
      const varKey = token.slice("variables.".length);
      resolvedVal = getNestedValue(mergedVariables, varKey);
      found = resolvedVal !== undefined;
    } else {
      // Intento directo en variables o en outputs
      if (token in mergedVariables) {
        resolvedVal = mergedVariables[token];
        found = true;
      } else if (token in nodeOutputs) {
        resolvedVal = nodeOutputs[token];
        found = true;
      } else {
        resolvedVal = getNestedValue(mergedVariables, token);
        found = resolvedVal !== undefined;
      }
    }

    if (!found) {
      missingTokens.push(token);
      return `{{${token}}}`;
    }

    if (isSingleExactToken) {
      singleExactValue = resolvedVal;
    }

    if (typeof resolvedVal === "object" && resolvedVal !== null) {
      return JSON.stringify(resolvedVal);
    }
    return String(resolvedVal ?? "");
  });

  const finalValue = isSingleExactToken && missingTokens.length === 0 ? singleExactValue : resolvedStr;

  return {
    value: finalValue,
    resolvedStr,
    hasError: missingTokens.length > 0,
    error:
      missingTokens.length > 0
        ? `Variable(s) no encontradas o sin ejecutar: ${missingTokens.join(", ")}`
        : undefined,
    missingTokens,
    usedTokens,
  };
}

/**
 * Obtiene la lista completa de tokens disponibles para autocompletado y selección
 */
export function getAvailableExpressionTokens(
  definition?: RecipeDsl,
  excludeNodeId?: string,
  nodeOutputs: Record<string, unknown> = {}
): AvailableToken[] {
  const result: AvailableToken[] = [];
  if (!definition) return result;

  // 1. Salidas de Pasos
  const nodes = Object.values(definition.nodes || {});
  for (const node of nodes) {
    if (node.id === excludeNodeId) continue;
    const output = nodeOutputs[node.id];

    // Token base del nodo
    result.push({
      token: `{{steps.${node.id}.output}}`,
      label: `${node.description || node.id} (Salida completa)`,
      group: "steps",
      nodeId: node.id,
      dataType: typeof output === "object" ? (Array.isArray(output) ? "array" : "object") : typeof output,
      preview: output,
    });

    // Si el output es un objeto, listar propiedades de primer nivel
    if (output && typeof output === "object" && !Array.isArray(output)) {
      for (const [key, val] of Object.entries(output)) {
        result.push({
          token: `{{steps.${node.id}.output.${key}}}`,
          label: `${node.id}.${key}`,
          group: "steps",
          nodeId: node.id,
          dataType: typeof val === "object" ? (Array.isArray(val) ? "array" : "object") : typeof val,
          preview: val,
        });
      }
    }
  }

  // 2. Webhook payloads
  const webhookNode = nodes.find((n) => n.type === "webhook");
  if (webhookNode) {
    const whOut: any = nodeOutputs[webhookNode.id];
    result.push(
      {
        token: "{{webhook.body}}",
        label: "webhook.body (Cuerpo HTTP)",
        group: "webhook",
        nodeId: webhookNode.id,
        dataType: "object",
        preview: whOut?.body,
      },
      {
        token: "{{webhook.query}}",
        label: "webhook.query (Query Params)",
        group: "webhook",
        nodeId: webhookNode.id,
        dataType: "object",
        preview: whOut?.query,
      },
      {
        token: "{{webhook.headers}}",
        label: "webhook.headers (Cabeceras HTTP)",
        group: "webhook",
        nodeId: webhookNode.id,
        dataType: "object",
        preview: whOut?.headers,
      }
    );
  }

  // 3. Variables Globales
  for (const v of definition.variables || []) {
    result.push({
      token: `{{variables.${v.name}}}`,
      label: `variables.${v.name}`,
      group: "variables",
      dataType: v.type,
      preview: v.defaultValue,
    });
  }

  // 4. Secretos
  for (const sec of definition.secrets || []) {
    result.push({
      token: `{{secret.${sec}}}`,
      label: `secret.${sec}`,
      group: "secrets",
      dataType: "string",
      preview: "••••••••",
    });
  }

  return result;
}
