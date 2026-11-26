import type { RecipeNode, RecipeDsl, ConditionDataType, ConditionOperator } from "@rpa/dsl";
import {
  resolveExpression,
  evaluateTypedCondition,
  resolveConditionOperand,
  isUnaryConditionOperator,
} from "@rpa/dsl";
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

export interface TesterRunContext {
  variables: Record<string, unknown>;
  visitedControlStack: Set<string>;
  executedNodeIds: Set<string>;
  abortSignal?: { aborted: boolean };
  delayMs: number;
}

type BranchOutcome =
  | { kind: "next"; lastOutput?: unknown }
  | { kind: "error"; nodeId: string; error: string; errorType: string }
  | { kind: "respond"; output?: unknown; lastOutput?: unknown }
  | { kind: "stop" };

function createTesterContext(
  delayMs = 0,
  abortSignal?: { aborted: boolean }
): TesterRunContext {
  const store = useRecipeStore.getState();
  const variables: Record<string, unknown> = {};
  for (const v of store.definition.variables || []) {
    if (v.defaultValue !== undefined) {
      variables[v.name] = v.defaultValue;
    }
  }
  return {
    variables,
    visitedControlStack: new Set<string>(),
    executedNodeIds: new Set<string>(),
    abortSignal,
    delayMs,
  };
}

function resolveLoopCollection(
  rawExpression: string,
  variables: Record<string, unknown>,
  stepResults: Record<string, unknown>
): { valid: true; items: unknown[] } | { valid: false; error: string } {
  const expr = (rawExpression || "").trim();
  if (!expr) {
    return { valid: false, error: "La expresión de colección del bucle está vacía." };
  }

  let candidate: unknown;
  const singleToken = expr.match(/^\{\{([^{}]+)\}\}$/);
  if (singleToken) {
    const res = resolveEditorToken(singleToken[1], variables, stepResults);
    candidate = res.found ? res.value : undefined;
  } else if (expr.startsWith("variables.") || expr.startsWith("steps.")) {
    const res = resolveEditorToken(expr, variables, stepResults);
    candidate = res.found ? res.value : undefined;
  } else {
    const interpolated = expr.includes("{{")
      ? interpolateEditorString(expr, variables, stepResults, false)
      : expr;
    try {
      candidate = JSON.parse(interpolated);
    } catch {
      candidate = interpolated;
    }
  }

  if (typeof candidate === "string") {
    const trimmed = candidate.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        candidate = JSON.parse(trimmed);
      } catch {
        // mantener como cadena
      }
    }
  }

  if (!Array.isArray(candidate)) {
    return {
      valid: false,
      error: `La colección '${expr}' no devolvió un arreglo válido.`,
    };
  }

  return { valid: true, items: candidate };
}

function getBranchEntryIds(node: RecipeNode): string[] {
  if (node.type === "condition") {
    return [node.params.thenNodeId, node.params.elseNodeId].filter(
      (id): id is string => typeof id === "string" && id.trim().length > 0
    );
  }
  if (node.type === "loop") {
    return node.params.bodyEntryNodeId ? [node.params.bodyEntryNodeId] : [];
  }
  if (node.type === "tryCatch") {
    return [
      node.params.tryEntryNodeId,
      node.params.catchEntryNodeId,
      node.params.finallyEntryNodeId,
    ].filter((id): id is string => typeof id === "string" && id.trim().length > 0);
  }
  return [];
}

function collectOwnedBranchNodeIds(
  definition: RecipeDsl,
  selectedNodeIds: Set<string>
): Set<string> {
  const owned = new Set<string>();

  const walkBranch = (startId: string | undefined, stopId: string | undefined) => {
    let curr = startId;
    const localSeen = new Set<string>();
    while (curr && curr !== stopId && !localSeen.has(curr)) {
      localSeen.add(curr);
      const target = definition.nodes[curr];
      if (!target) break;
      owned.add(curr);
      for (const nestedEntry of getBranchEntryIds(target)) {
        walkBranch(nestedEntry, target.next);
      }
      curr = target.next;
    }
  };

  for (const nodeId of selectedNodeIds) {
    const node = definition.nodes[nodeId];
    if (!node) continue;
    for (const entryId of getBranchEntryIds(node)) {
      walkBranch(entryId, node.next);
    }
  }

  return owned;
}

function resetBranchExecStates(controlNodeId: string): void {
  const store = useRecipeStore.getState();
  const owned = collectOwnedBranchNodeIds(
    store.definition,
    new Set([controlNodeId])
  );
  for (const branchNodeId of owned) {
    store.setNodeExecState(branchNodeId, "idle", undefined, "");
  }
}

async function runBranchChain(
  entryNodeId: string | undefined,
  stopNodeId: string | undefined,
  ctx: TesterRunContext
): Promise<BranchOutcome> {
  if (!entryNodeId) return { kind: "next" };

  const seenInChain = new Set<string>();
  let currId: string | undefined = entryNodeId;
  let lastOutput: unknown = undefined;

  while (currId && currId !== stopNodeId) {
    if (ctx.abortSignal?.aborted) {
      return { kind: "stop" };
    }

    if (seenInChain.has(currId)) {
      return {
        kind: "error",
        nodeId: currId,
        error: `Ciclo detectado en la rama al volver a '${currId}'`,
        errorType: "CycleError",
      };
    }
    seenInChain.add(currId);

    const store = useRecipeStore.getState();
    const target: RecipeNode | undefined = store.definition.nodes[currId];
    if (!target) {
      return { kind: "next" };
    }

    if (store.disabledNodeIds.includes(target.id)) {
      store.addLog({
        level: "info",
        message: `[Test] Paso '${target.description || target.id}' omitido (deshabilitado).`,
        nodeId: target.id,
      });
      currId = target.next;
      continue;
    }

    store.setRunningNodeId(target.id);

    const maxAttempts =
      target.onError === "retry"
        ? Math.min(Math.max(target.retry?.maxAttempts ?? 3, 1), 10)
        : 1;
    const baseRetryDelay = Math.min(Math.max(target.retry?.delayMs ?? 500, 0), 2000);
    const backoff = target.retry?.backoff ?? "exponential";

    let lastResult: NodeTestResult = { ok: false, error: "Error desconocido", durationMs: 0 };
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (ctx.abortSignal?.aborted) {
        return { kind: "stop" };
      }

      lastResult = await executeNodeWithContext(target, ctx);
      if (lastResult.ok) break;

      if (attempt < maxAttempts) {
        const waitMs =
          backoff === "exponential"
            ? Math.min(baseRetryDelay * 2 ** (attempt - 1), 2000)
            : baseRetryDelay;
        store.addLog({
          level: "warn",
          message: `[Test] Reintentando '${target.description || target.id}' (${attempt}/${maxAttempts}) en ${waitMs}ms...`,
          nodeId: target.id,
        });
        if (waitMs > 0) {
          await new Promise((r) => setTimeout(r, waitMs));
        }
      }
    }

    if (!lastResult.ok) {
      if (target.onError === "continue") {
        store.addLog({
          level: "warn",
          message: `[Test] Error absorbido por onError='continue' en '${target.description || target.id}': ${lastResult.error}`,
          nodeId: target.id,
        });
        currId = target.next;
        continue;
      }

      return {
        kind: "error",
        nodeId: target.id,
        error: lastResult.error || "Fallo en ejecución del paso",
        errorType: "NodeExecutionError",
      };
    }

    ctx.executedNodeIds.add(target.id);
    if (lastResult.output !== undefined) {
      lastOutput = lastResult.output;
    } else {
      const storedOut = useRecipeStore.getState().nodeOutputs[target.id];
      if (storedOut !== undefined) lastOutput = storedOut;
    }

    if (target.type === "respond" && target.params.terminateFlow !== false) {
      return { kind: "respond", output: lastResult.output, lastOutput };
    }

    if (ctx.delayMs > 0 && target.next && target.next !== stopNodeId) {
      await new Promise((r) => setTimeout(r, Math.min(ctx.delayMs, 2000)));
    }

    currId = target.next;
  }

  return { kind: "next", lastOutput };
}

export async function testRecipeNode(node: RecipeNode): Promise<NodeTestResult> {
  const store = useRecipeStore.getState();
  const prevRunningNodeId = store.runningNodeId;
  const ctx = createTesterContext(0);
  store.setRunningNodeId(node.id);
  try {
    return await executeNodeWithContext(node, ctx);
  } finally {
    useRecipeStore.getState().setRunningNodeId(prevRunningNodeId ?? null);
  }
}

async function executeNodeWithContext(
  node: RecipeNode,
  ctx: TesterRunContext
): Promise<NodeTestResult> {
  useRecipeStore.getState().setNodeExecState(node.id, "running");
  const result = await executeNodeBody(node, ctx);
  useRecipeStore
    .getState()
    .setNodeExecState(
      node.id,
      result.ok ? "success" : "error",
      result.durationMs,
      result.ok ? undefined : result.error
    );
  return result;
}

async function executeNodeBody(
  node: RecipeNode,
  ctx: TesterRunContext
): Promise<NodeTestResult> {
  const startTime = Date.now();
  const store = useRecipeStore.getState();
  const currentVariables = ctx.variables;
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
        if (node.params.outputVariable) {
          currentVariables[node.params.outputVariable] = payload;
        }
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

        const singleToken = rawExpr.trim().match(/^\{\{([^{}]+)\}\}$/);
        if (singleToken) {
          const resolved = resolveEditorToken(
            singleToken[1],
            currentVariables,
            currentStepOutputs
          );
          evaluated = resolved.found ? resolved.value : rawExpr;
        } else if (rawExpr.includes("{{")) {
          evaluated = interpolateEditorString(
            rawExpr,
            currentVariables,
            currentStepOutputs,
            false
          );
        } else if (!Number.isNaN(Number(rawExpr)) && rawExpr.trim() !== "") {
          evaluated = Number(rawExpr);
        } else if (rawExpr === "true") {
          evaluated = true;
        } else if (rawExpr === "false") {
          evaluated = false;
        }

        if (node.params.name) {
          currentVariables[node.params.name] = evaluated;
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
          if (node.params.outputVariable) {
            currentVariables[node.params.outputVariable] = res.output;
          }
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
        const dataType: ConditionDataType = node.params.dataType || "string";
        const operator: ConditionOperator =
          (node.params.operator as ConditionOperator) || "contains";
        const leftOperand = node.params.leftOperand ?? "";
        const rightOperand = node.params.rightOperand ?? "";

        const webhookNode = Object.values(store.definition.nodes || {}).find(
          (n) => n.type === "webhook"
        );
        const webhookOutput = webhookNode
          ? currentStepOutputs[webhookNode.id]
          : undefined;
        const operandCtx = {
          variables: currentVariables,
          stepResults: currentStepOutputs,
          webhookOutput,
        };

        const leftVal = resolveConditionOperand(leftOperand, operandCtx).value;
        const isUnary = isUnaryConditionOperator(operator);
        const rightVal = isUnary
          ? undefined
          : resolveConditionOperand(rightOperand, operandCtx).value;

        const isSatisfied = evaluateTypedCondition(
          dataType,
          operator,
          leftVal,
          rightVal
        );

        const formatVal = (v: unknown) =>
          v === undefined ? "undefined" : JSON.stringify(v);

        const durationMs = Date.now() - startTime;
        const targetBranchId = isSatisfied
          ? node.params.thenNodeId
          : node.params.elseNodeId;
        const resultOutput = {
          cumpleCondicion: isSatisfied,
          ramaSiguiente:
            targetBranchId ||
            (isSatisfied ? "Rama VERDADERA (then)" : "Rama FALSA (else)"),
          comparacion: isUnary
            ? `${formatVal(leftVal)} [${operator}]`
            : `${formatVal(leftVal)} [${operator}] ${formatVal(rightVal)}`,
        };
        store.setNodeOutput(node.id, resultOutput);
        store.addLog({
          level: "info",
          message: `[Test] Condición evaluada a ${isSatisfied ? "VERDADERO" : "FALSO"} (${durationMs}ms)`,
          nodeId: node.id,
        });

        if (targetBranchId && store.definition.nodes[targetBranchId]) {
          if (ctx.visitedControlStack.has(node.id)) {
            return {
              ok: false,
              output: resultOutput,
              error: `Reentrada recursiva detectada en '${node.id}'`,
              durationMs: Date.now() - startTime,
            };
          }
          ctx.visitedControlStack.add(node.id);
          resetBranchExecStates(node.id);
          try {
            const branchOutcome = await runBranchChain(targetBranchId, node.next, ctx);
            if (branchOutcome.kind === "stop") {
              return {
                ok: false,
                output: resultOutput,
                error: "Ejecución cancelada por el usuario",
                durationMs: Date.now() - startTime,
              };
            }
            if (branchOutcome.kind === "error") {
              return {
                ok: false,
                output: resultOutput,
                error: branchOutcome.error,
                durationMs: Date.now() - startTime,
              };
            }
          } finally {
            ctx.visitedControlStack.delete(node.id);
          }
        }

        return { ok: true, output: resultOutput, durationMs: Date.now() - startTime };
      }

      case "loop": {
        if (ctx.visitedControlStack.has(node.id)) {
          return {
            ok: false,
            error: `Reentrada recursiva detectada en el bucle '${node.id}'`,
            durationMs: Date.now() - startTime,
          };
        }

        const resolvedCollection = resolveLoopCollection(
          node.params.collectionExpression,
          currentVariables,
          currentStepOutputs
        );
        if (!resolvedCollection.valid) {
          const durationMs = Date.now() - startTime;
          store.addLog({
            level: "error",
            message: `[Test] ${resolvedCollection.error}`,
            nodeId: node.id,
          });
          return { ok: false, error: resolvedCollection.error, durationMs };
        }

        const bodyEntryId = node.params.bodyEntryNodeId;
        if (!bodyEntryId || !store.definition.nodes[bodyEntryId]) {
          const durationMs = Date.now() - startTime;
          const errMsg = "Conecta un nodo al cuerpo del bucle antes de probar.";
          store.addLog({
            level: "warn",
            message: `[Test] ${errMsg}`,
            nodeId: node.id,
          });
          return { ok: false, error: errMsg, durationMs };
        }

        const maxIterations = Math.min(Math.max(node.params.maxIterations ?? 10, 1), 100);
        const items = resolvedCollection.items;
        const limit = Math.min(items.length, maxIterations);
        const truncated = items.length > maxIterations;
        const itemVariable = node.params.itemVariable || "item";
        let iterations = 0;

        ctx.visitedControlStack.add(node.id);
        resetBranchExecStates(node.id);
        try {
          for (let index = 0; index < limit; index++) {
            if (ctx.abortSignal?.aborted) {
              return {
                ok: false,
                error: "Ejecución cancelada por el usuario",
                durationMs: Date.now() - startTime,
              };
            }
            currentVariables[itemVariable] = items[index];
            currentVariables[`${itemVariable}_index`] = index;
            iterations++;

            const iterOutcome = await runBranchChain(bodyEntryId, node.next, ctx);
            if (iterOutcome.kind === "stop") {
              return {
                ok: false,
                error: "Ejecución cancelada por el usuario",
                durationMs: Date.now() - startTime,
              };
            }
            if (iterOutcome.kind === "error") {
              const output = { iterations, truncated };
              store.setNodeOutput(node.id, output);
              return {
                ok: false,
                output,
                error: iterOutcome.error,
                durationMs: Date.now() - startTime,
              };
            }
            if (iterOutcome.kind === "respond") {
              break;
            }
          }
        } finally {
          ctx.visitedControlStack.delete(node.id);
        }

        const durationMs = Date.now() - startTime;
        const output = { iterations, truncated };
        store.setNodeOutput(node.id, output);
        store.addLog({
          level: "success",
          message: `[Test] Bucle '${itemVariable}' completado: ${iterations} iteración(es)${truncated ? " (truncado)" : ""} (${durationMs}ms)`,
          nodeId: node.id,
        });
        return { ok: true, output, durationMs };
      }

      case "tryCatch": {
        if (ctx.visitedControlStack.has(node.id)) {
          return {
            ok: false,
            error: `Reentrada recursiva detectada en '${node.id}'`,
            durationMs: Date.now() - startTime,
          };
        }

        const tryEntryId = node.params.tryEntryNodeId;
        if (!tryEntryId || !store.definition.nodes[tryEntryId]) {
          const durationMs = Date.now() - startTime;
          const errMsg = "Conecta un nodo al bloque try antes de probar.";
          store.addLog({
            level: "warn",
            message: `[Test] ${errMsg}`,
            nodeId: node.id,
          });
          return { ok: false, error: errMsg, durationMs };
        }

        const errorVariable = node.params.errorVariable || "error";
        let caught = false;
        let caughtError: { message: string; nodeId: string; type: string } | null = null;
        let catchOutput: unknown = undefined;
        let propagatedError: string | undefined;
        let terminatedByRespond = false;

        store.addLog({
          level: "info",
          message: `[Test] [tryCatch] Ejecutando bloque try desde '${tryEntryId}'...`,
          nodeId: node.id,
        });

        ctx.visitedControlStack.add(node.id);
        resetBranchExecStates(node.id);
        try {
          const tryOutcome = await runBranchChain(tryEntryId, node.next, ctx);

          if (tryOutcome.kind === "stop") {
            return {
              ok: false,
              error: "Ejecución cancelada por el usuario",
              durationMs: Date.now() - startTime,
            };
          }

          if (tryOutcome.kind === "respond") {
            terminatedByRespond = true;
          } else if (tryOutcome.kind === "error") {
            caught = true;
            caughtError = {
              message: tryOutcome.error,
              nodeId: tryOutcome.nodeId,
              type: tryOutcome.errorType,
            };
            currentVariables[errorVariable] = caughtError;

            store.addLog({
              level: "warn",
              message: `[Test] [tryCatch] Error capturado en [${tryOutcome.nodeId}] → ejecutando catch`,
              nodeId: node.id,
            });

            const catchEntryId = node.params.catchEntryNodeId;
            if (catchEntryId && store.definition.nodes[catchEntryId]) {
              const catchOutcome = await runBranchChain(catchEntryId, node.next, ctx);
              if (catchOutcome.kind === "stop") {
                return {
                  ok: false,
                  error: "Ejecución cancelada por el usuario",
                  durationMs: Date.now() - startTime,
                };
              }
              if (catchOutcome.kind === "respond") {
                terminatedByRespond = true;
                catchOutput = catchOutcome.lastOutput;
              } else if (catchOutcome.kind === "error") {
                propagatedError = catchOutcome.error;
              } else {
                catchOutput = catchOutcome.lastOutput;
                if (node.params.rethrow) {
                  propagatedError = tryOutcome.error;
                }
              }
            } else if (node.params.rethrow) {
              propagatedError = tryOutcome.error;
            }
          }

          const finallyEntryId = node.params.finallyEntryNodeId;
          if (!terminatedByRespond && finallyEntryId && store.definition.nodes[finallyEntryId]) {
            store.addLog({
              level: "info",
              message: `[Test] [tryCatch] Ejecutando bloque finally desde '${finallyEntryId}'...`,
              nodeId: node.id,
            });
            const finallyOutcome = await runBranchChain(finallyEntryId, node.next, ctx);
            if (finallyOutcome.kind === "stop") {
              return {
                ok: false,
                error: "Ejecución cancelada por el usuario",
                durationMs: Date.now() - startTime,
              };
            }
            if (finallyOutcome.kind === "error") {
              propagatedError = finallyOutcome.error;
            }
          }
        } finally {
          ctx.visitedControlStack.delete(node.id);
        }

        const durationMs = Date.now() - startTime;
        const output =
          catchOutput !== undefined
            ? { caught, error: caughtError, catchOutput }
            : { caught, error: caughtError };
        store.setNodeOutput(node.id, output);

        if (propagatedError) {
          store.addLog({
            level: "error",
            message: `[Test] [tryCatch] Error propagado: ${propagatedError} (${durationMs}ms)`,
            nodeId: node.id,
          });
          return { ok: false, output, error: propagatedError, durationMs };
        }

        store.addLog({
          level: "success",
          message: caught
            ? `[Test] [tryCatch] Error capturado y manejado (${durationMs}ms)`
            : `[Test] [tryCatch] Completado sin errores (${durationMs}ms)`,
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

      case "screenshot": {
        const live = useLiveStore.getState();
        const recipeId = store.recipeId;
        const resolvedName =
          typeof node.params.name === "string" && node.params.name.includes("{{")
            ? interpolateEditorString(node.params.name, currentVariables, currentStepOutputs, false)
            : node.params.name;

        const resolvedNode =
          resolvedName !== node.params.name
            ? ({ ...node, params: { ...node.params, name: resolvedName } } as typeof node)
            : node;

        if (
          live.isOpen &&
          live.status === "ready" &&
          (live.kind === "screencast" || live.kind === "external")
        ) {
          const result = await live.exec(resolvedNode, 25000);
          const durationMs = Date.now() - startTime;

          if (!result.ok) {
            const err = result.error || "Error al capturar pantalla en el navegador en vivo";
            store.addLog({ level: "error", message: `[Test] ${err}`, nodeId: node.id });
            return { ok: false, error: err, durationMs };
          }

          store.setNodeOutput(node.id, result.output);
          const shotUrl = (result.output as { url?: string | null } | undefined)?.url;
          store.addLog({
            level: "success",
            message: shotUrl
              ? `[Test] Captura subida a S3: ${shotUrl} (${durationMs}ms)`
              : `[Test] Captura generada (${durationMs}ms)`,
            nodeId: node.id,
          });
          return { ok: true, output: result.output, durationMs };
        }

        let targetUrl =
          live.currentUrl && /^https?:\/\//i.test(live.currentUrl) ? live.currentUrl : "";

        if (!targetUrl) {
          const navNode = Object.values(store.definition.nodes).find(
            (n) => n.type === "navigate"
          );
          const entryNode = store.definition.entry
            ? store.definition.nodes[store.definition.entry]
            : null;
          const rawTargetUrl =
            (navNode as { params?: { url?: string } } | undefined)?.params?.url ||
            (entryNode as { params?: { url?: string } } | null)?.params?.url ||
            "";
          if (rawTargetUrl) {
            targetUrl = rawTargetUrl.includes("{{")
              ? interpolateEditorString(rawTargetUrl, currentVariables, currentStepOutputs, false)
              : rawTargetUrl;
          }
        }

        if (!recipeId) {
          const durationMs = Date.now() - startTime;
          const error = "Guarda la receta primero para subir capturas a S3.";
          store.addLog({ level: "warn", message: `[Test] ${error}`, nodeId: node.id });
          return { ok: false, error, durationMs };
        }

        if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
          const durationMs = Date.now() - startTime;
          const error =
            "Abre primero una URL en «Sitio en Vivo» o configura un nodo «Navegar» en la receta para tomar la captura.";
          store.addLog({ level: "warn", message: `[Test] ${error}`, nodeId: node.id });
          return { ok: false, error, durationMs };
        }

        const res = await apiFetch<{
          ok: boolean;
          output?: unknown;
          error?: string;
        }>(`/api/v1/recipes/${recipeId}/live/screenshot`, {
          method: "POST",
          body: JSON.stringify({
            session_id: live.sessionId || undefined,
            url: targetUrl,
            node_id: node.id,
            name: resolvedName,
            full_page: node.params.fullPage ?? false,
            locator: node.locator,
            timeout: node.timeout ?? 5000,
          }),
        });

        const durationMs = Date.now() - startTime;
        if (!res.ok) {
          const err = res.error || "Error al capturar pantalla en S3";
          store.addLog({ level: "error", message: `[Test] ${err}`, nodeId: node.id });
          return { ok: false, error: err, durationMs };
        }

        if (res.output !== undefined) {
          store.setNodeOutput(node.id, res.output);
        }
        const shotUrl = (res.output as { url?: string | null } | undefined)?.url;
        store.addLog({
          level: "success",
          message: shotUrl
            ? `[Test] Captura subida a S3: ${shotUrl} (${durationMs}ms)`
            : `[Test] Captura generada (${durationMs}ms)`,
          nodeId: node.id,
        });
        return { ok: true, output: res.output, durationMs };
      }

      // Pasos de interacción en navegador (click, type, select, waitFor, extract, scroll)
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
            if (node.type === "extract" && node.params.variable) {
              currentVariables[node.params.variable] = out;
            }
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
  const ownedBranchIds = collectOwnedBranchNodeIds(
    store.definition,
    new Set(orderedNodes.map((n) => n.id))
  );
  const effectiveNodes = orderedNodes.filter((n) => !ownedBranchIds.has(n.id));
  if (effectiveNodes.length === 0) {
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
  const firstNode = effectiveNodes[0];
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
  const ctx = createTesterContext(delayMs, currentAbort);

  store.setIsTestingSteps(true, {
    current: 1,
    total: effectiveNodes.length,
    nodeId: effectiveNodes[0].id,
  });
  store.addLog({
    level: "info",
    message: `[Test] Iniciando ejecución secuencial de ${effectiveNodes.length} pasos seleccionados en el simulador...`,
  });

  try {
    for (let i = 0; i < effectiveNodes.length; i++) {
      if (currentAbort.aborted) {
        return {
          completed: false,
          executedCount: i,
          totalCount: effectiveNodes.length,
          error: "Ejecución cancelada por el usuario",
        };
      }

      const currentNode = effectiveNodes[i];
      store.setRunningNodeId(currentNode.id);
      store.setIsTestingSteps(true, {
        current: i + 1,
        total: effectiveNodes.length,
        nodeId: currentNode.id,
      });

      options.onProgress?.({
        currentStepIndex: i,
        totalSteps: effectiveNodes.length,
        currentNodeId: currentNode.id,
        isTesting: true,
      });

      const result = await executeNodeWithContext(currentNode, ctx);

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
          totalCount: effectiveNodes.length,
          error: result.error,
          failedNodeId: currentNode.id,
        };
      }

      // Pausa visual entre pasos para apreciar la interacción en el simulador
      if (delayMs > 0 && i < effectiveNodes.length - 1) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    store.setRunningNodeId(null);
    store.setIsTestingSteps(false, null);
    store.addLog({
      level: "success",
      message: `[Test] Ejecución secuencial completada exitosamente (${effectiveNodes.length}/${effectiveNodes.length} pasos).`,
    });

    return {
      completed: true,
      executedCount: effectiveNodes.length,
      totalCount: effectiveNodes.length,
    };
  } finally {
    activeSequentialAbort = null;
    store.setRunningNodeId(null);
    store.setIsTestingSteps(false, null);
  }
}
