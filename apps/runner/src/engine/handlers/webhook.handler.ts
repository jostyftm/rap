import type { Page } from "playwright";
import type { WebhookNode } from "@rpa/dsl";
import type { NodeActionHandler, ExecutionContext, ActionResult } from "./types.js";

export const webhookHandler: NodeActionHandler<WebhookNode> = {
  type: "webhook",
  async execute(_page: Page, node: WebhookNode, ctx: ExecutionContext): Promise<ActionResult> {
    const varName = node.params.outputVariable || "webhook";

    // Extract payload from ctx.variables if passed in as execution parameters, or initialize test payload
    const existing = (ctx.variables[varName] || ctx.variables.webhook) as Record<string, unknown> | undefined;

    const payload = existing && typeof existing === "object"
      ? existing
      : {
          method: node.params.httpMethod || "POST",
          path: node.params.path || "/webhook",
          headers: {
            "content-type": "application/json",
            "user-agent": "RPAStudio-Webhook/1.0",
          },
          query: {},
          body: {},
          timestamp: new Date().toISOString(),
        };

    ctx.variables[varName] = payload;
    ctx.variables.webhook = payload;

    return {
      success: true,
      output: payload,
      nextNodeId: node.next,
    };
  },
};
