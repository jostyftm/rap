import vm from "node:vm";
import type { Page } from "playwright";
import type { JavascriptNode } from "@rpa/dsl";
import type { NodeActionHandler, ExecutionContext, ActionResult } from "./types.js";

const DEFAULT_SANDBOX_TIMEOUT_MS = 10_000;
const DEFAULT_BROWSER_TIMEOUT_MS = 30_000;
const MAX_JS_TIMEOUT_MS = 60_000;
const MIN_JS_TIMEOUT_MS = 100;
const RESERVED_VAR_NAMES = new Set(["__proto__", "constructor", "prototype"]);

export function cloneSafeValue<T>(value: T): T {
  if (value === undefined || value === null) {
    return value;
  }

  const primitiveType = typeof value;
  if (primitiveType === "string" || primitiveType === "number" || primitiveType === "boolean") {
    return value;
  }

  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      return undefined as unknown as T;
    }
    return JSON.parse(serialized) as T;
  } catch {
    try {
      return structuredClone(value);
    } catch {
      return String(value) as unknown as T;
    }
  }
}

function formatConsoleArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === "string") return arg;
      if (arg === undefined) return "undefined";
      if (arg === null) return "null";
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(" ");
}

function buildStepsSnapshot(
  stepResults: Record<string, unknown>
): Record<string, { output: unknown }> {
  const snapshot: Record<string, { output: unknown }> = {};
  for (const [nodeId, out] of Object.entries(stepResults)) {
    snapshot[nodeId] = { output: cloneSafeValue(out) };
  }
  return snapshot;
}

function buildVariablesSnapshot(variables: Record<string, unknown>): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(variables)) {
    if (key === "steps" || key.startsWith("steps.")) {
      continue;
    }
    snapshot[key] = cloneSafeValue(val);
  }
  return snapshot;
}

function clampTimeout(rawTimeout: number | undefined, fallback: number): number {
  const value = typeof rawTimeout === "number" && Number.isFinite(rawTimeout) ? rawTimeout : fallback;
  return Math.min(MAX_JS_TIMEOUT_MS, Math.max(MIN_JS_TIMEOUT_MS, Math.floor(value)));
}

async function runWithAsyncTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Tiempo de espera agotado (${timeoutMs}ms) al ejecutar código JavaScript`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

async function executeInSandbox(
  node: JavascriptNode,
  ctx: ExecutionContext,
  variablesSnapshot: Record<string, unknown>,
  stepsSnapshot: Record<string, { output: unknown }>,
  inputSnapshot: Record<string, unknown>
): Promise<unknown> {
  const timeoutMs = clampTimeout(node.timeout, DEFAULT_SANDBOX_TIMEOUT_MS);
  const pendingVariables: Record<string, unknown> = {};

  const setVariable = (name: string, value: unknown): void => {
    if (typeof name !== "string" || !name.trim() || RESERVED_VAR_NAMES.has(name)) {
      throw new Error(`Nombre de variable inválido en setVariable: '${String(name)}'`);
    }
    const safeVal = cloneSafeValue(value);
    pendingVariables[name] = safeVal;
    variablesSnapshot[name] = safeVal;
  };

  const emitJsLog = (level: "info" | "warn" | "error", args: unknown[]): void => {
    const formatted = formatConsoleArgs(args);
    ctx.log?.(level, `[JS ${node.id}] ${formatted}`, {
      scope: "javascript",
      nodeId: node.id,
    });
  };

  const sandboxConsole = {
    log: (...args: unknown[]) => emitJsLog("info", args),
    info: (...args: unknown[]) => emitJsLog("info", args),
    warn: (...args: unknown[]) => emitJsLog("warn", args),
    error: (...args: unknown[]) => emitJsLog("error", args),
  };

  const sandboxContext = vm.createContext(
    {
      variables: variablesSnapshot,
      steps: stepsSnapshot,
      input: inputSnapshot,
      setVariable,
      console: sandboxConsole,
      JSON,
      Math,
      Date,
      Object,
      Array,
      String,
      Number,
      Boolean,
      RegExp,
      Map,
      Set,
      URL,
      URLSearchParams,
      encodeURIComponent,
      decodeURIComponent,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      Promise,
    },
    {
      codeGeneration: {
        strings: false,
        wasm: false,
      },
    }
  );

  const wrappedCode = `(async () => {\n${node.params.code}\n})()`;
  const script = new vm.Script(wrappedCode, {
    filename: `rpa-node-${node.id}.js`,
  });

  const executionPromise = Promise.resolve(
    script.runInContext(sandboxContext, {
      timeout: timeoutMs,
    }) as Promise<unknown>
  );

  const rawResult = await runWithAsyncTimeout(executionPromise, timeoutMs);
  const safeOutput = cloneSafeValue(rawResult);

  for (const [k, v] of Object.entries(pendingVariables)) {
    ctx.variables[k] = v;
  }

  return safeOutput;
}

async function executeInBrowser(
  page: Page,
  node: JavascriptNode,
  variablesSnapshot: Record<string, unknown>,
  stepsSnapshot: Record<string, { output: unknown }>,
  inputSnapshot: Record<string, unknown>
): Promise<unknown> {
  const timeoutMs = clampTimeout(node.timeout, DEFAULT_BROWSER_TIMEOUT_MS);

  const evalPromise = page.evaluate(
    async ({ code, variables, steps, input }) => {
      const AsyncFn = new Function(
        "variables",
        "steps",
        "input",
        `return (async () => {\n${code}\n})();`
      );
      return await AsyncFn(variables, steps, input);
    },
    {
      code: node.params.code,
      variables: variablesSnapshot,
      steps: stepsSnapshot,
      input: inputSnapshot,
    }
  );

  const rawResult = await runWithAsyncTimeout(evalPromise, timeoutMs);
  return cloneSafeValue(rawResult);
}

export const javascriptHandler: NodeActionHandler<JavascriptNode> = {
  type: "javascript",
  async execute(page: Page, node: JavascriptNode, ctx: ExecutionContext): Promise<ActionResult> {
    const mode = node.params.mode === "browser" ? "browser" : "sandbox";
    const variablesSnapshot = buildVariablesSnapshot(ctx.variables);
    const stepsSnapshot = buildStepsSnapshot(ctx.stepResults);
    const inputSnapshot = cloneSafeValue(ctx.parameters ?? {});

    const safeOutput =
      mode === "browser"
        ? await executeInBrowser(page, node, variablesSnapshot, stepsSnapshot, inputSnapshot)
        : await executeInSandbox(node, ctx, variablesSnapshot, stepsSnapshot, inputSnapshot);

    const outVar = node.params.outputVariable?.trim();
    if (outVar && !RESERVED_VAR_NAMES.has(outVar)) {
      ctx.variables[outVar] = safeOutput;
    }

    return {
      success: true,
      output: safeOutput,
      nextNodeId: node.next,
    };
  },
};
