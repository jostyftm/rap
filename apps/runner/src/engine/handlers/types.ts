import type { Page } from "playwright";
import type { RecipeNode } from "@rpa/dsl";
import type { ResolvedLocator } from "../locator-resolver.js";

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

export interface NodeActionHandler<TNode extends RecipeNode = RecipeNode> {
  readonly type: TNode["type"];
  execute(page: Page, node: TNode, ctx: ExecutionContext): Promise<ActionResult>;
}
