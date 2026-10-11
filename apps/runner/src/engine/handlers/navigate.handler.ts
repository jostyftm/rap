import type { Page } from "playwright";
import type { NavigateNode } from "@rpa/dsl";
import { interpolateString } from "../../evaluator/jsonata-evaluator.js";
import type { NodeActionHandler, ExecutionContext, ActionResult } from "./types.js";

export const navigateHandler: NodeActionHandler<NavigateNode> = {
  type: "navigate",
  async execute(page: Page, node: NavigateNode, ctx: ExecutionContext): Promise<ActionResult> {
    const targetUrl = interpolateString(node.params.url, ctx.variables, ctx.secrets);
    await page.goto(targetUrl, {
      waitUntil: node.params.waitUntil ?? "domcontentloaded",
      timeout: node.timeout ?? 30000,
    });
    return { success: true, nextNodeId: node.next };
  },
};
