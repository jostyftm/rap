import type { Page } from "playwright";
import type { ClickNode } from "@rpa/dsl";
import { resolveLocator } from "../locator-resolver.js";
import type { NodeActionHandler, ExecutionContext, ActionResult } from "./types.js";

export const clickHandler: NodeActionHandler<ClickNode> = {
  type: "click",
  async execute(page: Page, node: ClickNode, _ctx: ExecutionContext): Promise<ActionResult> {
    const resolvedLocator = await resolveLocator(page, node.locator, node.timeout);
    await resolvedLocator.locator.click({
      button: node.params.button ?? "left",
      clickCount: node.params.clickCount ?? 1,
      delay: node.params.delay,
    });
    return { success: true, resolvedLocator, nextNodeId: node.next };
  },
};
