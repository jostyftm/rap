import { Download } from "lucide-react";
import type { ExtractNode } from "@rpa/dsl";
import type { NodeDefinition } from "../types";
import { ExtractInspectorForm } from "../inspectors/extract-inspector";

export const extractDefinition: NodeDefinition<ExtractNode> = {
  type: "extract",
  label: "Extraer Datos",
  category: "data",
  description: "Obtener texto, atributo o lista a variable",
  icon: Download,
  color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  hasTarget: true,
  createDefault: (id: string): ExtractNode => ({
    id,
    type: "extract",
    description: "Extraer texto a variable",
    locator: {
      primary: { strategy: "testid", value: "data-text", score: 95 },
      fallbacks: [],
    },
    params: { extractType: "text", variable: "extractedData" },
  }),
  getHighlight: (node: ExtractNode) => (node.params?.variable ? `-> ${node.params.variable}` : undefined),
  InspectorForm: ExtractInspectorForm,
};
