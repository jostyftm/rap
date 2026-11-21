import type { RecipeNode, RecipeDsl } from "@rpa/dsl";
import { resolveExpression } from "@rpa/dsl";
import { useRecipeStore } from "@/stores/use-recipe-store";
import { useLiveStore } from "@/stores/use-live-store";
import { useLayoutStore } from "@/stores/use-layout-store";
import { apiFetch } from "./api-client";
import { buildTestWebhookPath } from "./webhook-url";

function getByDotPath(root: unknown, dotPath: string): unknown {
  if (!dotPath) return root;
  let current: unknown = root;
  for (const part of dotPath.split(".")) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function resolveEditorToken(
  rawKey: string,
  variables: Record<string, unknown>,
  stepResults: Record<string, unknown>
): { found: boolean; value: unknown } {
  const key = rawKey.trim();
  if (key.startsWith("variables.")) {
    const val = getByDotPath(variables, key.slice("variables.".length));
    return { found: val !== undefined, value: val };
  }
  if (key.startsWith("steps.")) {
    const rest = key.slice("steps.".length);
    const parts = rest.split(".");
    const stepId = parts[0];
    const stepOut = stepResults[stepId];
    if (stepOut === undefined) return { found: false, value: undefined };
    const tail = parts.slice(1).join(".");
    if (!tail || tail === "output") return { found: true, value: stepOut };
    const cleanTail = tail.startsWith("output.") ? tail.slice("output.".length) : tail;
    const nested = getByDotPath(stepOut, cleanTail);
    return { found: nested !== undefined, value: nested };
  }
  const direct = getByDotPath(variables, key);
  if (direct !== undefined) return { found: true, value: direct };
  const fromSteps = getByDotPath(stepResults, key);
  return { found: fromSteps !== undefined, value: fromSteps };
}

function interpolateEditorString(
  template: string,
  variables: Record<string, unknown>,
  stepResults: Record<string, unknown>,
  preserveSecrets = true
): string {
  if (!template) return "";
  return template.replace(/\{\{([^{}]+)\}\}/g, (full, rawKey: string) => {
    const trimmed = rawKey.trim();
    if (preserveSecrets && trimmed.startsWith("secret.")) {
      return full;
    }
    const res = resolveEditorToken(trimmed, variables, stepResults);
    if (!res.found) return full;
    return typeof res.value === "object" && res.value !== null
      ? JSON.stringify(res.value)
      : String(res.value ?? "");
  });
}

export interface NodeTestResult {
  ok: boolean;
  output?: unknown;
  error?: string;
  durationMs: number;
}

export interface MultiStepProgress {
  currentStepIndex: number;
  totalSteps: number;
  currentNodeId: string;
  isTesting: boolean;
}

export interface SequentialTestResult {
  completed: boolean;
  executedCount: number;
  totalCount: number;
  error?: string;
  failedNodeId?: string;
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
          path: buildTestWebhookPath(node.params.path, node.id),
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

      case "javascript": {
        const mode = node.params.mode ?? "sandbox";
        if (mode === "browser") {
          const durationMs = Date.now() - startTime;
          const error =
            "Este nodo está en modo 'Página (DOM)'. Ejecuta la receta con Playwright para evaluar sobre el navegador real.";
          store.addLog({
            level: "warn",
            message: `[Test] ${error}`,
            nodeId: node.id,
          });
          return { ok: false, error, durationMs };
        }

        const safeVars = { ...currentVariables };
        const stepsCtx: Record<string, { output: unknown }> = {};
        for (const [stepId, out] of Object.entries(currentStepOutputs)) {
          stepsCtx[stepId] = { output: out };
        }
        const webhookNode = Object.values(store.definition.nodes || {}).find(
          (n) => n.type === "webhook"
        );
        const webhookOutput = webhookNode ? currentStepOutputs[webhookNode.id] : undefined;
        const inputCtx = {
          webhook: webhookOutput ?? {},
          ...(typeof webhookOutput === "object" && webhookOutput !== null && "body" in webhookOutput
            ? ((webhookOutput as { body?: Record<string, unknown> }).body ?? {})
            : {}),
        };
        const setVar = (name: string, value: unknown) => {
          safeVars[name] = value;
          currentVariables[name] = value;
        };
        const formatArg = (arg: unknown) => {
          if (typeof arg === "string") return arg;
          try {
            return JSON.stringify(arg);
          } catch {
            return String(arg);
          }
        };
        const logJs = (level: "info" | "warn" | "error", args: unknown[]) => {
          store.addLog({
            level,
            message: `[JS] ${args.map(formatArg).join(" ")}`,
            nodeId: node.id,
          });
        };
        const consoleMock = {
          log: (...args: unknown[]) => logJs("info", args),
          info: (...args: unknown[]) => logJs("info", args),
          warn: (...args: unknown[]) => logJs("warn", args),
          error: (...args: unknown[]) => logJs("error", args),
        };

        const AsyncFunction = Object.getPrototypeOf(async function () {})
          .constructor as new (
          ...args: string[]
        ) => (...values: unknown[]) => Promise<unknown>;

        const fn = new AsyncFunction(
          "variables",
          "steps",
          "input",
          "setVariable",
          "console",
          `"use strict";\n${node.params.code}`
        );

        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Tiempo de espera agotado (5000ms) en JavaScript")),
            5000
          );
        });

        let result: unknown;
        try {
          result = await Promise.race([
            fn(safeVars, stepsCtx, inputCtx, setVar, consoleMock),
            timeoutPromise,
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }

        if (node.params.outputVariable) {
          setVar(node.params.outputVariable, result);
        }

        const durationMs = Date.now() - startTime;
        store.setNodeOutput(node.id, result);
        store.addLog({
          level: "success",
          message: `[Test] JavaScript ejecutado (${durationMs}ms)`,
          nodeId: node.id,
        });
        return { ok: true, output: result, durationMs };
      }

      case "respond": {
        const responseType = node.params.responseType || "json";
        const statusCode =
          node.params.statusCode ??
          (responseType === "empty" ? 204 : responseType === "redirect" ? 302 : 200);

        const resolvedHeaders: Record<string, string> = {};
        for (const pair of node.params.headers || []) {
          if (pair.enabled === false || !pair.key.trim()) continue;
          resolvedHeaders[pair.key.trim()] = interpolateEditorString(
            pair.value || "",
            currentVariables,
            currentStepOutputs,
            false
          );
        }

        let bodyPreview: unknown = "";
        let redirectUrl: string | undefined;
        let contentType = node.params.contentType?.trim() || "";

        if (responseType === "redirect") {
          redirectUrl = interpolateEditorString(
            node.params.redirectUrl || "",
            currentVariables,
            currentStepOutputs,
            false
          ).trim();
          resolvedHeaders.Location = redirectUrl;
        } else if (responseType === "empty") {
          bodyPreview = "";
        } else if (responseType === "json") {
          contentType ||= "application/json; charset=utf-8";
          const rawBody = (node.params.body || "").trim();
          const singleMatch = rawBody.match(/^\{\{([^{}]+)\}\}$/);
          if (singleMatch) {
            const resolved = resolveEditorToken(
              singleMatch[1],
              currentVariables,
              currentStepOutputs
            );
            bodyPreview = resolved.found ? resolved.value : null;
          } else if (!rawBody) {
            bodyPreview = { ok: true };
          } else {
            const text = interpolateEditorString(
              rawBody,
              currentVariables,
              currentStepOutputs,
              false
            );
            try {
              bodyPreview = JSON.parse(text);
            } catch {
              bodyPreview = text;
            }
          }
        } else if (responseType === "binary") {
          contentType ||= "application/octet-stream";
          bodyPreview = {
            isBase64: true,
            filename: node.params.filename,
            sourcePreview: String(node.params.body || "").slice(0, 120),
          };
        } else {
          contentType ||=
            responseType === "html"
              ? "text/html; charset=utf-8"
              : responseType === "xml"
                ? "application/xml; charset=utf-8"
                : "text/plain; charset=utf-8";
          bodyPreview = interpolateEditorString(
            node.params.body || "",
            currentVariables,
            currentStepOutputs,
            false
          );
        }

        const output = {
          responseType,
          statusCode,
          contentType,
          headers: resolvedHeaders,
          filename: node.params.filename,
          redirectUrl,
          body: bodyPreview,
          terminateFlow: node.params.terminateFlow !== false,
        };

        const durationMs = Date.now() - startTime;
        store.setNodeOutput(node.id, output);
        store.addLog({
          level: "success",
          message: `[Test] Respuesta preparada (${responseType}, HTTP ${statusCode}) en ${durationMs}ms`,
          nodeId: node.id,
        });
        return { ok: true, output, durationMs };
      }

      case "httpRequest": {
        if (!store.recipeId) {
          const durationMs = Date.now() - startTime;
          const error = "Guarda la receta primero para probar peticiones HTTP desde el servidor.";
          store.addLog({ level: "warn", message: `[Test] ${error}`, nodeId: node.id });
          return { ok: false, error, durationMs };
        }

        const interp = (v?: string) =>
          interpolateEditorString(v || "", currentVariables, currentStepOutputs, true);

        const mapPairs = (pairs?: Array<{ key: string; value: string; enabled?: boolean }>) =>
          (pairs || []).map((p) => ({
            key: interp(p.key),
            value: interp(p.value),
            enabled: p.enabled !== false,
          }));

        const auth = node.params.auth;
        let resolvedAuth = auth;
        if (auth?.type === "bearer") {
          resolvedAuth = { type: "bearer", token: interp(auth.token) };
        } else if (auth?.type === "basic") {
          resolvedAuth = {
            type: "basic",
            username: interp(auth.username),
            password: interp(auth.password),
          };
        } else if (auth?.type === "apiKey") {
          resolvedAuth = {
            type: "apiKey",
            keyName: interp(auth.keyName),
            keyValue: interp(auth.keyValue),
            in: auth.in,
          };
        }

        const res = await apiFetch<{
          ok: boolean;
          error?: string;
          output?: Record<string, unknown>;
        }>(`/api/v1/recipes/${store.recipeId}/http-test`, {
          method: "POST",
          body: JSON.stringify({
            method: node.params.method || "GET",
            url: interp(node.params.url),
            pathParams: mapPairs(node.params.pathParams),
            queryParams: mapPairs(node.params.queryParams),
            headers: mapPairs(node.params.headers),
            auth: resolvedAuth,
            bodyType: node.params.bodyType || "none",
            bodyJson: interp(node.params.bodyJson),
            bodyForm: mapPairs(node.params.bodyForm),
            bodyMultipart: (node.params.bodyMultipart || []).map((m) => ({
              key: interp(m.key),
              value: interp(m.value),
              fieldType: m.fieldType,
              filename: m.filename ? interp(m.filename) : undefined,
              contentType: m.contentType,
              enabled: m.enabled !== false,
            })),
            bodyRaw: interp(node.params.bodyRaw),
            rawContentType: node.params.rawContentType,
            bodyBinaryBase64: interp(node.params.bodyBinaryBase64),
            binaryContentType: node.params.binaryContentType,
            responseType: node.params.responseType || "auto",
            timeoutMs: node.params.timeoutMs ?? 30000,
            followRedirects: node.params.followRedirects !== false,
            failOnHttpError: node.params.failOnHttpError !== false,
          }),
        });

        const durationMs = Date.now() - startTime;
        if (res.output !== undefined) {
          store.setNodeOutput(node.id, res.output);
        }

        const status = (res.output as { status?: number } | undefined)?.status ?? "?";
        store.addLog({
          level: res.ok ? "success" : "error",
          message: res.ok
            ? `[Test] HTTP ${node.params.method} -> ${status} (${durationMs}ms)`
            : `[Test] ${res.error || `HTTP error ${status}`}`,
          nodeId: node.id,
        });

        return {
          ok: res.ok,
          output: res.output,
          error: res.error,
          durationMs,
        };
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

      case "tryCatch": {
        const durationMs = Date.now() - startTime;
        const output = {
          bloqueTry: node.params.tryEntryNodeId || "(sin conectar)",
          bloqueCatch: node.params.catchEntryNodeId || "(sin conectar)",
          bloqueFinally: node.params.finallyEntryNodeId || "(no definido)",
          variableError: node.params.errorVariable || "error",
          relanzarError: node.params.rethrow === true,
          estado:
            "Bloque try/catch configurado. La prueba rápida no ejecuta las ramas.",
        };
        store.setNodeOutput(node.id, output);
        store.addLog({
          level: "info",
          message: `[Test] Bloque try/catch verificado: try=${output.bloqueTry}, catch=${output.bloqueCatch} (${durationMs}ms)`,
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
          } else if (live.kind === "screencast") {
            await live.startScreencast(recipeId, resolvedUrl);
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
        if (!live.isOpen || live.status === "idle" || (!live.proxyUrl && !live.wsUrl && live.kind !== "external")) {
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
                if (evalRes.hasError) {
                  store.addLog({
                    level: "warn",
                    message: `[Test] Token(es) sin resolver en '${node.description || node.type}': ${evalRes.missingTokens.join(", ")}`,
                    nodeId: node.id,
                  });
                }
                resolvedParams[k] = evalRes.resolvedStr;
              } else {
                resolvedParams[k] = v;
              }
            }
            resolvedNode = { ...node, params: resolvedParams } as any;
          }

          // Verificar si el nodo usa un selector por defecto que aún no ha sido capturado
          const loc = (resolvedNode as any).locator;
          const primVal = loc?.primary?.value;
          const isDefaultPlaceholder =
            (primVal === "action-button" && resolvedNode.type === "click") ||
            (primVal === "input-field" && resolvedNode.type === "type") ||
            (primVal === "select-dropdown" && resolvedNode.type === "select") ||
            (primVal === "data-text" && resolvedNode.type === "extract");

          if (isDefaultPlaceholder) {
            store.addLog({
              level: "warn",
              message: `[Test] Paso '${resolvedNode.description || resolvedNode.type}' (${resolvedNode.id}) tiene el selector por defecto '${primVal}'. Si no se encuentra en el simulador, captúralo con la herramienta de selección visual.`,
              nodeId: resolvedNode.id,
            });
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

/**
 * Ordena un conjunto de IDs de nodos de acuerdo con el flujo topológico de ejecución de la receta.
 * Comienza desde `entry` siguiendo los enlaces `.next` y aristas, y añade los nodos desconectados al final.
 */
export function sortNodesInExecutionOrder(
  definition: RecipeDsl,
  nodeIds: string[]
): RecipeNode[] {
  if (!definition?.nodes) return [];
  const allOrdered: RecipeNode[] = [];
  const visited = new Set<string>();

  // 1. Recorrido lineal principal desde el entry
  let currId: string | undefined = definition.entry;
  while (currId && definition.nodes[currId] && !visited.has(currId)) {
    visited.add(currId);
    allOrdered.push(definition.nodes[currId]);
    currId = definition.nodes[currId].next;
  }

  // 2. Agregar nodos desconectados o ramas restantes en orden de definición
  for (const key of Object.keys(definition.nodes)) {
    if (!visited.has(key)) {
      visited.add(key);
      allOrdered.push(definition.nodes[key]);
    }
  }

  const selectedSet = new Set(nodeIds);
  return allOrdered.filter((node) => selectedSet.has(node.id));
}

let activeSequentialAbort: { aborted: boolean } | null = null;

/**
 * Cancela inmediatamente cualquier prueba secuencial de pasos que esté en curso.
 */
export function stopSequentialTesting(): void {
  if (activeSequentialAbort) {
    activeSequentialAbort.aborted = true;
  }
  const store = useRecipeStore.getState();
  store.setIsTestingSteps(false, null);
  store.setRunningNodeId(null);
  store.addLog({
    level: "warn",
    message: "[Test] Ejecución secuencial detenida por el usuario.",
  });
}

/**
 * Ejecuta una lista de nodos seleccionados en orden secuencial contra el simulador en vivo,
 * abriendo el simulador en split mode si está cerrado y aplicando un retardo visual entre pasos.
 */
export async function testSequentialNodes(
  nodeIds: string[],
  options: {
    delayMs?: number;
    onProgress?: (progress: MultiStepProgress) => void;
  } = {}
): Promise<SequentialTestResult> {
  const delayMs = options.delayMs ?? 600;
  const store = useRecipeStore.getState();
  const live = useLiveStore.getState();
  const layout = useLayoutStore.getState();

  const orderedNodes = sortNodesInExecutionOrder(store.definition, nodeIds);
  if (orderedNodes.length === 0) {
    return { completed: true, executedCount: 0, totalCount: 0 };
  }

  // Asegurar apertura del simulador en modo split
  if (!live.isOpen) {
    live.open();
  }
  if (layout.mode === "flow") {
    layout.setMode("split");
  }

  // Si el primer paso no es un navegador y el simulador está cerrado/idle, intentar inicializarlo con la URL de la receta
  const firstNode = orderedNodes[0];
  if (
    firstNode.type !== "navigate" &&
    (live.status === "idle" || (!live.proxyUrl && !live.wsUrl && live.kind !== "external"))
  ) {
    const navNode = Object.values(store.definition.nodes).find((n) => n.type === "navigate");
    const entryNode = store.definition.entry ? store.definition.nodes[store.definition.entry] : null;
    const targetUrl = (navNode as any)?.params?.url || (entryNode as any)?.params?.url;
    if (targetUrl) {
      store.addLog({
        level: "info",
        message: `[Test] Preparando simulador para la secuencia de pasos en ${targetUrl}...`,
      });
      const recipeId = store.recipeId || "current";
      await live.startEmbedded(recipeId, targetUrl);
      let waited = 0;
      while (waited < 3000 && useLiveStore.getState().status !== "ready") {
        await new Promise((r) => setTimeout(r, 200));
        waited += 200;
      }
    }
  }

  const currentAbort = { aborted: false };
  activeSequentialAbort = currentAbort;

  store.setIsTestingSteps(true, {
    current: 1,
    total: orderedNodes.length,
    nodeId: orderedNodes[0].id,
  });
  store.addLog({
    level: "info",
    message: `[Test] Iniciando ejecución secuencial de ${orderedNodes.length} pasos seleccionados en el simulador...`,
  });

  try {
    for (let i = 0; i < orderedNodes.length; i++) {
      if (currentAbort.aborted) {
        return {
          completed: false,
          executedCount: i,
          totalCount: orderedNodes.length,
          error: "Ejecución cancelada por el usuario",
        };
      }

      const currentNode = orderedNodes[i];
      store.setRunningNodeId(currentNode.id);
      store.setIsTestingSteps(true, {
        current: i + 1,
        total: orderedNodes.length,
        nodeId: currentNode.id,
      });

      options.onProgress?.({
        currentStepIndex: i,
        totalSteps: orderedNodes.length,
        currentNodeId: currentNode.id,
        isTesting: true,
      });

      const result = await testRecipeNode(currentNode);

      if (!result.ok) {
        store.setRunningNodeId(null);
        store.setIsTestingSteps(false, null);
        store.addLog({
          level: "error",
          message: `[Test] Ejecución secuencial detenida por error en el paso '${currentNode.description || currentNode.id}': ${result.error}`,
          nodeId: currentNode.id,
        });
        return {
          completed: false,
          executedCount: i,
          totalCount: orderedNodes.length,
          error: result.error,
          failedNodeId: currentNode.id,
        };
      }

      // Pausa visual entre pasos para apreciar la interacción en el simulador
      if (delayMs > 0 && i < orderedNodes.length - 1) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    store.setRunningNodeId(null);
    store.setIsTestingSteps(false, null);
    store.addLog({
      level: "success",
      message: `[Test] Ejecución secuencial completada exitosamente (${orderedNodes.length}/${orderedNodes.length} pasos).`,
    });

    return {
      completed: true,
      executedCount: orderedNodes.length,
      totalCount: orderedNodes.length,
    };
  } finally {
    activeSequentialAbort = null;
    store.setRunningNodeId(null);
    store.setIsTestingSteps(false, null);
  }
}
