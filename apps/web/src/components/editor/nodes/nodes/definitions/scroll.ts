import { MoveVertical } from "lucide-react";
import type { ScrollNode } from "@rpa/dsl";
import type { NodeDefinition } from "../types";
import { ScrollInspectorForm } from "../inspectors/scroll-inspector";

export const scrollDefinition: NodeDefinition<ScrollNode> = {
  type: "scroll",
  label: "Scroll (Desplazar)",
  category: "interaction",
  description: "Desplazar vista hacia un elemento o por coordenadas (X/Y)",
  keywords: ["scroll", "desplazar", "desplazamiento", "bajar", "subir", "vista", "pantalla", "view"],
  icon: MoveVertical,
  color: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  hasTarget: true,
  createDefault: (id: string): ScrollNode => ({
    id,
    type: "scroll",
    description: "Desplazar vista para ubicar elemento",
    locator: {
      primary: { strategy: "css", value: "", score: 60 },
      fallbacks: [],
    },
    params: {
      mode: "element",
      behavior: "smooth",
    },
  }),
  getHighlight: (node: ScrollNode) => {
    const mode = node.params?.mode || "element";
    if (mode === "element") {
      return `Hacia: ${node.locator?.primary?.value || "elemento"}`;
    }
    if (mode === "coordinates") {
      const y = node.params?.y ?? 500;
      return `Scroll Y: ${y > 0 ? `+${y}` : y}px`;
    }
    if (mode === "bottom") return "Al final de página";
    if (mode === "top") return "Al inicio de página";
    return undefined;
  },
  InspectorForm: ScrollInspectorForm,
};
