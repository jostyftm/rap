import type { Page } from "playwright";
import type { LoopNode } from "@rpa/dsl";
import type { NodeActionHandler, ExecutionContext, ActionResult } from "./types.js";

export const loopHandler: NodeActionHandler<LoopNode> = {
  type: "loop",
  async execute(_page: Page, node: LoopNode, _ctx: ExecutionContext): Promise<ActionResult> {
    // Manejado en el bucle del motor de ejecución principal
    return { success: true, nextNodeId: node.params.bodyEntryNodeId };
  },
};
