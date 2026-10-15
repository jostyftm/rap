import type { RecipeNode } from "@rpa/dsl";
import { resolveExpression } from "@rpa/dsl";
import { useRecipeStore } from "@/stores/use-recipe-store";
import { useLiveStore } from "@/stores/use-live-store";

export interface NodeTestResult {
  ok: boolean;
  output?: unknown;
  error?: string;
  durationMs: number;
}

function resolveValue(
  tokenOrStr: string,
  variables: Record<string, unknown>,
  stepResults: Record<string, unknown>
): unknown {
  if (!tokenOrStr) return "";
  const trimmed = tokenOrStr.trim();
  if (trimmed.startsWith("{{") && trimmed.endsWith("}}")) {
    const key = trimmed.slice(2, -2).trim();
    if (key.startsWith("variables.")) {
      return variables[key.slice("variables.".length)] ?? key;
    }
    if (key.startsWith("steps.")) {
      const parts = key.split(".");
      const stepId = parts[1];
      return stepResults[stepId] ?? `[Output de ${stepId}]`;
    }
    return variables[key] ?? stepResults[key] ?? key;
  }
  if (!Number.isNaN(Number(trimmed)) && trimmed !== "") return Number(trimmed);
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  return trimmed;
}

export async function testRecipeNode(node: RecipeNode): Promise<NodeTestResult> {
  const startTime = Date.now();
  const store = useRecipeStore.getState();
  const currentVariables: Record<string, unknown> = {};
  for (const v of store.definition.variables || []) {
    currentVariables[v.name] = v.defaultValue ?? "";
  }
  const currentStepOutputs = store.nodeOutputs || {};

  try {
    switch (node.type) {
      case "webhook": {
        const payload = {
          method: node.params.httpMethod || "POST",
          path: node.params.path || `/api/v1/webhooks/${node.id}`,
          query: { testRun: "true", source: "studio_tester" },
          body: {
            evento: "test_trigger",
            simulado: true,
            timestamp: new Date().toISOString(),
          },
          headers: {
            "content-type": "application/json",
            "user-agent": "RPAStudio-Tester/1.0",
          },
        };
        const durationMs = Date.now() - startTime;
        store.setNodeOutput(node.id, payload);
        store.addLog({
          level: "success",
          message: `[Test] Webhook simulado recibido con éxito (${durationMs}ms)`,
          nodeId: node.id,
        });
        return { ok: true, output: payload, durationMs };
      }

      case "setVariable": {
        const rawExpr = node.params.expression || "";
        let evaluated: unknown = rawExpr;

        if (rawExpr.includes("{{")) {
          evaluated = rawExpr.replace(/\{\{([^{}]+)\}\}/g, (_, key) => {
            const trimmed = key.trim();
            if (trimmed.startsWith("steps.")) {
              const stepId = trimmed.split(".")[1];
              const out = currentStepOutputs[stepId];
              return out !== undefined
                ? typeof out === "object"
                  ? JSON.stringify(out)
                  : String(out)
                : `[${trimmed}]`;
            }
            if (trimmed.startsWith("variables.")) {
              const varName = trimmed.slice("variables.".length);
              return String(currentVariables[varName] ?? `[${trimmed}]`);
            }
            return String(currentVariables[trimmed] ?? currentStepOutputs[trimmed] ?? `[${trimmed}]`);
          });
        } else if (!Number.isNaN(Number(rawExpr)) && rawExpr.trim() !== "") {
          evaluated = Number(rawExpr);
        } else if (rawExpr === "true") {
          evaluated = true;
        } else if (rawExpr === "false") {
          evaluated = false;
        }

        const durationMs = Date.now() - startTime;
        store.setNodeOutput(node.id, evaluated);
        store.addLog({
          level: "success",
          message: `[Test] Variable '${node.params.name}' asignada: ${JSON.stringify(evaluated)} (${durationMs}ms)`,
          nodeId: node.id,
        });
        return { ok: true, output: evaluated, durationMs };
      }

      case "condition": {
        const { dataType = "string", operator = "contains", leftOperand = "", rightOperand = "" } = node.params;
        const leftVal = resolveValue(leftOperand, currentVariables, currentStepOutputs);
        const rightVal = resolveValue(rightOperand, currentVariables, currentStepOutputs);

        let isSatisfied = false;
        if (dataType === "number") {
          const nLeft = Number(leftVal);
          const nRight = Number(rightVal);
          if (operator === "greater_than") isSatisfied = nLeft > nRight;
          else if (operator === "less_than") isSatisfied = nLeft < nRight;
          else if (operator === "greater_than_or_equal") isSatisfied = nLeft >= nRight;
          else if (operator === "less_than_or_equal") isSatisfied = nLeft <= nRight;
          else if (operator === "not_equals") isSatisfied = nLeft !== nRight;
          else isSatisfied = nLeft === nRight;
        } else if (dataType === "boolean") {
          const bLeft = Boolean(leftVal);
          if (operator === "is_true") isSatisfied = bLeft === true;
          else if (operator === "is_false") isSatisfied = bLeft === false;
          else isSatisfied = bLeft === Boolean(rightVal);
        } else if (dataType === "array") {
          const arr = Array.isArray(leftVal) ? leftVal : [leftVal];
          if (operator === "array_is_empty") isSatisfied = arr.length === 0;
          else if (operator === "array_not_empty") isSatisfied = arr.length > 0;
          else isSatisfied = arr.some((item) => String(item) === String(rightVal));
        } else if (dataType === "exists") {
          const hasVal = leftVal !== null && leftVal !== undefined && leftVal !== "";
          isSatisfied = operator === "is_null_or_empty" ? !hasVal : hasVal;
        } else {
          // String
          const sLeft = String(leftVal ?? "");
          const sRight = String(rightVal ?? "");
          if (operator === "contains") isSatisfied = sLeft.toLowerCase().includes(sRight.toLowerCase());
          else if (operator === "not_contains") isSatisfied = !sLeft.toLowerCase().includes(sRight.toLowerCase());
          else if (operator === "starts_with") isSatisfied = sLeft.startsWith(sRight);
          else if (operator === "ends_with") isSatisfied = sLeft.endsWith(sRight);
          else if (operator === "not_equals") isSatisfied = sLeft !== sRight;
          else isSatisfied = sLeft === sRight;
        }

        const durationMs = Date.now() - startTime;
        const resultOutput = {
          cumpleCondicion: isSatisfied,
          ramaSiguiente: isSatisfied
            ? node.params.thenNodeId || "Rama VERDADERA (then)"
            : node.params.elseNodeId || "Rama FALSA (else)",
          comparacion: `${JSON.stringify(leftVal)} [${operator}] ${JSON.stringify(rightVal)}`,
        };
        store.setNodeOutput(node.id, resultOutput);
        store.addLog({
          level: "info",
          message: `[Test] Condición evaluada a ${isSatisfied ? "VERDADERO" : "FALSO"} (${durationMs}ms)`,
          nodeId: node.id,
        });
        return { ok: true, output: resultOutput, durationMs };
      }

      case "loop": {
        const durationMs = Date.now() - startTime;
        const output = {
          coleccion: node.params.collectionExpression,
          variableElemento: node.params.itemVariable,
          limiteMaximo: node.params.maxIterations,
          estado: "Bucle configurado correctamente",
        };
        store.setNodeOutput(node.id, output);
        store.addLog({
          level: "success",
          message: `[Test] Bucle '${node.params.itemVariable}' configurado (${durationMs}ms)`,
          nodeId: node.id,
        });
        return { ok: true, output, durationMs };
      }

      // Nodo de Navegación inicial / Navegador
      case "navigate": {
        const rawUrl = (node.params as any)?.url || "";
        let resolvedUrl = rawUrl;
        if (typeof rawUrl === "string" && rawUrl.includes("{{")) {
          const evalRes = resolveExpression(rawUrl, {
            definition: store.definition,
            nodeOutputs: currentStepOutputs,
            variables: currentVariables,
          });
          resolvedUrl = evalRes.resolvedStr;
        }

        resolvedUrl = typeof resolvedUrl === "string" ? resolvedUrl.trim() : "";
        if (!resolvedUrl || !/^https?:\/\//i.test(resolvedUrl)) {
          const durationMs = Date.now() - startTime;
          const errMsg = `URL de navegación inválida o vacía: "${rawUrl}"`;
          store.addLog({
            level: "error",
            message: `[Test] ${errMsg}`,
            nodeId: node.id,
          });
          console.error(`[NodeTester] ${errMsg}`);
          return { ok: false, error: errMsg, durationMs };
        }

        const live = useLiveStore.getState();
        const recipeId = store.recipeId || "test_recipe";

        try {
          if (live.kind === "external") {
            await live.startExternal(recipeId, resolvedUrl);
          } else {
            await live.startEmbedded(recipeId, resolvedUrl);
          }
        } catch (navErr: any) {
          const durationMs = Date.now() - startTime;
          const errMsg = `Fallo al iniciar navegación: ${navErr?.message || navErr}`;
          store.addLog({
            level: "error",
            message: `[Test] ${errMsg}`,
            nodeId: node.id,
          });
          console.error(`[NodeTester] ${errMsg}`);
          return { ok: false, error: errMsg, durationMs };
        }

        const durationMs = Date.now() - startTime;
        const output = {
          url: resolvedUrl,
          status: "Navegación completada",
          timestamp: new Date().toISOString(),
        };

        store.setNodeOutput(node.id, output);
        store.addLog({
          level: "success",
          message: `[Test] Navegación a ${resolvedUrl} completada con éxito (${durationMs}ms)`,
          nodeId: node.id,
        });

        return { ok: true, output, durationMs };
      }

      // Pasos de interacción en navegador (click, type, select, waitFor, extract, screenshot, scroll)
      default: {
        let live = useLiveStore.getState();
        const recipeId = store.recipeId || "current";

        // Si el sitio no está abierto o listo aún, intentar iniciarlo con la URL del nodo navegador de la receta
        if (!live.isOpen || live.status === "idle" || !live.proxyUrl) {
          const navNode = Object.values(store.definition.nodes).find((n) => n.type === "navigate");
          const entryNode = store.definition.entry ? store.definition.nodes[store.definition.entry] : null;
          const targetUrl = (navNode as any)?.params?.url || (entryNode as any)?.params?.url;
          if (targetUrl) {
            let resolvedUrl = targetUrl;
            if (typeof targetUrl === "string" && targetUrl.includes("{{")) {
              const evalRes = resolveExpression(targetUrl, {
                definition: store.definition,
                nodeOutputs: currentStepOutputs,
                variables: currentVariables,
              });
              resolvedUrl = evalRes.resolvedStr;
            }
            if (/^https?:\/\//i.test(resolvedUrl)) {
              store.addLog({
                level: "info",
                message: `[Test] Iniciando navegador en vivo en ${resolvedUrl}...`,
                nodeId: node.id,
              });
              await live.startEmbedded(recipeId, resolvedUrl);
              let waited = 0;
              while (waited < 3000 && useLiveStore.getState().status !== "ready") {
                await new Promise((r) => setTimeout(r, 200));
                waited += 200;
              }
              live = useLiveStore.getState();
            }
          }
        }

        if (live.isOpen && live.status === "ready") {
          // Evaluar variables en params si contienen expresiones {{ ... }}
          let resolvedNode = node;
          if (node.params) {
            const resolvedParams: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(node.params as Record<string, unknown>)) {
              if (typeof v === "string" && v.includes("{{")) {
                const evalRes = resolveExpression(v, {
                  definition: store.definition,
                  nodeOutputs: currentStepOutputs,
                  variables: currentVariables,
                });
                resolvedParams[k] = evalRes.resolvedStr;
              } else {
                resolvedParams[k] = v;
              }
            }
            resolvedNode = { ...node, params: resolvedParams } as any;
          }

          const liveResult = await live.exec(resolvedNode);
          const durationMs = Date.now() - startTime;
          if (liveResult && liveResult.ok) {
            const out = liveResult.output ?? {
              status: "Acción completada en navegador",
              strategy: liveResult.strategy,
            };
            store.setNodeOutput(node.id, out);
            store.addLog({
              level: "success",
              message: `[Test] Paso '${node.description || node.type}' completado con éxito (${durationMs}ms)`,
              nodeId: node.id,
            });
            return { ok: true, output: out, durationMs };
          }
          const errMsg = liveResult?.error || "Fallo en ejecución del sitio en vivo";
          store.addLog({
            level: "error",
            message: `[Test] Falló paso '${node.description || node.type}': ${errMsg}`,
            nodeId: node.id,
          });
          console.error(`[NodeTester] Falló paso '${node.id}':`, errMsg);
          return {
            ok: false,
            error: errMsg,
            durationMs,
          };
        }

        // Si el sitio no está abierto o listo
        const durationMs = Date.now() - startTime;
        const errMsg =
          live.status === "starting"
            ? "El sitio en vivo se está iniciando. Espera a que termine de cargar para probar este paso."
            : "Abre o inicia el sitio en vivo a la derecha para interactuar y probar este paso visualmente.";
        store.addLog({
          level: "warn",
          message: `[Test] ${errMsg}`,
          nodeId: node.id,
        });
        console.warn(`[NodeTester] ${errMsg}`);
        return {
          ok: false,
          error: errMsg,
          durationMs,
        };
      }
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - startTime;
    store.addLog({
      level: "error",
      message: `[Test] Error inesperado en nodo '${node.description || node.type}': ${errorMsg}`,
      nodeId: node.id,
    });
    console.error(`[NodeTester] Error en testRecipeNode:`, err);
    return { ok: false, error: errorMsg, durationMs };
  }
}
