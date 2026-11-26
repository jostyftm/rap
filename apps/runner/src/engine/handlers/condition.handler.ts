import type { Page } from "playwright";
import type { ConditionNode } from "@rpa/dsl";
import {
  evaluateTypedCondition,
  isNullOrEmptyOperator,
  isUnaryConditionOperator,
  resolveConditionOperand,
} from "@rpa/dsl";
import { evaluateExpression } from "../../evaluator/jsonata-evaluator.js";
import { createMissingTokenReporter } from "./token-warnings.js";
import type { NodeActionHandler, ExecutionContext, ActionResult } from "./types.js";

export const conditionHandler: NodeActionHandler<ConditionNode> = {
  type: "condition",
  async execute(_page: Page, node: ConditionNode, ctx: ExecutionContext): Promise<ActionResult> {
    let isSatisfied = false;
    const { dataType, operator, leftOperand, rightOperand, expression } = node.params;

    if (dataType && dataType !== "custom" && operator) {
      const operandCtx = {
        variables: ctx.variables,
        stepResults: ctx.stepResults,
        secrets: ctx.secrets,
      };
      const leftResolved = resolveConditionOperand(leftOperand, operandCtx);
      if (leftResolved.missingToken && !isNullOrEmptyOperator(operator)) {
        createMissingTokenReporter(node.id, node.type, ctx)([leftResolved.missingToken]);
      }

      let rightVal: unknown = undefined;
      if (!isUnaryConditionOperator(operator)) {
        const rightResolved = resolveConditionOperand(rightOperand, operandCtx);
        if (rightResolved.missingToken) {
          createMissingTokenReporter(node.id, node.type, ctx)([rightResolved.missingToken]);
        }
        rightVal = rightResolved.value;
      }

      isSatisfied = evaluateTypedCondition(dataType, operator, leftResolved.value, rightVal);
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
