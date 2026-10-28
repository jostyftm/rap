import type { Page } from "playwright";
import type { SelectNode } from "@rpa/dsl";
import { resolveLocator } from "../locator-resolver.js";
import { interpolateString } from "../../evaluator/jsonata-evaluator.js";
import { createMissingTokenReporter } from "./token-warnings.js";
import type { NodeActionHandler, ExecutionContext, ActionResult } from "./types.js";

export const selectHandler: NodeActionHandler<SelectNode> = {
  type: "select",
  async execute(page: Page, node: SelectNode, ctx: ExecutionContext): Promise<ActionResult> {
    const resolvedLocator = await resolveLocator(page, node.locator, node.timeout);
    const val = interpolateString(node.params.value, ctx.variables, ctx.secrets, {
      onMissingTokens: createMissingTokenReporter(node.id, node.type, ctx),
    });
    await resolvedLocator.locator.selectOption(val);
    return { success: true, resolvedLocator, nextNodeId: node.next };
  },
};
