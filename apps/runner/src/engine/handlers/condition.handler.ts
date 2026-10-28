import type { Page } from "playwright";
import type { ConditionNode, ConditionDataType, ConditionOperator } from "@rpa/dsl";
import { evaluateExpression } from "../../evaluator/jsonata-evaluator.js";
import { createMissingTokenReporter } from "./token-warnings.js";
import type { NodeActionHandler, ExecutionContext, ActionResult } from "./types.js";

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  if (path in obj) return obj[path];
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function resolveOperand(
  operandStr: string | undefined,
  ctx: ExecutionContext,
  node?: ConditionNode
): unknown {
  if (operandStr === undefined || operandStr === null) return undefined;
  const trimmed = operandStr.trim();
  if (trimmed.startsWith("{{") && trimmed.endsWith("}}")) {
    const key = trimmed.slice(2, -2).trim();
    if (key.startsWith("secret.")) {
      return ctx.secrets[key.replace("secret.", "")];
    }
    if (key.startsWith("variables.")) {
      return getNestedValue(ctx.variables, key.replace("variables.", ""));
    }
    const val = getNestedValue(ctx.variables, key);
    if (val !== undefined) return val;
    const stepVal = getNestedValue(ctx.stepResults, key);
    if (stepVal !== undefined) return stepVal;
    if (node) {
      createMissingTokenReporter(node.id, node.type, ctx)([key]);
    }
    return undefined;
  }

  if (trimmed in ctx.variables) return ctx.variables[trimmed];
  const nestedVar = getNestedValue(ctx.variables, trimmed);
  if (nestedVar !== undefined) return nestedVar;
  const nestedStep = getNestedValue(ctx.stepResults, trimmed);
  if (nestedStep !== undefined) return nestedStep;

  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (!Number.isNaN(Number(trimmed)) && trimmed !== "") return Number(trimmed);
  return trimmed;
}

function evaluateTypedCondition(
  dataType: ConditionDataType,
  operator: ConditionOperator,
  left: unknown,
  right: unknown
): boolean {
  switch (dataType) {
    case "string": {
      const sLeft = String(left ?? "");
      const sRight = String(right ?? "");
      switch (operator) {
        case "equals": return sLeft === sRight;
        case "not_equals": return sLeft !== sRight;
        case "contains": return sLeft.toLowerCase().includes(sRight.toLowerCase());
        case "not_contains": return !sLeft.toLowerCase().includes(sRight.toLowerCase());
        case "starts_with": return sLeft.startsWith(sRight);
        case "ends_with": return sLeft.endsWith(sRight);
        case "regex_match": {
          try {
            return new RegExp(sRight).test(sLeft);
          } catch {
            return false;
          }
        }
        default: return sLeft === sRight;
      }
    }
    case "number": {
      const nLeft = Number(left);
      const nRight = Number(right);
      switch (operator) {
        case "equals": return nLeft === nRight;
        case "not_equals": return nLeft !== nRight;
        case "greater_than": return nLeft > nRight;
        case "greater_than_or_equal": return nLeft >= nRight;
        case "less_than": return nLeft < nRight;
        case "less_than_or_equal": return nLeft <= nRight;
        default: return nLeft === nRight;
      }
    }
    case "boolean": {
      const bLeft = typeof left === "boolean" ? left : String(left).toLowerCase() === "true";
      switch (operator) {
        case "is_true": return bLeft === true;
        case "is_false": return bLeft === false;
        case "equals": {
          const bRight = typeof right === "boolean" ? right : String(right).toLowerCase() === "true";
          return bLeft === bRight;
        }
        case "not_equals": {
          const bRight = typeof right === "boolean" ? right : String(right).toLowerCase() === "true";
          return bLeft !== bRight;
        }
        default: return bLeft === true;
      }
    }
    case "array": {
      const arr = Array.isArray(left) ? left : [];
      switch (operator) {
        case "array_contains": return arr.some((item) => String(item) === String(right));
        case "array_is_empty": return arr.length === 0;
        case "array_not_empty": return arr.length > 0;
        default: return arr.length > 0;
      }
    }
    case "exists": {
      const isNullOrEmpty =
        left === null ||
        left === undefined ||
        left === "" ||
        (Array.isArray(left) && left.length === 0);
      switch (operator) {
        case "is_null_or_empty": return isNullOrEmpty;
        case "is_not_null_or_empty": return !isNullOrEmpty;
        default: return !isNullOrEmpty;
      }
    }
    default:
      return Boolean(left);
  }
}

export const conditionHandler: NodeActionHandler<ConditionNode> = {
  type: "condition",
  async execute(_page: Page, node: ConditionNode, ctx: ExecutionContext): Promise<ActionResult> {
    let isSatisfied = false;
    const { dataType, operator, leftOperand, rightOperand, expression } = node.params;

    if (dataType && dataType !== "custom" && operator) {
      const leftVal = resolveOperand(leftOperand, ctx, node);
      const rightVal = resolveOperand(rightOperand, ctx, node);
      isSatisfied = evaluateTypedCondition(dataType, operator, leftVal, rightVal);
    } else {
      const conditionResult = await evaluateExpression(expression, {
        ...ctx.variables,
        stepResults: ctx.stepResults,
      });
      isSatisfied = Boolean(conditionResult);
    }

    const nextNodeId = isSatisfied ? node.params.thenNodeId : (node.params.elseNodeId ?? node.next);
    return { success: true, output: isSatisfied, nextNodeId };
  },
};
