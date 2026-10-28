import type { Page } from "playwright";
import type { ClickNode } from "@rpa/dsl";
import { resolveLocator } from "../locator-resolver.js";
import type { NodeActionHandler, ExecutionContext, ActionResult } from "./types.js";

export const clickHandler: NodeActionHandler<ClickNode> = {
  type: "click",
  async execute(page: Page, node: ClickNode, _ctx: ExecutionContext): Promise<ActionResult> {
    if (node.params.targetScope === "desktop" && node.params.coordinates) {
      await page.mouse.click(node.params.coordinates.x, node.params.coordinates.y, {
        button: node.params.button ?? "left",
        clickCount: node.params.clickCount ?? 1,
        delay: node.params.delay,
      });
      return { success: true, nextNodeId: node.next };
    }

    const resolvedLocator = await resolveLocator(page, node.locator, node.timeout);
    await resolvedLocator.locator.click({
      button: node.params.button ?? "left",
      clickCount: node.params.clickCount ?? 1,
      delay: node.params.delay,
    });
    return { success: true, resolvedLocator, nextNodeId: node.next };
  },
};
