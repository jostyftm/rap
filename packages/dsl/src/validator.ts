import { z } from "zod";
import type { RecipeDsl } from "./types.js";

const LocatorStrategySchema = z.enum([
  "testid",
  "role",
  "label",
  "text",
  "css",
  "xpath",
  "vision",
]);

const LocatorCandidateSchema = z.object({
  strategy: LocatorStrategySchema,
  value: z.string().min(1, "El selector del elemento es obligatorio"),
  score: z.number().min(0).max(100),
});

const LooseLocatorCandidateSchema = z.object({
  strategy: LocatorStrategySchema,
  value: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v === null || v === undefined ? "" : String(v))),
  score: z.number().min(0).max(100).default(60),
});

const SemanticFingerprintSchema = z
  .object({
    role: z.string().optional(),
    accessibleName: z.string().optional(),
    tag: z.string().optional(),
    text: z.string().optional(),
    classes: z.array(z.string()).optional(),
    attributes: z.record(z.string()).optional(),
    boundingBox: z
      .object({
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
      })
      .optional(),
  })
  .optional();

const LocatorGroupSchema = z.object({
  primary: LocatorCandidateSchema,
  fallbacks: z.array(LocatorCandidateSchema).default([]),
  fingerprint: SemanticFingerprintSchema,
});

const LooseLocatorGroupSchema = z.object({
  primary: LooseLocatorCandidateSchema,
  fallbacks: z.array(LooseLocatorCandidateSchema).default([]),
  fingerprint: SemanticFingerprintSchema,
});

const BaseNodeSchema = z.object({
  id: z.string().min(1, "El ID del nodo es obligatorio"),
  description: z.string(),
  timeout: z.number().positive().default(30000),
  onError: z.enum(["fail", "continue", "retry"]).default("fail"),
  screenshot: z.enum(["never", "onError", "always"]).default("onError"),
  next: z.string().optional(),
  isInitializer: z.boolean().optional(),
  position: z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .optional(),
});

const NavigateNodeSchema = BaseNodeSchema.extend({
  type: z.literal("navigate"),
  params: z.object({
    url: z.string().min(1, "La URL de navegación es obligatoria"),
    waitUntil: z.enum(["load", "domcontentloaded", "networkidle"]).optional(),
  }),
});

const ClickNodeSchema = BaseNodeSchema.extend({
  type: z.literal("click"),
  locator: LocatorGroupSchema,
  params: z
    .object({
      button: z.enum(["left", "right", "middle"]).default("left"),
      clickCount: z.number().int().min(1).default(1),
      delay: z.number().min(0).optional(),
    })
    .default({ button: "left", clickCount: 1 }),
});

const TypeNodeSchema = BaseNodeSchema.extend({
  type: z.literal("type"),
  locator: LocatorGroupSchema,
  params: z.object({
    text: z.string(),
    clear: z.boolean().default(true),
    delay: z.number().min(0).optional(),
    sensitive: z.boolean().default(false),
  }),
});

const SelectNodeSchema = BaseNodeSchema.extend({
  type: z.literal("select"),
  locator: LocatorGroupSchema,
  params: z.object({
    value: z.string().min(1, "El valor a seleccionar es obligatorio"),
  }),
});

const WaitForNodeSchema = BaseNodeSchema.extend({
  type: z.literal("waitFor"),
  locator: LooseLocatorGroupSchema.nullable().optional(),
  params: z.object({
    strategy: z.enum(["selector", "networkIdle", "url", "text", "timeout"]),
    value: z.union([z.string(), z.number(), z.null()]).optional(),
  }),
});

const ExtractNodeSchema = BaseNodeSchema.extend({
  type: z.literal("extract"),
  locator: LocatorGroupSchema,
  params: z.object({
    extractType: z.enum(["text", "attribute", "list"]),
    attributeName: z.string().optional(),
    variable: z.string().min(1, "El nombre de variable es obligatorio"),
  }),
});

const ScreenshotNodeSchema = BaseNodeSchema.extend({
  type: z.literal("screenshot"),
  locator: LooseLocatorGroupSchema.nullable().optional(),
  params: z
    .object({
      fullPage: z.boolean().default(false),
      name: z.string().optional(),
    })
    .default({ fullPage: false }),
});

const SetVariableNodeSchema = BaseNodeSchema.extend({
  type: z.literal("setVariable"),
  params: z.object({
    name: z.string().min(1, "El nombre de variable es obligatorio"),
    expression: z.string().min(1, "La expresión de la variable es obligatoria"),
  }),
});

const ConditionNodeSchema = BaseNodeSchema.extend({
  type: z.literal("condition"),
  params: z.object({
    expression: z.string().min(1, "La expresión de la condición es obligatoria"),
    thenNodeId: z.string().min(1, "El nodo 'thenNodeId' es obligatorio"),
    elseNodeId: z.string().optional(),
    dataType: z
      .enum(["string", "number", "boolean", "array", "exists", "custom"])
      .optional(),
    leftOperand: z.string().optional(),
    operator: z.string().optional(),
    rightOperand: z.string().optional(),
  }),
});

const LoopNodeSchema = BaseNodeSchema.extend({
  type: z.literal("loop"),
  params: z.object({
    collectionExpression: z.string().min(1, "La colección del bucle es obligatoria"),
    itemVariable: z.string().min(1, "La variable de elemento es obligatoria"),
    bodyEntryNodeId: z.string().min(1, "El nodo de inicio del bucle es obligatorio"),
    maxIterations: z
      .number()
      .int()
      .min(1, "maxIterations es obligatorio en los bucles y debe ser >= 1"),
  }),
});

const ScrollNodeSchema = BaseNodeSchema.extend({
  type: z.literal("scroll"),
  locator: LooseLocatorGroupSchema.nullable().optional(),
  params: z.object({
    mode: z.enum(["element", "coordinates", "top", "bottom"]).default("element"),
    x: z.number().nullable().optional(),
    y: z.number().nullable().optional(),
    behavior: z.enum(["smooth", "auto"]).default("smooth"),
  }),
});

const WebhookNodeSchema = BaseNodeSchema.extend({
  type: z.literal("webhook"),
  params: z.object({
    httpMethod: z
      .enum(["ANY", "GET", "POST", "PUT", "DELETE", "PATCH"])
      .default("POST"),
    path: z.string().optional(),
    outputVariable: z.string().default("webhook"),
    responseCode: z.number().int().min(100).max(599).default(200),
    responseBody: z.string().optional(),
  }),
});

const RecipeNodeSchema = z.discriminatedUnion("type", [
  NavigateNodeSchema,
  ClickNodeSchema,
  TypeNodeSchema,
  SelectNodeSchema,
  WaitForNodeSchema,
  ExtractNodeSchema,
  ScreenshotNodeSchema,
  SetVariableNodeSchema,
  ConditionNodeSchema,
  LoopNodeSchema,
  ScrollNodeSchema,
  WebhookNodeSchema,
]);

export const RecipeDslSchema = z
  .object({
    schema: z.literal("rpa/v1"),
    name: z.string().optional(),
    description: z.string().optional(),
    variables: z
      .array(
        z.object({
          name: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
          type: z.enum(["string", "number", "boolean", "array", "object"]),
          defaultValue: z.unknown().optional(),
          description: z.string().optional(),
        })
      )
      .default([]),
    secrets: z.array(z.string()).default([]),
    entry: z.string().min(1),
    nodes: z.record(RecipeNodeSchema),
    edges: z
      .array(
        z.object({
          from: z.string(),
          to: z.string(),
          label: z.string().optional(),
          condition: z.string().optional(),
        })
      )
      .default([]),
  })
  .superRefine((data, ctx) => {
    // 1. Validar que el entryNode exista
    if (!data.nodes[data.entry]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entry"],
        message: `El nodo inicial '${data.entry}' no existe en el catálogo de nodos`,
      });
    }

    // 2. Validar referencias de edges
    for (let i = 0; i < data.edges.length; i++) {
      const edge = data.edges[i];
      if (!data.nodes[edge.from]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["edges", i, "from"],
          message: `El origen de la arista '${edge.from}' no existe en los nodos`,
        });
      }
      if (!data.nodes[edge.to]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["edges", i, "to"],
          message: `El destino de la arista '${edge.to}' no existe en los nodos`,
        });
      }
    }

    // 3. Validar ramas de control de flujo
    for (const [nodeId, node] of Object.entries(data.nodes)) {
      if (node.next && !data.nodes[node.next]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nodes", nodeId, "next"],
          message: `El siguiente nodo '${node.next}' no existe en el catálogo`,
        });
      }

      if (node.type === "condition") {
        if (!data.nodes[node.params.thenNodeId]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["nodes", nodeId, "params", "thenNodeId"],
            message: `El nodo 'thenNodeId' ('${node.params.thenNodeId}') no existe`,
          });
        }
        if (node.params.elseNodeId && !data.nodes[node.params.elseNodeId]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["nodes", nodeId, "params", "elseNodeId"],
            message: `El nodo 'elseNodeId' ('${node.params.elseNodeId}') no existe`,
          });
        }
      }

      if (node.type === "loop") {
        if (!data.nodes[node.params.bodyEntryNodeId]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["nodes", nodeId, "params", "bodyEntryNodeId"],
            message: `El nodo 'bodyEntryNodeId' ('${node.params.bodyEntryNodeId}') no existe`,
          });
        }
      }

      // 4. Validar reglas específicas según modo o estrategia
      if (node.type === "scroll") {
        const mode = node.params?.mode ?? "element";
        if (mode === "element") {
          const val = node.locator?.primary?.value?.trim();
          if (!val) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["nodes", nodeId, "locator", "primary", "value"],
              message: "Falta el selector CSS o elemento objetivo para el scroll",
            });
          }
        } else if (mode === "coordinates") {
          const x = node.params?.x;
          const y = node.params?.y;
          if (
            (x === undefined || x === null || Number.isNaN(Number(x))) &&
            (y === undefined || y === null || Number.isNaN(Number(y)))
          ) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["nodes", nodeId, "params", "y"],
              message: "Especifica la distancia en píxeles (Y o X) para desplazar",
            });
          }
        }
      }

      if (node.type === "waitFor") {
        const strategy = node.params?.strategy;
        if (strategy === "selector") {
          const val = node.locator?.primary?.value?.trim();
          if (!val) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["nodes", nodeId, "locator", "primary", "value"],
              message: "Falta el selector del elemento a esperar",
            });
          }
        } else if (strategy === "url") {
          const val = typeof node.params?.value === "string" ? node.params.value.trim() : "";
          if (!val) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["nodes", nodeId, "params", "value"],
              message: "Falta la URL esperada",
            });
          }
        } else if (strategy === "text") {
          const val = typeof node.params?.value === "string" ? node.params.value.trim() : "";
          if (!val) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["nodes", nodeId, "params", "value"],
              message: "Falta el texto esperado",
            });
          }
        } else if (strategy === "timeout") {
          const num = Number(node.params?.value);
          if (node.params?.value === undefined || Number.isNaN(num) || num <= 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["nodes", nodeId, "params", "value"],
              message: "El tiempo de espera debe ser mayor a 0 ms",
            });
          }
        }
      }
    }
  });

export interface NodeValidationIssue {
  nodeId: string;
  field: string;
  message: string;
}

export interface DslValidationResult {
  success: boolean;
  data?: RecipeDsl;
  errors?: string[];
  nodeIssues: Record<string, NodeValidationIssue[]>;
}

export function validateRecipeDslDetailed(data: unknown): DslValidationResult {
  const result = RecipeDslSchema.safeParse(data);
  if (!result.success) {
    const nodeIssues: Record<string, NodeValidationIssue[]> = {};
    for (const issue of result.error.issues) {
      if (issue.path[0] === "nodes" && typeof issue.path[1] === "string") {
        const nodeId = issue.path[1];
        const field = issue.path.slice(2).join(".");
        if (!nodeIssues[nodeId]) {
          nodeIssues[nodeId] = [];
        }
        nodeIssues[nodeId].push({
          nodeId,
          field,
          message: issue.message,
        });
      }
    }

    return {
      success: false,
      errors: result.error.errors.map(
        (e) => `${e.path.join(".")}: ${e.message}`
      ),
      nodeIssues,
    };
  }

  return {
    success: true,
    data: result.data as RecipeDsl,
    nodeIssues: {},
  };
}

export function validateRecipeDsl(data: unknown): {
  success: boolean;
  data?: RecipeDsl;
  errors?: string[];
} {
  const detailed = validateRecipeDslDetailed(data);
  return {
    success: detailed.success,
    data: detailed.data,
    errors: detailed.errors,
  };
}
