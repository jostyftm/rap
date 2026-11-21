import { Send } from "lucide-react";
import type { HttpRequestNode } from "@rpa/dsl";
import type { NodeDefinition } from "../types";
import { HttpRequestInspectorForm } from "../inspectors/http-request-inspector";

export const httpRequestDefinition: NodeDefinition<HttpRequestNode> = {
  type: "httpRequest",
  label: "Petición HTTP",
  category: "data",
  description: "Envía peticiones REST/HTTP con verbos, headers, auth, parámetros y cuerpo",
  keywords: [
    "http",
    "request",
    "fetch",
    "api",
    "rest",
    "get",
    "post",
    "put",
    "patch",
    "delete",
    "headers",
    "webhook",
    "json",
  ],
  icon: Send,
  color: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  hasTarget: false,
  createDefault: (id: string): HttpRequestNode => ({
    id,
    type: "httpRequest",
    description: "Llamada HTTP / API",
    params: {
      method: "GET",
      url: "https://",
      pathParams: [],
      queryParams: [],
      headers: [],
      auth: { type: "none" },
      bodyType: "none",
      responseType: "auto",
      timeoutMs: 30000,
      followRedirects: true,
      failOnHttpError: true,
      outputVariable: "",
    },
  }),
  getHighlight: (node: HttpRequestNode) => {
    const method = node.params.method || "GET";
    const url = node.params.url || "";
    return url && url !== "https://" ? `${method} ${url}` : method;
  },
  InspectorForm: HttpRequestInspectorForm,
};
