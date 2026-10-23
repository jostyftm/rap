import type { Page } from "playwright";
import type { TryCatchNode } from "@rpa/dsl";
import type { NodeActionHandler, ExecutionContext, ActionResult } from "./types.js";

export const tryCatchHandler: NodeActionHandler<TryCatchNode> = {
  type: "tryCatch",
  async execute(_page: Page, node: TryCatchNode, _ctx: ExecutionContext): Promise<ActionResult> {
    // El motor de ejecución intercepta este nodo para orquestar try/catch/finally.
    // Si se invoca de forma aislada, entra al bloque try.
    return { success: true, nextNodeId: node.params.tryEntryNodeId };
  },
};
