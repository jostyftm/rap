import { CornerDownLeft } from "lucide-react";
import type { RespondNode } from "@rpa/dsl";
import type { NodeDefinition } from "../types";
import { RespondInspectorForm } from "../inspectors/respond-inspector";

export const respondDefinition: NodeDefinition<RespondNode> = {
  type: "respond",
  label: "Responder / Retornar",
  category: "triggers",
  description: "Devuelve el resultado final de la automatización (JSON, HTML, texto, XML, binario o redirect)",
  keywords: [
    "respond",
    "response",
    "return",
    "retorno",
    "respuesta",
    "webhook",
    "json",
    "html",
    "xml",
    "binary",
    "redirect",
  ],
  icon: CornerDownLeft,
  color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  hasTarget: false,
  createDefault: (id: string): RespondNode => ({
    id,
    type: "respond",
    description: "Responder al cliente HTTP",
    params: {
      responseType: "json",
      statusCode: 200,
      body: '{\n  "ok": true\n}',
      headers: [],
      terminateFlow: true,
    },
  }),
  getHighlight: (node: RespondNode) => {
    const type = (node.params.responseType || "json").toUpperCase();
    const code =
      node.params.statusCode ??
      (node.params.responseType === "empty"
        ? 204
        : node.params.responseType === "redirect"
          ? 302
          : 200);
    return `${code} · ${type}`;
  },
  InspectorForm: RespondInspectorForm,
};
