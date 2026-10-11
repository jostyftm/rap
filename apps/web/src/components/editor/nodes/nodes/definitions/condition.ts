import { GitBranch } from "lucide-react";
import type { ConditionNode } from "@rpa/dsl";
import type { NodeDefinition } from "../types";
import { ConditionInspectorForm } from "../inspectors/condition-inspector";

export const conditionDefinition: NodeDefinition<ConditionNode> = {
  type: "condition",
  label: "Condición (if / else)",
  category: "control",
  description: "Bifurcación lógica basada en expresión",
  icon: GitBranch,
  color: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  hasTarget: false,
  createDefault: (id: string): ConditionNode => ({
    id,
    type: "condition",
    description: "Bifurcación condicional",
    params: {
      expression: "variables.flag === true",
      thenNodeId: "",
    },
  }),
  getHighlight: (node: ConditionNode) => node.params?.expression,
  InspectorForm: ConditionInspectorForm,
};
