import type { Page } from "playwright";
import type { LocatorGroup, ScreenshotNode } from "@rpa/dsl";
import { resolveLocator, type ResolvedLocator } from "../locator-resolver.js";
import { uploadArtifactWithStatus } from "../../storage/s3.js";
import type { NodeActionHandler, ExecutionContext, ActionResult } from "./types.js";

export interface CaptureScreenshotOptions {
  scopePath: string;
  nodeId: string;
  name?: string;
  fullPage?: boolean;
  locator?: LocatorGroup;
  timeout?: number;
  onWarn?: (message: string, context?: Record<string, unknown>) => void;
}

export interface CaptureScreenshotOutput {
  url: string | null;
  s3Url: string | null;
  s3Key: string;
  bucket: string;
  contentType: "image/png";
  sizeBytes: number;
  uploaded: boolean;
  name?: string;
}

export async function captureAndUploadScreenshot(
  page: Page,
  opts: CaptureScreenshotOptions
): Promise<{
  output: CaptureScreenshotOutput;
  screenshotPath: string;
  resolvedLocator?: ResolvedLocator;
}> {
  let resolvedLocator: ResolvedLocator | undefined;
  let screenshotBuffer: Buffer;

  if (opts.locator?.primary?.value) {
    resolvedLocator = await resolveLocator(page, opts.locator, opts.timeout ?? 10000);
    const hasTimeout = typeof opts.timeout === "number" && opts.timeout > 0;
    screenshotBuffer = hasTimeout
      ? await resolvedLocator.locator.screenshot({ timeout: opts.timeout })
      : await resolvedLocator.locator.screenshot();
  } else {
    screenshotBuffer = await page.screenshot({
      fullPage: opts.fullPage ?? false,
    });
  }

  const customName = opts.name?.trim();
  const safeBase = (customName || opts.nodeId).replace(/[^a-zA-Z0-9_-]+/g, "_") || opts.nodeId;
  const s3Key = `${opts.scopePath.replace(/\/+$/, "")}/${safeBase}-${Date.now()}.png`;
  const upload = await uploadArtifactWithStatus(s3Key, screenshotBuffer, "image/png");

  if (!upload.uploaded) {
    opts.onWarn?.(
      `No se pudo subir la captura '${upload.key}' a S3; url no disponible.`,
      { scope: "screenshot", s3Key: upload.key }
    );
  }

  const output: CaptureScreenshotOutput = {
    url: upload.uploaded ? upload.url : null,
    s3Url: upload.uploaded ? upload.url : null,
    s3Key: upload.key,
    bucket: upload.bucket,
    contentType: "image/png",
    sizeBytes: screenshotBuffer.byteLength,
    uploaded: upload.uploaded,
    ...(customName ? { name: customName } : {}),
  };

  return {
    output,
    screenshotPath: upload.key,
    resolvedLocator,
  };
}

export const screenshotHandler: NodeActionHandler<ScreenshotNode> = {
  type: "screenshot",
  async execute(page: Page, node: ScreenshotNode, ctx: ExecutionContext): Promise<ActionResult> {
    const captured = await captureAndUploadScreenshot(page, {
      scopePath: `runs/${ctx.runId}/screenshots`,
      nodeId: node.id,
      name: node.params.name,
      fullPage: node.params.fullPage,
      locator: node.locator,
      timeout: node.timeout,
      onWarn: ctx.warn,
    });

    return {
      success: true,
      screenshotPath: captured.screenshotPath,
      resolvedLocator: captured.resolvedLocator,
      output: captured.output,
      nextNodeId: node.next,
    };
  },
};
