import type {
  Completion,
  CompletionContext,
  CompletionResult,
  CompletionSource,
} from "@codemirror/autocomplete";
import type { RecipeDsl } from "@rpa/dsl";
import {
  collectAvailableVariables,
  DEFAULT_WEBHOOK_SHAPE,
  isRecord,
  resolveObjectProperties,
  resolveStepOutputSample,
  walkPath,
} from "./js-autocomplete";

export interface TemplateAutocompleteContext {
  definition: RecipeDsl;
  currentNodeId?: string;
  nodeOutputs: Record<string, unknown>;
  webhookPayload?: object | null;
}

const ROOT_TEMPLATE_COMPLETIONS: Completion[] = [
  {
    label: "steps",
    type: "variable",
    detail: "Salidas de pasos",
    info: "Accede a la salida de cualquier paso previo: {{steps.<id>.output...}}",
    boost: 95,
  },
  {
    label: "variables",
    type: "variable",
    detail: "Variables del flujo",
    info: "Variables globales y asignadas: {{variables.<nombre>}}",
    boost: 92,
  },
  {
    label: "webhook",
    type: "variable",
    detail: "Payload webhook",
    info: "Cuerpo, query y headers del webhook disparador: {{webhook.body...}}",
    boost: 90,
  },
  {
    label: "secret",
    type: "variable",
    detail: "Secretos",
    info: "Secretos cifrados del workspace: {{secret.<NOMBRE>}}",
    boost: 85,
  },
];

function isContainerPreview(detail?: string): boolean {
  return detail === "Object" || Boolean(detail?.startsWith("Array("));
}

function withTemplateClosing(
  options: Completion[],
  hasClosingBraces: boolean,
  forceLeaf = false
): Completion[] {
  if (hasClosingBraces) return options;
  return options.map((opt) => {
    const isContainer = !forceLeaf && isContainerPreview(opt.detail);
    if (isContainer) return opt;
    return {
      ...opt,
      apply: `${opt.label}}}`,
    };
  });
}

function getWebhookRootSample(ctx: TemplateAutocompleteContext): unknown {
  const nodes = Object.values(ctx.definition?.nodes || {});
  const webhookNode = nodes.find((n) => n.type === "webhook");
  if (webhookNode) {
    const out = ctx.nodeOutputs[webhookNode.id];
    if (out !== undefined) return out;
  }
  return ctx.webhookPayload ?? DEFAULT_WEBHOOK_SHAPE;
}

export function createRpaTemplateCompletionSource(
  getContext: () => TemplateAutocompleteContext
): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    const match = context.matchBefore(/\{\{\s*[\w$.-]*$/);
    if (!match) {
      return null;
    }

    const ctx = getContext();
    const afterDoubleBraces = match.text.slice(2).replace(/^\s+/, "");
    const afterCursor = context.state.sliceDoc(context.pos, context.pos + 2);
    const hasClosingBraces = afterCursor === "}}";

    // Nivel con punto: {{steps..., {{variables..., {{webhook..., {{secret...
    if (afterDoubleBraces.includes(".")) {
      const parts = afterDoubleBraces.split(".");
      const trailing = parts.pop() ?? "";
      const from = context.pos - trailing.length;
      const root = parts[0];

      if (root === "steps") {
        const allNodes = Object.values(ctx.definition?.nodes || {});
        const candidateNodes = allNodes.filter((n) => n.id !== ctx.currentNodeId);

        if (parts.length === 1) {
          return {
            from,
            validFor: /^[\w$-]*$/,
            options: candidateNodes.map((n) => ({
              label: n.id,
              type: "property",
              detail: `[${n.type}]`,
              info: n.description || "Paso del flujo",
            })),
          };
        }

        const nodeId = parts[1];
        const sample = resolveStepOutputSample(nodeId, ctx);

        if (parts.length === 2) {
          const directProps = withTemplateClosing(
            resolveObjectProperties(sample),
            hasClosingBraces
          );
          return {
            from,
            validFor: /^[\w$-]*$/,
            options: [
              {
                label: "output",
                type: "property",
                detail: "Salida del paso",
                info: `Resultado generado por ${nodeId}`,
                boost: 95,
              },
              ...directProps,
            ],
          };
        }

        const subPath = parts[2] === "output" ? parts.slice(3) : parts.slice(2);
        const target = walkPath(sample, subPath);
        return {
          from,
          validFor: /^[\w$-]*$/,
          options: withTemplateClosing(
            resolveObjectProperties(target),
            hasClosingBraces
          ),
        };
      }

      if (root === "webhook") {
        const webhookRoot = getWebhookRootSample(ctx);
        const target = walkPath(webhookRoot, parts.slice(1));
        return {
          from,
          validFor: /^[\w$-]*$/,
          options: withTemplateClosing(
            resolveObjectProperties(target),
            hasClosingBraces
          ),
        };
      }

      if (root === "variables") {
        const availableVars = collectAvailableVariables(
          ctx.definition,
          ctx.nodeOutputs,
          ctx.webhookPayload
        );

        if (parts.length === 1) {
          return {
            from,
            validFor: /^[\w$-]*$/,
            options: availableVars.map((v) => {
              const container =
                v.type === "object" ||
                v.type === "array" ||
                v.type === "webhook" ||
                v.type === "http" ||
                isRecord(v.preview) ||
                Array.isArray(v.preview);
              return {
                label: v.name,
                type: "property",
                detail: v.type,
                info:
                  v.source === "global"
                    ? "Variable global de la receta"
                    : `Generada por el nodo ${v.source}`,
                ...(hasClosingBraces || container ? {} : { apply: `${v.name}}}` }),
              };
            }),
          };
        }

        const varEntry = availableVars.find((v) => v.name === parts[1]);
        const target = walkPath(varEntry?.preview, parts.slice(2));
        return {
          from,
          validFor: /^[\w$-]*$/,
          options: withTemplateClosing(
            resolveObjectProperties(target),
            hasClosingBraces
          ),
        };
      }

      if (root === "secret" && parts.length === 1) {
        const secrets = ctx.definition?.secrets || [];
        return {
          from,
          validFor: /^[\w$-]*$/,
          options: withTemplateClosing(
            secrets.map((sec) => ({
              label: sec,
              type: "property",
              detail: "Secreto",
            })),
            hasClosingBraces,
            true
          ),
        };
      }

      return null;
    }

    // Raíz después de `{{`
    const from = context.pos - afterDoubleBraces.length;
    const availableVars = collectAvailableVariables(
      ctx.definition,
      ctx.nodeOutputs,
      ctx.webhookPayload
    );

    const directVarOptions: Completion[] = availableVars.map((v) => ({
      label: v.name,
      type: "property",
      detail: v.type,
      info:
        v.source === "global"
          ? "Variable global de la receta"
          : `Generada por el nodo ${v.source}`,
      boost: 20,
      ...(hasClosingBraces ? {} : { apply: `${v.name}}}` }),
    }));

    return {
      from,
      validFor: /^[\w$-]*$/,
      options: [...ROOT_TEMPLATE_COMPLETIONS, ...directVarOptions],
    };
  };
}
