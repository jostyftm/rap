import { ListFilter } from "lucide-react";
import type { SelectNode } from "@rpa/dsl";
import type { NodeDefinition } from "../types";
import { SelectInspectorForm } from "../inspectors/select-inspector";

export const selectDefinition: NodeDefinition<SelectNode> = {
  type: "select",
  label: "Seleccionar (select)",
  category: "interaction",
  description: "Elegir una opción en un menú desplegable",
  icon: ListFilter,
  color: "bg-teal-500/10 text-teal-600 border-teal-500/20",
  hasTarget: true,
  createDefault: (id: string): SelectNode => ({
    id,
    type: "select",
    description: "Seleccionar opción",
    locator: {
      primary: { strategy: "testid", value: "select-dropdown", score: 95 },
      fallbacks: [],
    },
    params: { value: "option_value" },
  }),
  getHighlight: (node: SelectNode) => (node.params?.value ? `Opción: ${node.params.value}` : undefined),
  InspectorForm: SelectInspectorForm,
};
