import type { RecipeNode } from "@rpa/dsl";
import type { NodeActionHandler } from "./types.js";

export class ActionHandlerRegistry {
  private handlers = new Map<string, NodeActionHandler<any>>();

  register<TNode extends RecipeNode>(handler: NodeActionHandler<TNode>): this {
    this.handlers.set(handler.type, handler);
    return this;
  }

  get<TNode extends RecipeNode>(type: TNode["type"]): NodeActionHandler<TNode> | undefined {
    return this.handlers.get(type);
  }

  has(type: string): boolean {
    return this.handlers.has(type);
  }

  getAllTypes(): string[] {
    return Array.from(this.handlers.keys());
  }
}
