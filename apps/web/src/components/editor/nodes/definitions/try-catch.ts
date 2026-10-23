import { ShieldAlert } from "lucide-react";
import type { TryCatchNode } from "@rpa/dsl";
import type { NodeDefinition } from "../types";
import { TryCatchInspectorForm } from "../inspectors/try-catch-inspector";

export const tryCatchDefinition: NodeDefinition<TryCatchNode> = {
  type: "tryCatch",
  label: "Try / Catch / Finally",
  category: "control",
  description: "Protege un bloque de pasos y maneja sus errores",
  keywords: ["try", "catch", "finally", "error", "excepción", "manejo"],
  icon: ShieldAlert,
  color: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  hasTarget: false,
  createDefault: (id: string): TryCatchNode => ({
    id,
    type: "tryCatch",
    description: "Bloque protegido",
    params: {
      tryEntryNodeId: "",
      catchEntryNodeId: "",
      finallyEntryNodeId: undefined,
      errorVariable: "error",
      rethrow: false,
    },
  }),
  getHighlight: (node: TryCatchNode) =>
    node.params.tryEntryNodeId ? `try → ${node.params.tryEntryNodeId}` : "sin bloques conectados",
  InspectorForm: TryCatchInspectorForm,
};
