import { Code2 } from "lucide-react";
import type { JavascriptNode } from "@rpa/dsl";
import type { NodeDefinition } from "../types";
import { JavascriptInspectorForm } from "../inspectors/javascript-inspector";

export const DEFAULT_JS_CODE =
  "// Accede a variables, steps.<id>.output e input\n" +
  "// Presiona Ctrl+Space para autocompletar\n" +
  "return {\n  ok: true,\n};";

export const javascriptDefinition: NodeDefinition<JavascriptNode> = {
  type: "javascript",
  label: "Código JavaScript",
  category: "data",
  description: "Ejecutar lógica o scripts JavaScript personalizados con editor y autocompletado",
  keywords: ["javascript", "js", "codigo", "script", "eval", "funcion", "transformar", "dom"],
  icon: Code2,
  color: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  hasTarget: false,
  createDefault: (id: string): JavascriptNode => ({
    id,
    type: "javascript",
    description: "Ejecutar JavaScript",
    params: {
      code: DEFAULT_JS_CODE,
      mode: "sandbox",
      outputVariable: "",
    },
  }),
  getHighlight: (node: JavascriptNode) => {
    const modeTag = node.params?.mode === "browser" ? "[DOM]" : "[JS]";
    if (node.params?.outputVariable?.trim()) {
      return `${modeTag} → ${node.params.outputVariable.trim()}`;
    }
    const firstCodeLine = (node.params?.code || "")
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith("//"));
    return firstCodeLine ? `${modeTag} ${firstCodeLine}` : modeTag;
  },
  InspectorForm: JavascriptInspectorForm,
};
