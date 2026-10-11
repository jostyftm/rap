import { Clock } from "lucide-react";
import type { WaitForNode } from "@rpa/dsl";
import type { NodeDefinition } from "../types";
import { WaitForInspectorForm } from "../inspectors/wait-for-inspector";

export const waitForDefinition: NodeDefinition<WaitForNode> = {
  type: "waitFor",
  label: "Esperar (waitFor)",
  category: "waits",
  description: "Esperar elemento, red o URL con auto-wait",
  icon: Clock,
  color: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  hasTarget: true,
  createDefault: (id: string): WaitForNode => ({
    id,
    type: "waitFor",
    description: "Esperar a que aparezca elemento",
    params: { strategy: "selector" },
    locator: {
      primary: { strategy: "css", value: "", score: 60 },
      fallbacks: [],
    },
  }),
  getHighlight: (node: WaitForNode) => {
    if (node.params?.strategy === "selector") {
      return `Esperar: ${node.locator?.primary?.value || "selector"}`;
    } else if (node.params?.strategy === "timeout") {
      return `Pausa: ${node.params?.value || 1000}ms`;
    } else if (node.params?.strategy === "networkIdle") {
      return "Red inactiva";
    } else if (node.params?.strategy === "url") {
      return `URL: ${node.params?.value || ""}`;
    }
    return undefined;
  },
  InspectorForm: WaitForInspectorForm,
};
