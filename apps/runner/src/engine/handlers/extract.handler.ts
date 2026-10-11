import type { Page } from "playwright";
import type { ExtractNode } from "@rpa/dsl";
import { resolveLocator } from "../locator-resolver.js";
import type { NodeActionHandler, ExecutionContext, ActionResult } from "./types.js";

export const extractHandler: NodeActionHandler<ExtractNode> = {
  type: "extract",
  async execute(page: Page, node: ExtractNode, ctx: ExecutionContext): Promise<ActionResult> {
    const resolvedLocator = await resolveLocator(page, node.locator, node.timeout);
    let extractedValue: unknown;

    if (node.params.extractType === "attribute" && node.params.attributeName) {
      extractedValue = await resolvedLocator.locator.getAttribute(node.params.attributeName);
    } else if (node.params.extractType === "list") {
      extractedValue = await resolvedLocator.locator.allInnerTexts();
    } else {
      extractedValue = await resolvedLocator.locator.innerText();
    }

    ctx.variables[node.params.variable] = extractedValue;
    return { success: true, resolvedLocator, output: extractedValue, nextNodeId: node.next };
  },
};
