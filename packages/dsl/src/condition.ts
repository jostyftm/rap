import { getNestedValue } from "./expressions.js";
import type { ConditionDataType, ConditionOperator } from "./types.js";

export const UNARY_CONDITION_OPERATORS = new Set<ConditionOperator>([
  "is_true",
  "is_false",
  "array_is_empty",
  "array_not_empty",
  "is_null",
  "is_not_null",
  "is_empty",
  "is_not_empty",
  "is_null_or_empty",
  "is_not_null_or_empty",
]);

export const NULL_OR_EMPTY_CONDITION_OPERATORS = new Set<ConditionOperator>([
  "is_null",
  "is_not_null",
  "is_empty",
  "is_not_empty",
  "is_null_or_empty",
  "is_not_null_or_empty",
]);

export function isUnaryConditionOperator(operator?: string): boolean {
  return Boolean(operator && UNARY_CONDITION_OPERATORS.has(operator as ConditionOperator));
}

export function isNullOrEmptyOperator(operator?: string): boolean {
  return Boolean(
    operator && NULL_OR_EMPTY_CONDITION_OPERATORS.has(operator as ConditionOperator)
  );
}

export function isNullishValue(value: unknown): boolean {
  return value === null || value === undefined;
}

/**
 * Determina si un valor se considera vacío:
 * - null / undefined -> true
 * - string sin contenido tras hacer trim ("", "   ") -> true
 * - Array sin elementos ([]) -> true
 * - Objeto plano sin propiedades ({}) -> true (Date / RegExp no se consideran vacíos)
 * - 0 y false NO se consideran vacíos
 */
export function isEmptyConditionValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") {
    if (value instanceof Date || value instanceof RegExp) return false;
    return Object.keys(value).length === 0;
  }
  return false;
}

export interface ConditionOperandContext {
  variables?: Record<string, unknown>;
  stepResults?: Record<string, unknown>;
  secrets?: Record<string, string>;
  webhookOutput?: unknown;
}

function resolveVariablePath(
  variables: Record<string, unknown>,
  varPath: string
): { found: boolean; value: unknown } {
  if (varPath in variables && variables[varPath] !== undefined) {
    return { found: true, value: variables[varPath] };
  }
  const val = getNestedValue(variables, varPath);
  return { found: val !== undefined, value: val };
}

function resolveStepPath(
  variables: Record<string, unknown>,
  stepResults: Record<string, unknown>,
  rest: string
): { found: boolean; value: unknown } {
  const normalized = rest.replace(/\[(\w+)\]/g, ".$1").replace(/^\./, "");
  const parts = normalized.split(".");
  const stepId = parts[0];
  if (!stepId) return { found: false, value: undefined };

  const fieldPath = parts.slice(1).join(".");
  const stepsObj =
    variables.steps && typeof variables.steps === "object"
      ? (variables.steps as Record<string, unknown>)
      : undefined;
  const stepEntry = stepsObj?.[stepId] as Record<string, unknown> | undefined;

  let stepOut: unknown = undefined;
  let hasStepOut = false;

  if (stepId in stepResults && stepResults[stepId] !== undefined) {
    stepOut = stepResults[stepId];
    hasStepOut = true;
  } else if (
    stepEntry &&
    typeof stepEntry === "object" &&
    "output" in stepEntry &&
    stepEntry.output !== undefined
  ) {
    stepOut = stepEntry.output;
    hasStepOut = true;
  } else if (
    `steps.${stepId}.output` in variables &&
    variables[`steps.${stepId}.output`] !== undefined
  ) {
    stepOut = variables[`steps.${stepId}.output`];
    hasStepOut = true;
  }

  if (!hasStepOut) {
    return { found: false, value: undefined };
  }

  if (!fieldPath || fieldPath === "output") {
    return { found: true, value: stepOut };
  }

  const cleanPath = fieldPath.startsWith("output.")
    ? fieldPath.slice("output.".length)
    : fieldPath;
  const resolved = getNestedValue(stepOut, cleanPath);
  return { found: resolved !== undefined, value: resolved };
}

function resolveWebhookPath(
  variables: Record<string, unknown>,
  webhookOutput: unknown,
  subPath: string
): { found: boolean; value: unknown } {
  const root = variables.webhook !== undefined ? variables.webhook : webhookOutput;
  if (root === undefined) {
    return { found: false, value: undefined };
  }
  if (!subPath) {
    return { found: true, value: root };
  }
  const val = getNestedValue(root, subPath);
  return { found: val !== undefined, value: val };
}

/**
 * Resuelve un operando de condición soportando tokens `{{...}}`, rutas directas
 * (`variables.*`, `steps.*`, `webhook.*`), propiedades anidadas/corchetes y literales
 * (`null`, `undefined`, booleanos, números y cadenas).
 */
export function resolveConditionOperand(
  operandStr: string | undefined,
  ctx: ConditionOperandContext = {}
): { value: unknown; missingToken?: string } {
  if (operandStr === undefined || operandStr === null) {
    return { value: undefined };
  }

  const trimmed = operandStr.trim();
  if (trimmed === "") {
    return { value: "" };
  }

  const variables = ctx.variables ?? {};
  const stepResults = ctx.stepResults ?? {};
  const secrets = ctx.secrets ?? {};

  const tokenMatch = /^\{\{([^{}]+)\}\}$/.exec(trimmed);
  if (tokenMatch) {
    const key = tokenMatch[1].trim();

    if (key.startsWith("secret.")) {
      const secretKey = key.slice("secret.".length);
      const secretVal = secrets[secretKey];
      return secretVal !== undefined
        ? { value: secretVal }
        : { value: undefined, missingToken: key };
    }

    if (key.startsWith("variables.")) {
      const res = resolveVariablePath(variables, key.slice("variables.".length));
      return res.found
        ? { value: res.value }
        : { value: undefined, missingToken: key };
    }

    if (key.startsWith("steps.")) {
      const res = resolveStepPath(variables, stepResults, key.slice("steps.".length));
      return res.found
        ? { value: res.value }
        : { value: undefined, missingToken: key };
    }

    if (key === "webhook" || key.startsWith("webhook.")) {
      const subPath = key === "webhook" ? "" : key.slice("webhook.".length);
      const res = resolveWebhookPath(variables, ctx.webhookOutput, subPath);
      return res.found
        ? { value: res.value }
        : { value: undefined, missingToken: key };
    }

    const directVar = resolveVariablePath(variables, key);
    if (directVar.found) {
      return { value: directVar.value };
    }

    const stepVal = getNestedValue(stepResults, key);
    if (stepVal !== undefined) {
      return { value: stepVal };
    }

    return { value: undefined, missingToken: key };
  }

  if (trimmed.startsWith("variables.")) {
    const res = resolveVariablePath(variables, trimmed.slice("variables.".length));
    return { value: res.found ? res.value : undefined };
  }

  if (trimmed.startsWith("steps.")) {
    const res = resolveStepPath(variables, stepResults, trimmed.slice("steps.".length));
    return { value: res.found ? res.value : undefined };
  }

  if (trimmed === "webhook" || trimmed.startsWith("webhook.")) {
    const subPath = trimmed === "webhook" ? "" : trimmed.slice("webhook.".length);
    const res = resolveWebhookPath(variables, ctx.webhookOutput, subPath);
    return { value: res.found ? res.value : undefined };
  }

  const directVar = resolveVariablePath(variables, trimmed);
  if (directVar.found) {
    return { value: directVar.value };
  }

  const nestedStep = getNestedValue(stepResults, trimmed);
  if (nestedStep !== undefined) {
    return { value: nestedStep };
  }

  if (trimmed === "null") return { value: null };
  if (trimmed === "undefined") return { value: undefined };
  if (trimmed === "true") return { value: true };
  if (trimmed === "false") return { value: false };
  if (!Number.isNaN(Number(trimmed)) && trimmed !== "") {
    return { value: Number(trimmed) };
  }

  return { value: trimmed };
}

function toComparableNumber(val: unknown): number {
  if (val === null || val === undefined) return Number.NaN;
  if (typeof val === "string" && val.trim() === "") return Number.NaN;
  return Number(val);
}

function toComparableBoolean(val: unknown): boolean {
  return typeof val === "boolean" ? val : String(val ?? "").toLowerCase() === "true";
}

export function evaluateTypedCondition(
  dataType: ConditionDataType,
  operator: ConditionOperator,
  left: unknown,
  right?: unknown
): boolean {
  switch (operator) {
    case "is_null":
      return isNullishValue(left);
    case "is_not_null":
      return !isNullishValue(left);
    case "is_empty":
    case "is_null_or_empty":
      return isEmptyConditionValue(left);
    case "is_not_empty":
    case "is_not_null_or_empty":
      return !isEmptyConditionValue(left);
  }

  switch (dataType) {
    case "string": {
      const sLeft = String(left ?? "");
      const sRight = String(right ?? "");
      switch (operator) {
        case "equals":
          return sLeft === sRight;
        case "not_equals":
          return sLeft !== sRight;
        case "contains":
          return sLeft.toLowerCase().includes(sRight.toLowerCase());
        case "not_contains":
          return !sLeft.toLowerCase().includes(sRight.toLowerCase());
        case "starts_with":
          return sLeft.startsWith(sRight);
        case "ends_with":
          return sLeft.endsWith(sRight);
        case "regex_match": {
          try {
            return new RegExp(sRight).test(sLeft);
          } catch {
            return false;
          }
        }
        default:
          return sLeft === sRight;
      }
    }
    case "number": {
      const leftNullish = isNullishValue(left);
      const rightNullish = isNullishValue(right);
      if (leftNullish && rightNullish) {
        if (operator === "equals") return true;
        if (operator === "not_equals") return false;
        return false;
      }
      const nLeft = toComparableNumber(left);
      const nRight = toComparableNumber(right);
      switch (operator) {
        case "equals":
          return nLeft === nRight;
        case "not_equals":
          return nLeft !== nRight;
        case "greater_than":
          return nLeft > nRight;
        case "greater_than_or_equal":
          return nLeft >= nRight;
        case "less_than":
          return nLeft < nRight;
        case "less_than_or_equal":
          return nLeft <= nRight;
        default:
          return nLeft === nRight;
      }
    }
    case "boolean": {
      const bLeft = toComparableBoolean(left);
      switch (operator) {
        case "is_true":
          return bLeft === true;
        case "is_false":
          return bLeft === false;
        case "equals":
          return bLeft === toComparableBoolean(right);
        case "not_equals":
          return bLeft !== toComparableBoolean(right);
        default:
          return bLeft === true;
      }
    }
    case "array": {
      const arr = Array.isArray(left) ? left : [];
      switch (operator) {
        case "array_contains":
          return arr.some((item) => String(item) === String(right));
        case "array_is_empty":
          return arr.length === 0;
        case "array_not_empty":
          return arr.length > 0;
        default:
          return arr.length > 0;
      }
    }
    case "exists": {
      return !isEmptyConditionValue(left);
    }
    default:
      return Boolean(left);
  }
}
