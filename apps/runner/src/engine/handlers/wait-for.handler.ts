import type { Page } from "playwright";
import type { WaitForNode } from "@rpa/dsl";
import { resolveLocator, type ResolvedLocator } from "../locator-resolver.js";
import { interpolateString } from "../../evaluator/jsonata-evaluator.js";
import { createMissingTokenReporter } from "./token-warnings.js";
import type { NodeActionHandler, ExecutionContext, ActionResult } from "./types.js";

function resolveSelectorTimeoutMs(value: unknown, nodeTimeout?: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    if (parsed > 0) return parsed;
  }
  if (typeof nodeTimeout === "number" && Number.isFinite(nodeTimeout) && nodeTimeout > 0) {
    return nodeTimeout;
  }
  return 10000;
}

export const waitForHandler: NodeActionHandler<WaitForNode> = {
  type: "waitFor",
  async execute(page: Page, node: WaitForNode, ctx: ExecutionContext): Promise<ActionResult> {
    const { strategy } = node.params;
    const value =
      typeof node.params.value === "string"
        ? interpolateString(node.params.value, ctx.variables, ctx.secrets, {
            onMissingTokens: createMissingTokenReporter(node.id, node.type, ctx),
          })
        : node.params.value;
    let resolvedLocator: ResolvedLocator | undefined;

    if (strategy === "networkIdle") {
      await page.waitForLoadState("networkidle", { timeout: node.timeout ?? 10000 });
    } else if (strategy === "timeout" && typeof value === "number") {
      await page.waitForTimeout(value);
    } else if (strategy === "selector") {
      const selectorTimeout = resolveSelectorTimeoutMs(value, node.timeout);
      if (node.locator?.primary?.value) {
        resolvedLocator = await resolveLocator(page, node.locator, selectorTimeout);
      } else if (typeof value === "string" && value.trim().length > 0) {
        const raw = value.trim();
        const selector =
          (raw.startsWith("/") || raw.startsWith("(")) && !raw.startsWith("xpath=")
            ? `xpath=${raw}`
            : raw;
        await page.locator(selector).first().waitFor({
          state: "visible",
          timeout: node.timeout ?? 10000,
        });
      }
    } else if (strategy === "text" && typeof value === "string" && value.trim().length > 0) {
      await page.getByText(value.trim(), { exact: false }).first().waitFor({
        state: "visible",
        timeout: node.timeout ?? 10000,
      });
    } else if (strategy === "url" && typeof value === "string") {
      await page.waitForURL(new RegExp(value), { timeout: node.timeout ?? 10000 });
    }

    return { success: true, resolvedLocator, nextNodeId: node.next };
  },
};
