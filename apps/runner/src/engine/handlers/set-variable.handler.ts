import type { Page } from "playwright";
import type { SetVariableNode } from "@rpa/dsl";
import { evaluateExpression } from "../../evaluator/jsonata-evaluator.js";
import type { NodeActionHandler, ExecutionContext, ActionResult } from "./types.js";

export const setVariableHandler: NodeActionHandler<SetVariableNode> = {
  type: "setVariable",
  async execute(_page: Page, node: SetVariableNode, ctx: ExecutionContext): Promise<ActionResult> {
    const evaluated = await evaluateExpression(node.params.expression, {
      ...ctx.variables,
      stepResults: ctx.stepResults,
    });
    ctx.variables[node.params.name] = evaluated;
    return { success: true, output: evaluated, nextNodeId: node.next };
  },
};
