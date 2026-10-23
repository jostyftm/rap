"use client";

import React, { useState, useEffect } from "react";
import type { WebhookNode, WebhookHttpMethod } from "@rpa/dsl";
import type { NodeInspectorProps } from "../types";
import {
  Copy,
  Check,
  Globe,
  Radio,
  Square,
  ChevronRight,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { buildWebhookUrl } from "@/lib/webhook-url";
import { useRecipeStore } from "@/stores/use-recipe-store";
import { useWebhookTestStore } from "@/stores/use-webhook-test-store";

const HTTP_METHODS: WebhookHttpMethod[] = [
  "POST",
  "GET",
  "PUT",
  "DELETE",
  "PATCH",
  "ANY",
];

export function WebhookInspectorForm({
  node,
  updateParam,
}: NodeInspectorProps<WebhookNode>) {
  const [copied, setCopied] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const recipeId = useRecipeStore((s) => s.recipeId);
  const webhookStore = useWebhookTestStore();
  const testEntry = webhookStore.getEntry(node.id);

  const path = node.params.path || `/api/v1/webhooks/${node.id}`;
  const method = node.params.httpMethod || "POST";
  const outputVar = node.params.outputVariable || "webhook";
  const responseCode = node.params.responseCode ?? 200;
  const responseBody = node.params.responseBody || '{"ok":true}';

  const fullUrl = buildWebhookUrl(path);

  // Contador regresivo mientras se escucha
  useEffect(() => {
    if (testEntry.status !== "listening" || !testEntry.expiresAt) {
      return;
    }

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor(testEntry.expiresAt! - Date.now() / 1000));
      setTimeLeft(remaining);
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [testEntry.status, testEntry.expiresAt]);

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggleListening = () => {
    if (!recipeId) return;

    if (testEntry.status === "listening") {
      webhookStore.stopListening(recipeId, node.id);
    } else {
      webhookStore.startListening(recipeId, node);
    }
  };

  const handleResponseBodyChange = (val: string) => {
    updateParam("responseBody", val);
    if (!val.trim()) {
      setJsonError(null);
      return;
    }
    try {
      JSON.parse(val);
      setJsonError(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "JSON no válido";
      setJsonError(msg);
    }
  };

  const isListening = testEntry.status === "listening";

  return (
    <div className="space-y-4">
      {/* 1. Selector de Método HTTP */}
      <div>
        <label className="block text-[11px] font-medium text-zinc-300 mb-1">
          Método HTTP
        </label>
        <select
          value={method}
          disabled={isListening}
          onChange={(e) => updateParam("httpMethod", e.target.value as WebhookHttpMethod)}
          className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-zinc-600 disabled:opacity-50 transition-colors"
        >
          {HTTP_METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      {/* 2. Ruta y URL del Webhook */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px] font-medium text-zinc-300">
            Ruta del Webhook
          </label>
          <button
            type="button"
            onClick={handleCopyUrl}
            className="flex items-center space-x-1 text-[11px] text-amber-400 hover:text-amber-300 font-medium transition-colors"
            title="Copiar URL completa del endpoint"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? "Copiada" : "Copiar URL"}</span>
          </button>
        </div>
        <div className="relative">
          <Globe className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-500" />
          <input
            type="text"
            value={path}
            disabled={isListening}
            onChange={(e) => updateParam("path", e.target.value)}
            placeholder={`/api/v1/webhooks/${node.id}`}
            className="w-full bg-zinc-950 border border-zinc-800 rounded pl-8 pr-3 py-1.5 text-xs text-zinc-200 font-mono placeholder-zinc-600 focus:outline-none focus:border-zinc-600 disabled:opacity-50 transition-colors"
          />
        </div>
        <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-500 font-mono truncate">
          <span className="truncate" title={fullUrl}>
            URL: {fullUrl}
          </span>
        </div>
      </div>

      {/* 3. Botón de Escucha Interactivo */}
      <div className="pt-1">
        <button
          type="button"
          onClick={handleToggleListening}
          disabled={!recipeId}
          title={!recipeId ? "Guarda la receta primero para probar este webhook" : undefined}
          className={`w-full py-2.5 px-3 rounded-lg font-medium text-xs flex items-center justify-center space-x-2 transition-all shadow-md active:scale-[0.98] ${
            isListening
              ? "bg-rose-600 hover:bg-rose-500 text-white animate-pulse"
              : "bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold"
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          {isListening ? (
            <>
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Detener escucha</span>
              {timeLeft !== null && (
                <span className="ml-1 text-[11px] opacity-80 font-mono">
                  ({timeLeft}s)
                </span>
              )}
            </>
          ) : (
            <>
              <Radio className="w-4 h-4 text-zinc-950" />
              <span>Escuchar evento de prueba</span>
            </>
          )}
        </button>

        {!recipeId && (
          <p className="text-[10px] text-amber-500/80 mt-1.5 text-center">
            Debes guardar la receta para poder iniciar la escucha de prueba.
          </p>
        )}

        {isListening && (
          <div className="mt-2 p-2 rounded bg-amber-950/30 border border-amber-800/40 text-[11px] text-amber-300/90 flex items-start space-x-1.5">
            <Radio className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5 animate-spin" />
            <span>
              Esperando una petición HTTP {method} en la URL. Puedes probar enviando datos desde Postman, curl o tu backend.
            </span>
          </div>
        )}

        {testEntry.status === "error" && testEntry.error && (
          <div className="mt-2 p-2 rounded bg-rose-950/40 border border-rose-800/50 text-[11px] text-rose-300 flex items-start space-x-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
            <span>{testEntry.error}</span>
          </div>
        )}
      </div>

      {/* 4. Acordeón: Opciones Avanzadas */}
      <div className="border border-zinc-800/90 rounded-lg overflow-hidden bg-zinc-950/40">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center justify-between p-2.5 text-xs text-zinc-300 hover:text-white hover:bg-zinc-900/60 transition-colors font-medium"
        >
          <span className="flex items-center space-x-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Opciones Avanzadas</span>
          </span>
          <ChevronRight
            className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${
              showAdvanced ? "rotate-90" : ""
            }`}
          />
        </button>

        {showAdvanced && (
          <div className="p-3 border-t border-zinc-800/80 space-y-3 bg-zinc-950/80 animate-in fade-in duration-150">
            {/* Código de Respuesta HTTP */}
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                Código Respuesta HTTP
              </label>
              <input
                type="number"
                value={responseCode}
                onChange={(e) => updateParam("responseCode", Number(e.target.value))}
                min={100}
                max={599}
                className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-zinc-600 transition-colors"
              />
            </div>

            {/* Contenido de Respuesta */}
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                Contenido de respuesta (JSON)
              </label>
              <textarea
                rows={3}
                value={responseBody}
                onChange={(e) => handleResponseBodyChange(e.target.value)}
                placeholder='{"ok": true}'
                className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 font-mono placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors resize-none"
              />
              {jsonError && (
                <p className="text-[10px] text-rose-400 mt-1 font-mono">{jsonError}</p>
              )}
            </div>

            {/* Guardar payload en variable */}
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                Guardar payload en variable
              </label>
              <input
                type="text"
                value={outputVar}
                onChange={(e) => updateParam("outputVariable", e.target.value)}
                placeholder="webhook"
                className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-zinc-600 transition-colors"
              />
              <p className="text-[10px] text-zinc-500 mt-1 font-sans">
                Disponible en los pasos siguientes como{" "}
                <code className="text-amber-300 font-mono">{`{{${outputVar}.body}}`}</code> o{" "}
                <code className="text-amber-300 font-mono">{`{{steps.${node.id}.output.body}}`}</code>.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
