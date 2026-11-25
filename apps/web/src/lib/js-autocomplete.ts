import type { Completion, CompletionContext, CompletionResult, CompletionSource } from "@codemirror/autocomplete";
import { snippetCompletion } from "@codemirror/autocomplete";
import type { RecipeDsl } from "@rpa/dsl";

export interface JsAutocompleteContext {
  definition: RecipeDsl;
  currentNodeId?: string;
  nodeOutputs: Record<string, unknown>;
  webhookPayload?: object | null;
  mode: "sandbox" | "browser";
}

export interface AvailableVariableEntry {
  name: string;
  type: string;
  source: string;
  preview?: unknown;
}

const DEFAULT_WEBHOOK_SHAPE: Record<string, unknown> = {
  method: "POST",
  path: "/api/v1/webhooks/webhook",
  headers: { "content-type": "application/json" },
  query: {},
  params: {},
  body: {},
  timestamp: "",
};

const MAX_PROPERTY_SUGGESTIONS = 40;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function previewType(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (typeof value === "object") return "Object";
  if (typeof value === "string") {
    return value.length > 28 ? `"${value.slice(0, 25)}..."` : JSON.stringify(value);
  }
  return String(value);
}

export function collectAvailableVariables(
  definition: RecipeDsl,
  nodeOutputs: Record<string, unknown> = {},
  webhookPayload?: object | null
): AvailableVariableEntry[] {
  const map = new Map<string, AvailableVariableEntry>();

  for (const v of definition.variables || []) {
    map.set(v.name, {
      name: v.name,
      type: v.type,
      source: "global",
      preview: v.defaultValue,
    });
  }

  for (const node of Object.values(definition.nodes || {})) {
    if (node.type === "setVariable" && node.params?.name) {
      map.set(node.params.name, {
        name: node.params.name,
        type: "variable",
        source: node.id,
        preview: nodeOutputs[node.id],
      });
    } else if (node.type === "extract" && node.params?.variable) {
      map.set(node.params.variable, {
        name: node.params.variable,
        type: "extracted",
        source: node.id,
        preview: nodeOutputs[node.id],
      });
    } else if (node.type === "webhook") {
      const varName = node.params?.outputVariable || "webhook";
      map.set(varName, {
        name: varName,
        type: "webhook",
        source: node.id,
        preview: nodeOutputs[node.id] ?? webhookPayload ?? DEFAULT_WEBHOOK_SHAPE,
      });
    } else if (node.type === "javascript" && node.params?.outputVariable?.trim()) {
      const varName = node.params.outputVariable.trim();
      map.set(varName, {
        name: varName,
        type: "js",
        source: node.id,
        preview: nodeOutputs[node.id],
      });
    } else if (node.type === "httpRequest" && node.params?.outputVariable?.trim()) {
      const varName = node.params.outputVariable.trim();
      map.set(varName, {
        name: varName,
        type: "http",
        source: node.id,
        preview: nodeOutputs[node.id] ?? {
          status: 200,
          statusText: "OK",
          ok: true,
          url: node.params.url || "https://",
          headers: {},
          contentType: "application/json",
          responseType: node.params.responseType || "auto",
          data: {},
          durationMs: 0,
        },
      });
    }
  }

  return Array.from(map.values());
}

function resolveStepOutputSample(nodeId: string, ctx: JsAutocompleteContext): unknown {
  if (Object.prototype.hasOwnProperty.call(ctx.nodeOutputs, nodeId) && ctx.nodeOutputs[nodeId] !== undefined) {
    return ctx.nodeOutputs[nodeId];
  }

  const node = ctx.definition?.nodes?.[nodeId];
  if (!node) return undefined;

  if (node.type === "webhook") {
    return ctx.webhookPayload ?? DEFAULT_WEBHOOK_SHAPE;
  }
  if (node.type === "navigate") {
    return { url: "https://", title: "" };
  }
  if (node.type === "tryCatch") {
    return { caught: false, error: null };
  }
  if (node.type === "loop") {
    return { iterations: 0, truncated: false };
  }
  if (node.type === "screenshot") {
    return {
      url: "http://127.0.0.1:9000/rpa-artifacts/runs/run_1/screenshots/capture.png",
      s3Url: "http://127.0.0.1:9000/rpa-artifacts/runs/run_1/screenshots/capture.png",
      s3Key: "runs/run_1/screenshots/capture.png",
      bucket: "rpa-artifacts",
      contentType: "image/png",
      sizeBytes: 0,
      uploaded: true,
    };
  }
  if (node.type === "httpRequest") {
    return {
      status: 200,
      statusText: "OK",
      ok: true,
      url: node.params?.url || "https://",
      headers: {},
      contentType: "application/json",
      responseType: node.params?.responseType || "auto",
      data: {},
      durationMs: 0,
    };
  }
  if (node.type === "respond") {
    return {
      responseType: node.params?.responseType || "json",
      statusCode: node.params?.statusCode ?? 200,
      contentType: node.params?.contentType || "application/json",
      headers: {},
      bodyPreview: "",
    };
  }

  return undefined;
}

function walkPath(root: unknown, segments: string[]): unknown {
  let current: unknown = root;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const idx = Number(segment);
      if (!Number.isInteger(idx) || idx < 0 || idx >= current.length) return undefined;
      current = current[idx];
      continue;
    }
    if (typeof current === "object") {
      current = (current as Record<string, unknown>)[segment];
      continue;
    }
    return undefined;
  }
  return current;
}

const ARRAY_METHODS: Completion[] = [
  { label: "length", type: "property", detail: "number", info: "Cantidad de elementos" },
  { label: "map", type: "method", detail: "(fn) => Array", info: "Transforma cada elemento" },
  { label: "filter", type: "method", detail: "(fn) => Array", info: "Filtra elementos según condición" },
  { label: "find", type: "method", detail: "(fn) => item", info: "Busca el primer elemento coincidente" },
  { label: "reduce", type: "method", detail: "(fn, init) => any", info: "Acumula en un único resultado" },
  { label: "some", type: "method", detail: "(fn) => boolean", info: "Comprueba si alguno cumple" },
  { label: "every", type: "method", detail: "(fn) => boolean", info: "Comprueba si todos cumplen" },
  { label: "slice", type: "method", detail: "(start, end) => Array", info: "Extrae una porción" },
  { label: "join", type: "method", detail: "(sep) => string", info: "Une los elementos en texto" },
];

function resolveObjectProperties(target: unknown): Completion[] {
  if (Array.isArray(target)) {
    return ARRAY_METHODS;
  }

  if (!isRecord(target)) {
    return [];
  }

  return Object.entries(target)
    .slice(0, MAX_PROPERTY_SUGGESTIONS)
    .map(([key, val]) => ({
      label: key,
      type: typeof val === "function" ? "method" : "property",
      detail: previewType(val),
    }));
}

const STATIC_MEMBER_COMPLETIONS: Record<string, Completion[]> = {
  console: [
    { label: "log", type: "method", info: "Registra un mensaje informativo en la consola de ejecución" },
    { label: "info", type: "method", info: "Registra información en el log" },
    { label: "warn", type: "method", info: "Registra una advertencia en el log" },
    { label: "error", type: "method", info: "Registra un error en el log sin detener si se captura" },
  ],
  JSON: [
    { label: "parse", type: "method", detail: "(text) => any", info: "Convierte una cadena JSON en objeto" },
    { label: "stringify", type: "method", detail: "(value) => string", info: "Serializa un valor a JSON" },
  ],
  Object: [
    { label: "keys", type: "method", detail: "(obj) => string[]" },
    { label: "values", type: "method", detail: "(obj) => any[]" },
    { label: "entries", type: "method", detail: "(obj) => [k, v][]" },
    { label: "fromEntries", type: "method", detail: "(entries) => object" },
    { label: "assign", type: "method", detail: "(target, ...src) => object" },
  ],
  Array: [
    { label: "isArray", type: "method", detail: "(val) => boolean" },
    { label: "from", type: "method", detail: "(iterable) => Array" },
  ],
  Math: [
    { label: "round", type: "method", detail: "(x) => number" },
    { label: "floor", type: "method", detail: "(x) => number" },
    { label: "ceil", type: "method", detail: "(x) => number" },
    { label: "max", type: "method", detail: "(...nums) => number" },
    { label: "min", type: "method", detail: "(...nums) => number" },
    { label: "abs", type: "method", detail: "(x) => number" },
    { label: "random", type: "method", detail: "() => number" },
  ],
};

const BROWSER_MEMBER_COMPLETIONS: Record<string, Completion[]> = {
  document: [
    { label: "querySelector", type: "method", detail: "(selector) => Element | null", info: "Primer elemento que coincide con el selector CSS" },
    { label: "querySelectorAll", type: "method", detail: "(selector) => NodeList", info: "Todos los elementos que coinciden con el selector CSS" },
    { label: "getElementById", type: "method", detail: "(id) => Element | null" },
    { label: "title", type: "property", detail: "string", info: "Título de la pestaña actual" },
    { label: "body", type: "property", detail: "HTMLElement" },
    { label: "URL", type: "property", detail: "string", info: "URL actual del documento" },
    { label: "cookie", type: "property", detail: "string" },
    { label: "createElement", type: "method", detail: "(tag) => Element" },
  ],
  window: [
    { label: "location", type: "property", detail: "Location" },
    { label: "scrollTo", type: "method", detail: "(x, y) => void" },
    { label: "scrollBy", type: "method", detail: "(x, y) => void" },
    { label: "innerWidth", type: "property", detail: "number" },
    { label: "innerHeight", type: "property", detail: "number" },
    { label: "localStorage", type: "property", detail: "Storage" },
    { label: "sessionStorage", type: "property", detail: "Storage" },
  ],
};

const SANDBOX_ROOT_COMPLETIONS: Completion[] = [
  { label: "variables", type: "variable", detail: "Contexto", info: "Variables globales y asignadas por pasos previos", boost: 95 },
  { label: "steps", type: "variable", detail: "Contexto", info: "Salidas de los pasos ejecutados (steps.<id>.output)", boost: 95 },
  { label: "input", type: "variable", detail: "Contexto", info: "Parámetros iniciales del run y payload de webhook", boost: 92 },
  { label: "setVariable", type: "function", detail: "(name, val) => void", info: "Asigna una variable en el flujo para pasos posteriores", boost: 90 },
  { label: "console", type: "namespace", detail: "Logger", info: "Envía logs a la consola de ejecución de RPA Studio", boost: 85 },
  { label: "JSON", type: "namespace", info: "JSON.parse / JSON.stringify" },
  { label: "Math", type: "namespace" },
  { label: "Date", type: "class" },
  { label: "Object", type: "namespace" },
  { label: "Array", type: "class" },
  { label: "Promise", type: "class" },
  { label: "RegExp", type: "class" },
  { label: "URL", type: "class" },
  { label: "URLSearchParams", type: "class" },
];

const BROWSER_ROOT_COMPLETIONS: Completion[] = [
  { label: "document", type: "variable", detail: "DOM", info: "Documento HTML actual de la página en Playwright", boost: 94 },
  { label: "window", type: "variable", detail: "DOM", info: "Objeto window de la pestaña actual", boost: 90 },
  { label: "localStorage", type: "variable", detail: "Storage" },
  { label: "sessionStorage", type: "variable", detail: "Storage" },
  { label: "fetch", type: "function", detail: "(url, init) => Promise<Response>" },
];

const SANDBOX_SNIPPETS: Completion[] = [
  snippetCompletion(
    "const ${items} = (variables.${list} || []).map((item) => ({\n  ${1}\n}));\nreturn ${items};",
    {
      label: "mapItems",
      type: "keyword",
      detail: "Snippet · Transformar lista",
      info: "Transforma una lista del flujo en un arreglo nuevo",
    }
  ),
  snippetCompletion("const ${parsed} = JSON.parse(${rawText});", {
    label: "parseJson",
    type: "keyword",
    detail: "Snippet · Parsear JSON",
    info: "Convierte una cadena JSON en objeto",
  }),
  snippetCompletion("const ${today} = new Date().toISOString().slice(0, 10);", {
    label: "formatDate",
    type: "keyword",
    detail: "Snippet · Fecha YYYY-MM-DD",
    info: "Obtiene la fecha actual en formato ISO corto",
  }),
];

const BROWSER_SNIPPETS: Completion[] = [
  snippetCompletion(
    "const ${elements} = Array.from(document.querySelectorAll('${selector}')).map((el) => el.textContent?.trim() || '');\nreturn ${elements};",
    {
      label: "queryAll",
      type: "keyword",
      detail: "Snippet DOM · Extraer textos",
      info: "Extrae texto limpio de todos los elementos que coincidan",
    }
  ),
  snippetCompletion(
    "const ${rows} = Array.from(document.querySelectorAll('${table} tr')).map((tr) =>\n  Array.from(tr.querySelectorAll('th, td')).map((cell) => cell.textContent?.trim() || '')\n);\nreturn ${rows};",
    {
      label: "extractTable",
      type: "keyword",
      detail: "Snippet DOM · Extraer tabla HTML",
      info: "Convierte filas y celdas de una tabla HTML en matriz",
    }
  ),
];

export function createRpaJsCompletionSource(
  getContext: () => JsAutocompleteContext
): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    const match = context.matchBefore(/[\w$]+(?:\.[\w$]*)*$/);
    if (!match && !context.explicit) {
      return null;
    }

    const ctx = getContext();
    const text = match?.text ?? "";

    // Caso 1: Cadena con punto (variables.*, steps.*, input.*, JSON.*, document.*, etc.)
    if (text.includes(".")) {
      const parts = text.split(".");
      const trailing = parts.pop() ?? "";
      const from = context.pos - trailing.length;

      const root = parts[0];

      // variables.*
      if (root === "variables") {
        const availableVars = collectAvailableVariables(
          ctx.definition,
          ctx.nodeOutputs,
          ctx.webhookPayload
        );

        if (parts.length === 1) {
          return {
            from,
            validFor: /^[\w$]*$/,
            options: availableVars.map((v) => ({
              label: v.name,
              type: "property",
              detail: v.type,
              info:
                v.source === "global"
                  ? "Variable global de la receta"
                  : `Generada por el nodo ${v.source}`,
            })),
          };
        }

        const varEntry = availableVars.find((v) => v.name === parts[1]);
        const target = walkPath(varEntry?.preview, parts.slice(2));
        return {
          from,
          validFor: /^[\w$]*$/,
          options: resolveObjectProperties(target),
        };
      }

      // steps.*
      if (root === "steps") {
        const allNodes = Object.values(ctx.definition?.nodes || {});
        const candidateNodes = allNodes.filter((n) => n.id !== ctx.currentNodeId);

        if (parts.length === 1) {
          return {
            from,
            validFor: /^[\w$]*$/,
            options: candidateNodes.map((n) => ({
              label: n.id,
              type: "property",
              detail: `[${n.type}]`,
              info: n.description || "Paso del flujo",
            })),
          };
        }

        const nodeId = parts[1];
        if (parts.length === 2) {
          return {
            from,
            validFor: /^[\w$]*$/,
            options: [
              {
                label: "output",
                type: "property",
                detail: "Salida del paso",
                info: `Resultado generado por ${nodeId}`,
              },
            ],
          };
        }

        if (parts[2] === "output") {
          const sample = resolveStepOutputSample(nodeId, ctx);
          const target = walkPath(sample, parts.slice(3));
          return {
            from,
            validFor: /^[\w$]*$/,
            options: resolveObjectProperties(target),
          };
        }

        return null;
      }

      // input.*
      if (root === "input") {
        const webhookObj = isRecord(ctx.webhookPayload) ? ctx.webhookPayload : undefined;
        const webhookRoot = webhookObj ?? DEFAULT_WEBHOOK_SHAPE;
        const rawBody = isRecord(webhookObj?.body) ? webhookObj.body : {};
        const inputRoot: Record<string, unknown> = {
          webhook: webhookRoot,
          ...rawBody,
        };
        const target = walkPath(inputRoot, parts.slice(1));
        return {
          from,
          validFor: /^[\w$]*$/,
          options: resolveObjectProperties(target),
        };
      }

      // Objetos estáticos (console, JSON, Object, Array, Math)
      if (parts.length === 1 && STATIC_MEMBER_COMPLETIONS[root]) {
        return {
          from,
          validFor: /^[\w$]*$/,
          options: STATIC_MEMBER_COMPLETIONS[root],
        };
      }

      // Objetos del navegador (solo en mode === "browser")
      if (
        ctx.mode === "browser" &&
        parts.length === 1 &&
        BROWSER_MEMBER_COMPLETIONS[root]
      ) {
        return {
          from,
          validFor: /^[\w$]*$/,
          options: BROWSER_MEMBER_COMPLETIONS[root],
        };
      }

      return null;
    }

    // Caso 2: Nivel raíz (variables, steps, input, globals JS, snippets, DOM si browser)
    const from = match ? match.from : context.pos;
    const options: Completion[] = [
      ...SANDBOX_ROOT_COMPLETIONS,
      ...(ctx.mode === "browser" ? BROWSER_ROOT_COMPLETIONS : []),
      ...SANDBOX_SNIPPETS,
      ...(ctx.mode === "browser" ? BROWSER_SNIPPETS : []),
    ];

    return {
      from,
      validFor: /^[\w$]*$/,
      options,
    };
  };
}
