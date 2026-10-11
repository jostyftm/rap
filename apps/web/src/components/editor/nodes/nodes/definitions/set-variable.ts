import { Variable } from "lucide-react";
import type { SetVariableNode } from "@rpa/dsl";
import type { NodeDefinition } from "../types";
import { SetVariableInspectorForm } from "../inspectors/set-variable-inspector";

export const setVariableDefinition: NodeDefinition<SetVariableNode> = {
  type: "setVariable",
  label: "Definir Variable",
  category: "data",
  description: "Almacenar o transformar un valor con expresión",
  icon: Variable,
  color: "bg-pink-500/10 text-pink-600 border-pink-500/20",
  hasTarget: false,
  createDefault: (id: string): SetVariableNode => ({
    id,
    type: "setVariable",
    description: "Definir variable",
    params: { name: "miVariable", expression: "'valor'" },
  }),
  getHighlight: (node: SetVariableNode) =>
    node.params?.name ? `${node.params.name} = ${node.params.expression || ""}` : undefined,
  InspectorForm: SetVariableInspectorForm,
};
