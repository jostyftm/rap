import type { Page } from "playwright";
import type { WaitForNode } from "@rpa/dsl";
import { resolveLocator, type ResolvedLocator } from "../locator-resolver.js";
import type { NodeActionHandler, ExecutionContext, ActionResult } from "./types.js";

export const waitForHandler: NodeActionHandler<WaitForNode> = {
  type: "waitFor",
  async execute(page: Page, node: WaitForNode, _ctx: ExecutionContext): Promise<ActionResult> {
    const { strategy, value } = node.params;
    let resolvedLocator: ResolvedLocator | undefined;

    if (strategy === "networkIdle") {
      await page.waitForLoadState("networkidle", { timeout: node.timeout ?? 10000 });
    } else if (strategy === "timeout" && typeof value === "number") {
      await page.waitForTimeout(value);
    } else if (strategy === "selector" && node.locator) {
      resolvedLocator = await resolveLocator(page, node.locator, node.timeout);
    } else if (strategy === "url" && typeof value === "string") {
      await page.waitForURL(new RegExp(value), { timeout: node.timeout ?? 10000 });
    }

    return { success: true, resolvedLocator, nextNodeId: node.next };
  },
};
