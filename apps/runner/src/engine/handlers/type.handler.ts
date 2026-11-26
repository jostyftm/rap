import type { Page } from "playwright";
import type { TypeNode } from "@rpa/dsl";
import { resolveLocator } from "../locator-resolver.js";
import { interpolateString } from "../../evaluator/jsonata-evaluator.js";
import { createMissingTokenReporter } from "./token-warnings.js";
import type { NodeActionHandler, ExecutionContext, ActionResult } from "./types.js";

export const typeHandler: NodeActionHandler<TypeNode> = {
  type: "type",
  async execute(page: Page, node: TypeNode, ctx: ExecutionContext): Promise<ActionResult> {
    const textToType = interpolateString(node.params.text, ctx.variables, ctx.secrets, {
      onMissingTokens: createMissingTokenReporter(node.id, node.type, ctx),
    });

    const resolvedLocator = await resolveLocator(page, node.locator, node.timeout);
    const hasTimeout = typeof node.timeout === "number" && node.timeout > 0;

    if (node.params.clear !== false) {
      if (hasTimeout) {
        await resolvedLocator.locator.fill(textToType, { timeout: node.timeout });
      } else {
        await resolvedLocator.locator.fill(textToType);
      }
    } else {
      await resolvedLocator.locator.pressSequentially(textToType, {
        delay: node.params.delay ?? 20,
        ...(hasTimeout ? { timeout: node.timeout } : {}),
      });
    }
    if (node.params.pressEnter) {
      if (hasTimeout) {
        await resolvedLocator.locator.press("Enter", { timeout: node.timeout });
      } else {
        await resolvedLocator.locator.press("Enter");
      }
    }
    return { success: true, resolvedLocator, nextNodeId: node.next };
  },
};
