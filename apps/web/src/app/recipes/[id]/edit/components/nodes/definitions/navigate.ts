import { Globe } from "lucide-react";
import type { NavigateNode } from "@rpa/dsl";
import type { NodeDefinition } from "../types";
import {
  NavigateInspectorForm,
  NavigateAdvancedForm,
} from "../inspectors/navigate-inspector";

export const navigateDefinition: NodeDefinition<NavigateNode> = {
  type: "navigate",
  label: "Navegar (goto)",
  category: "interaction",
  description: "Cargar una dirección URL en el navegador",
  icon: Globe,
  color: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  hasTarget: false,
  createDefault: (id: string): NavigateNode => ({
    id,
    type: "navigate",
    description: "Navegar a URL",
    params: {
      url: "https://example.com",
      waitUntil: "domcontentloaded",
    },
  }),
  getHighlight: (node: NavigateNode) => node.params?.url,
  InspectorForm: NavigateInspectorForm,
  AdvancedOptionsForm: NavigateAdvancedForm,
};
