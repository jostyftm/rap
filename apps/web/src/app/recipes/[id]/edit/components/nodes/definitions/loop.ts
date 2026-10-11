import { Repeat } from "lucide-react";
import type { LoopNode } from "@rpa/dsl";
import type { NodeDefinition } from "../types";
import { LoopInspectorForm } from "../inspectors/loop-inspector";

export const loopDefinition: NodeDefinition<LoopNode> = {
  type: "loop",
  label: "Bucle (loop)",
  category: "control",
  description: "Iterar sobre una colección de elementos",
  icon: Repeat,
  color: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  hasTarget: false,
  createDefault: (id: string): LoopNode => ({
    id,
    type: "loop",
    description: "Bucle sobre colección",
    params: {
      collectionExpression: "variables.items",
      itemVariable: "item",
      bodyEntryNodeId: "",
      maxIterations: 10,
    },
  }),
  getHighlight: (node: LoopNode) =>
    node.params?.collectionExpression ? `in ${node.params.collectionExpression}` : undefined,
  InspectorForm: LoopInspectorForm,
};
