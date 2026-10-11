import type { Page } from "playwright";
import type { TypeNode } from "@rpa/dsl";
import { resolveLocator } from "../locator-resolver.js";
import { interpolateString } from "../../evaluator/jsonata-evaluator.js";
import type { NodeActionHandler, ExecutionContext, ActionResult } from "./types.js";

export const typeHandler: NodeActionHandler<TypeNode> = {
  type: "type",
  async execute(page: Page, node: TypeNode, ctx: ExecutionContext): Promise<ActionResult> {
    const resolvedLocator = await resolveLocator(page, node.locator, node.timeout);
    const textToType = interpolateString(node.params.text, ctx.variables, ctx.secrets);
    if (node.params.clear !== false) {
      await resolvedLocator.locator.fill(textToType);
    } else {
      await resolvedLocator.locator.pressSequentially(textToType, {
        delay: node.params.delay ?? 20,
      });
    }
    return { success: true, resolvedLocator, nextNodeId: node.next };
  },
};
