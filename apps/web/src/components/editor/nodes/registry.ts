import type { RecipeNode } from "@rpa/dsl";
import type { NodeDefinition } from "./types";

/**
 * NodeRegistry & NodeFactory
 * Patrón Factory y Registry para instanciación y resolución polimórfica de nodos.
 */
class NodeRegistry {
  private definitions = new Map<RecipeNode["type"], NodeDefinition<any>>();

  register<T extends RecipeNode>(definition: NodeDefinition<T>): void {
    this.definitions.set(definition.type, definition);
  }

  get<T extends RecipeNode>(type: T["type"]): NodeDefinition<T> | undefined {
    return this.definitions.get(type);
  }

  getAll(): NodeDefinition<any>[] {
    return Array.from(this.definitions.values());
  }

  // FACTORY METHOD: Creación desacoplada en tiempo de ejecución
  createNode<T extends RecipeNode = RecipeNode>(type: RecipeNode["type"], id: string): T {
    const def = this.get(type);
    if (!def) {
      throw new Error(`Tipo de nodo no registrado en NodeFactory: ${type}`);
    }
    return def.createDefault(id) as T;
  }

  getHighlight(node: RecipeNode): string | undefined {
    const def = this.get(node.type);
    return def?.getHighlight ? def.getHighlight(node) : undefined;
  }
}

export const nodeRegistry = new NodeRegistry();
