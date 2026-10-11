import type { Page } from "playwright";
import type { ConditionNode } from "@rpa/dsl";
import { evaluateExpression } from "../../evaluator/jsonata-evaluator.js";
import type { NodeActionHandler, ExecutionContext, ActionResult } from "./types.js";

export const conditionHandler: NodeActionHandler<ConditionNode> = {
  type: "condition",
  async execute(_page: Page, node: ConditionNode, ctx: ExecutionContext): Promise<ActionResult> {
    const conditionResult = await evaluateExpression(node.params.expression, {
      ...ctx.variables,
      stepResults: ctx.stepResults,
    });
    const nextNodeId = conditionResult ? node.params.thenNodeId : (node.params.elseNodeId ?? node.next);
    return { success: true, output: Boolean(conditionResult), nextNodeId };
  },
};
