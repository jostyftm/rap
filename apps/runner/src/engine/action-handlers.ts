import type { Page } from "playwright";
import type { RecipeNode } from "@rpa/dsl";
import { resolveLocator, type ResolvedLocator } from "./locator-resolver.js";
import { evaluateExpression, interpolateString } from "../evaluator/jsonata-evaluator.js";
import { uploadArtifact } from "../storage/s3.js";

export interface ExecutionContext {
  runId: string;
  variables: Record<string, unknown>;
  secrets: Record<string, string>;
  stepResults: Record<string, unknown>;
}

export interface ActionResult {
  success: boolean;
  resolvedLocator?: ResolvedLocator;
  screenshotPath?: string;
  nextNodeId?: string;
  output?: unknown;
}

export async function executeNodeAction(
  page: Page,
  node: RecipeNode,
  ctx: ExecutionContext
): Promise<ActionResult> {
  let resolvedLocator: ResolvedLocator | undefined;

  switch (node.type) {
    case "navigate": {
      const targetUrl = interpolateString(node.params.url, ctx.variables, ctx.secrets);
      await page.goto(targetUrl, {
        waitUntil: node.params.waitUntil ?? "domcontentloaded",
        timeout: node.timeout ?? 30000,
      });
      return { success: true, nextNodeId: node.next };
    }

    case "click": {
      resolvedLocator = await resolveLocator(page, node.locator, node.timeout);
      await resolvedLocator.locator.click({
        button: node.params.button ?? "left",
        clickCount: node.params.clickCount ?? 1,
        delay: node.params.delay,
      });
      return { success: true, resolvedLocator, nextNodeId: node.next };
    }

    case "type": {
      resolvedLocator = await resolveLocator(page, node.locator, node.timeout);
      const textToType = interpolateString(node.params.text, ctx.variables, ctx.secrets);
      if (node.params.clear !== false) {
        await resolvedLocator.locator.fill(textToType);
      } else {
        await resolvedLocator.locator.pressSequentially(textToType, {
          delay: node.params.delay ?? 20,
        });
      }
      return { success: true, resolvedLocator, nextNodeId: node.next };
    }

    case "select": {
      resolvedLocator = await resolveLocator(page, node.locator, node.timeout);
      const val = interpolateString(node.params.value, ctx.variables, ctx.secrets);
      await resolvedLocator.locator.selectOption(val);
      return { success: true, resolvedLocator, nextNodeId: node.next };
    }

    case "waitFor": {
      const { strategy, value } = node.params;
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
    }

    case "extract": {
      resolvedLocator = await resolveLocator(page, node.locator, node.timeout);
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
    }

    case "screenshot": {
      const screenshotBuffer = await page.screenshot({
        fullPage: node.params.fullPage ?? false,
      });
      const s3Key = `runs/${ctx.runId}/screenshots/${node.id}-${Date.now()}.png`;
      await uploadArtifact(s3Key, screenshotBuffer, "image/png");
      return { success: true, screenshotPath: s3Key, nextNodeId: node.next };
    }

    case "setVariable": {
      const evaluated = await evaluateExpression(node.params.expression, {
        ...ctx.variables,
        stepResults: ctx.stepResults,
      });
      ctx.variables[node.params.name] = evaluated;
      return { success: true, output: evaluated, nextNodeId: node.next };
    }

    case "condition": {
      const conditionResult = await evaluateExpression(node.params.expression, {
        ...ctx.variables,
        stepResults: ctx.stepResults,
      });
      const nextNodeId = conditionResult ? node.params.thenNodeId : (node.params.elseNodeId ?? node.next);
      return { success: true, output: Boolean(conditionResult), nextNodeId };
    }

    case "loop": {
      // Manejado en el bucle del motor de ejecución principal
      return { success: true, nextNodeId: node.params.bodyEntryNodeId };
    }

    default:
      throw new Error(`Tipo de nodo no soportado: ${(node as any).type}`);
  }
}
