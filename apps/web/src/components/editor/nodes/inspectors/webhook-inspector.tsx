"use client";

import React, { useState } from "react";
import type { WebhookNode, WebhookHttpMethod } from "@rpa/dsl";
import type { NodeInspectorProps } from "../types";
import { Copy, Check, Globe, Code2 } from "lucide-react";

const HTTP_METHODS: WebhookHttpMethod[] = [
  "ANY",
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
];

export function WebhookInspectorForm({
  node,
  updateParam,
}: NodeInspectorProps<WebhookNode>) {
  const [copied, setCopied] = useState(false);

  const path = node.params.path || `/api/v1/webhooks/${node.id}`;
  const method = node.params.httpMethod || "POST";
  const outputVar = node.params.outputVariable || "webhook";

  const handleCopyUrl = () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    const fullUrl = `${origin}${path.startsWith("/") ? "" : "/"}${path}`;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-3.5">
      {/* Método HTTP */}
      <div>
        <label className="block text-[11px] font-medium text-zinc-400 mb-1">
          Método HTTP soportado
        </label>
        <div className="grid grid-cols-3 gap-1.5">
          {HTTP_METHODS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => updateParam("httpMethod", m)}
              className={`py-1 px-2 rounded text-xs font-mono font-medium transition-colors ${
                method === m
                  ? "bg-zinc-100 text-zinc-950 font-semibold"
                  : "bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Ruta / Endpoint del Webhook */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px] font-medium text-zinc-400">
            Ruta del Endpoint
          </label>
          <button
            type="button"
            onClick={handleCopyUrl}
            className="flex items-center space-x-1 text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Copiar URL completa"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? "Copiado" : "Copiar URL"}</span>
          </button>
        </div>
        <div className="relative">
          <Globe className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-500" />
          <input
            type="text"
            value={path}
            onChange={(e) => updateParam("path", e.target.value)}
            placeholder="/api/v1/webhooks/mi-evento"
            className="w-full bg-zinc-950 border border-zinc-800 rounded pl-8 pr-3 py-1.5 text-xs text-zinc-200 font-mono placeholder-zinc-500 focus:outline-none focus:border-zinc-600 transition-colors"
          />
        </div>
        <p className="text-[10px] text-zinc-500 mt-1">
          Las peticiones HTTP entrantes a esta ruta iniciarán el flujo o alimentarán este paso.
        </p>
      </div>

      {/* Variable de destino */}
      <div>
        <label className="block text-[11px] font-medium text-zinc-400 mb-1">
          Guardar payload en variable
        </label>
        <input
          type="text"
          value={outputVar}
          onChange={(e) => updateParam("outputVariable", e.target.value)}
          placeholder="webhook"
          className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-zinc-600 transition-colors"
        />
        <p className="text-[10px] text-zinc-500 mt-1">
          Accede a los datos en pasos posteriores con:{" "}
          <code className="text-zinc-300 font-mono">{`{{${outputVar}.body}}`}</code>,{" "}
          <code className="text-zinc-300 font-mono">{`{{${outputVar}.query}}`}</code> o{" "}
          <code className="text-zinc-300 font-mono">{`{{${outputVar}.headers}}`}</code>
        </p>
      </div>

      {/* Código de respuesta HTTP */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] font-medium text-zinc-400 mb-1">
            Código HTTP Respuesta
          </label>
          <input
            type="number"
            value={node.params.responseCode ?? 200}
            onChange={(e) => updateParam("responseCode", Number(e.target.value))}
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-zinc-600 transition-colors"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-zinc-400 mb-1">
            Contenido de respuesta
          </label>
          <input
            type="text"
            value={node.params.responseBody || ""}
            onChange={(e) => updateParam("responseBody", e.target.value)}
            placeholder='{"status":"received"}'
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 font-mono placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
          />
        </div>
      </div>

      {/* Estructura del payload */}
      <div className="p-2.5 rounded bg-zinc-950/70 border border-zinc-800/80 space-y-1">
        <div className="flex items-center space-x-1.5 text-zinc-400 text-[10px] font-mono">
          <Code2 className="w-3 h-3 text-zinc-500" />
          <span>Estructura del Payload</span>
        </div>
        <pre className="text-[10px] font-mono text-zinc-400 bg-zinc-900/60 p-2 rounded overflow-x-auto">
{`{
  "method": "${method}",
  "query": { "id": "123" },
  "body": { "email": "user@example.com" },
  "headers": { "content-type": "application/json" }
}`}
        </pre>
      </div>
    </div>
  );
}
