import { Keyboard } from "lucide-react";
import type { TypeNode } from "@rpa/dsl";
import type { NodeDefinition } from "../types";
import {
  TypeInspectorForm,
  TypeAdvancedForm,
} from "../inspectors/type-inspector";

export const typeDefinition: NodeDefinition<TypeNode> = {
  type: "type",
  label: "Escribir (type)",
  category: "interaction",
  description: "Rellenar un campo de texto o formulario",
  icon: Keyboard,
  color: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
  hasTarget: true,
  createDefault: (id: string): TypeNode => ({
    id,
    type: "type",
    description: "Escribir texto en campo",
    locator: {
      primary: { strategy: "testid", value: "input-field", score: 95 },
      fallbacks: [],
    },
    params: { text: "Texto de ejemplo", clear: true, pressEnter: false },
  }),
  getHighlight: (node: TypeNode) =>
    node.params?.text
      ? `"${node.params.text}"${node.params.pressEnter ? " + ↵" : ""}`
      : undefined,
  InspectorForm: TypeInspectorForm,
  AdvancedOptionsForm: TypeAdvancedForm,
};
