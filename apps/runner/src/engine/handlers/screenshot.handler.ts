import type { Page } from "playwright";
import type { ScreenshotNode } from "@rpa/dsl";
import { uploadArtifact } from "../../storage/s3.js";
import type { NodeActionHandler, ExecutionContext, ActionResult } from "./types.js";

export const screenshotHandler: NodeActionHandler<ScreenshotNode> = {
  type: "screenshot",
  async execute(page: Page, node: ScreenshotNode, ctx: ExecutionContext): Promise<ActionResult> {
    const screenshotBuffer = await page.screenshot({
      fullPage: node.params.fullPage ?? false,
    });
    const s3Key = `runs/${ctx.runId}/screenshots/${node.id}-${Date.now()}.png`;
    await uploadArtifact(s3Key, screenshotBuffer, "image/png");
    return { success: true, screenshotPath: s3Key, nextNodeId: node.next };
  },
};
