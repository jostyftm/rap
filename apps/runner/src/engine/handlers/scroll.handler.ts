import type { Page } from "playwright";
import type { ScrollNode } from "@rpa/dsl";
import { resolveLocator, type ResolvedLocator } from "../locator-resolver.js";
import type { NodeActionHandler, ExecutionContext, ActionResult } from "./types.js";

export const scrollHandler: NodeActionHandler<ScrollNode> = {
  type: "scroll",
  async execute(page: Page, node: ScrollNode, _ctx: ExecutionContext): Promise<ActionResult> {
    let resolvedLocator: ResolvedLocator | undefined;
    const mode = node.params.mode || "element";
    const behavior = node.params.behavior || "smooth";

    if (mode === "element" && node.locator) {
      resolvedLocator = await resolveLocator(page, node.locator, node.timeout);
      await resolvedLocator.locator.scrollIntoViewIfNeeded({ timeout: node.timeout ?? 10000 });
    } else if (mode === "top") {
      await page.evaluate((b) => window.scrollTo({ top: 0, behavior: b as ScrollBehavior }), behavior);
    } else if (mode === "bottom") {
      await page.evaluate(
        (b) => window.scrollTo({ top: document.body.scrollHeight, behavior: b as ScrollBehavior }),
        behavior
      );
    } else {
      const x = node.params.x || 0;
      const y = node.params.y ?? 500;
      await page.evaluate(
        ({ left, top, b }) => window.scrollBy({ left, top, behavior: b as ScrollBehavior }),
        { left: x, top: y, b: behavior }
      );
    }

    return { success: true, resolvedLocator, nextNodeId: node.next };
  },
};
