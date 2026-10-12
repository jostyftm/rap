import type { RecipeNode } from "@rpa/dsl";

export interface NodeInspectorProps<T extends RecipeNode = RecipeNode> {
  node: T;
  updateParam: (key: string, value: any) => void;
  updateNode: (updates: Partial<T>) => void;
}

export interface NodeDefinition<T extends RecipeNode = RecipeNode> {
  type: T["type"];
  label: string;
  category: "triggers" | "interaction" | "waits" | "data" | "control";
  description: string;
  keywords?: string[];
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  hasTarget?: boolean;
  createDefault: (id: string) => T;
  getHighlight?: (node: T) => string | undefined;
  InspectorForm: React.ComponentType<NodeInspectorProps<T>>;
  AdvancedOptionsForm?: React.ComponentType<NodeInspectorProps<T>>;
}
