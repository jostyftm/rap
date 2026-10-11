import type { Page } from "playwright";
import type { RecipeNode } from "@rpa/dsl";
import {
  defaultActionRegistry,
  ActionHandlerRegistry,
  type ExecutionContext,
  type ActionResult,
  type NodeActionHandler,
} from "./handlers/index.js";

export type { ExecutionContext, ActionResult, NodeActionHandler };
export { defaultActionRegistry, ActionHandlerRegistry };

export async function executeNodeAction(
  page: Page,
  node: RecipeNode,
  ctx: ExecutionContext,
  registry: ActionHandlerRegistry = defaultActionRegistry
): Promise<ActionResult> {
  const handler = registry.get(node.type);
  if (!handler) {
    throw new Error(`Tipo de nodo no soportado: ${(node as any).type}`);
  }
  return handler.execute(page, node, ctx);
}
