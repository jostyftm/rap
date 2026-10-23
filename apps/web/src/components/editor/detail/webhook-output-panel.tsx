"use client";

import React, { useState, useEffect } from "react";
import type { WebhookNode } from "@rpa/dsl";
import {
  Inbox,
  Radio,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Terminal,
  RefreshCw,
  Clock,
} from "lucide-react";
import { buildWebhookUrl } from "@/lib/webhook-url";
import { DataViewer } from "./data-viewer";
import { useRecipeStore } from "@/stores/use-recipe-store";
import { useWebhookTestStore, type WebhookReceivedPayload } from "@/stores/use-webhook-test-store";

interface WebhookOutputPanelProps {
  node: WebhookNode;
}

export function WebhookOutputPanel({ node }: WebhookOutputPanelProps) {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const recipeId = useRecipeStore((s) => s.recipeId);
  const nodeOutputs = useRecipeStore((s) => s.nodeOutputs);
  const webhookStore = useWebhookTestStore();
  const testEntry = webhookStore.getEntry(node.id);

  const existingOutput = nodeOutputs[node.id];
  const payload = testEntry.payload || (existingOutput as WebhookReceivedPayload | undefined);

  const path = node.params.path || `/api/v1/webhooks/${node.id}`;
  const method = node.params.httpMethod || "POST";
  const fullUrl = buildWebhookUrl(path);

  // Contador de tiempo restante de escucha
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

  const curlExample = `curl -X ${method === "ANY" ? "POST" : method} '${fullUrl}' \\
  -H 'Content-Type: application/json' \\
  -d '{"ejemplo": "prueba", "nodeId": "${node.id}"}'`;

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(fullUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 1500);
  };

  const handleCopyCurl = () => {
    navigator.clipboard.writeText(curlExample);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 1500);
  };

  const handleRestart = () => {
    if (recipeId) {
      webhookStore.startListening(recipeId, node);
    }
  };

  // 1. Estado Éxito (Se recibió el evento o ya había payload)
  if (testEntry.status === "success" || (testEntry.status === "idle" && payload)) {
    return (
      <div className="flex flex-col h-full bg-[#0c0c0e] text-zinc-100 overflow-hidden">
        {/* Cabecera de éxito con método y timestamp */}
        <div className="p-3 border-b border-zinc-800 bg-zinc-950/70 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <span className="flex items-center space-x-1 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Evento Recibido</span>
            </span>
            {payload?.method && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                {payload.method}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleRestart}
            disabled={!recipeId}
            className="flex items-center space-x-1 text-[11px] px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white transition-colors"
          >
            <RefreshCw className="w-3 h-3 text-amber-400" />
            <span>Escuchar de nuevo</span>
          </button>
        </div>

        {/* Visor de datos recibido */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <DataViewer
            data={payload}
            baseTokenPrefix={`{{steps.${node.id}.output`}
            emptyMessage="No se recibió información en el payload."
          />
        </div>
      </div>
    );
  }

  // 2. Estado Escuchando en vivo (Pulsando)
  if (testEntry.status === "listening") {
    return (
      <div className="flex flex-col h-full bg-[#0c0c0e] text-zinc-100 p-6 items-center justify-center text-center space-y-5 overflow-y-auto">
        {/* Indicador pulsante */}
        <div className="relative flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-amber-400/15 animate-ping absolute" />
          <div className="w-16 h-16 rounded-full bg-amber-400/20 border border-amber-400/40 flex items-center justify-center relative">
            <Radio className="w-7 h-7 text-amber-400 animate-pulse" />
          </div>
        </div>

        <div className="space-y-1.5 max-w-sm">
          <h3 className="text-sm font-semibold text-zinc-100 flex items-center justify-center space-x-1.5">
            <span>Escuchando peticiones en tiempo real...</span>
          </h3>
          <p className="text-xs text-zinc-400 leading-relaxed font-sans">
            Envía una petición HTTP a la ruta generada. Los datos se capturarán al instante.
          </p>
          {timeLeft !== null && (
            <div className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[11px] font-mono text-zinc-400 mt-1">
              <Clock className="w-3 h-3 text-amber-400" />
              <span>Expira en {timeLeft} segundos</span>
            </div>
          )}
        </div>

        {/* URL con botón de copiar */}
        <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 flex items-center justify-between text-left">
          <div className="min-w-0 flex-1 mr-2">
            <span className="block text-[10px] font-mono text-zinc-500 uppercase">
              URL del webhook
            </span>
            <span className="block text-xs font-mono text-amber-300 truncate">
              {fullUrl}
            </span>
          </div>
          <button
            type="button"
            onClick={handleCopyUrl}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors shrink-0"
            title="Copiar URL"
          >
            {copiedUrl ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>

        {/* Comando curl preparado */}
        <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-left space-y-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center space-x-1.5 text-[10px] font-mono text-zinc-400">
              <Terminal className="w-3 h-3 text-zinc-500" />
              <span>Ejemplo de prueba rápida (curl)</span>
            </span>
            <button
              type="button"
              onClick={handleCopyCurl}
              className="text-[10px] font-mono text-zinc-400 hover:text-white flex items-center space-x-1"
            >
              {copiedCurl ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copiedCurl ? "Copiado" : "Copiar"}</span>
            </button>
          </div>
          <pre className="text-[10px] font-mono text-zinc-300 bg-zinc-900/80 p-2 rounded overflow-x-auto whitespace-pre">
            {curlExample}
          </pre>
        </div>
      </div>
    );
  }

  // 3. Estado Error (Timeout o Fallo)
  if (testEntry.status === "error") {
    return (
      <div className="flex flex-col h-full bg-[#0c0c0e] text-zinc-100 p-6 items-center justify-center text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center">
          <AlertCircle className="w-6 h-6 text-rose-400" />
        </div>
        <div className="space-y-1.5 max-w-sm">
          <h3 className="text-xs font-semibold text-zinc-200">
            Fallo en la recepción del webhook
          </h3>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            {testEntry.error || "No se pudo recibir la petición a tiempo o hubo un error en la conexión."}
          </p>
        </div>
        <button
          type="button"
          onClick={handleRestart}
          disabled={!recipeId}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-medium transition-colors shadow-sm"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Intentar de nuevo</span>
        </button>
      </div>
    );
  }

  // 4. Estado Idle (Inactivo por defecto)
  return (
    <div className="flex flex-col h-full bg-[#0c0c0e] text-zinc-100 p-6 items-center justify-center text-center space-y-4">
      <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500">
        <Inbox className="w-6 h-6" />
      </div>
      <div className="space-y-1.5 max-w-xs">
        <h3 className="text-xs font-semibold text-zinc-200">
          Esperando datos...
        </h3>
        <p className="text-[11px] text-zinc-400 leading-relaxed font-sans">
          Haz clic en <span className="text-amber-400 font-medium">&quot;Escuchar evento de prueba&quot;</span> en el panel de configuración para poner este nodo a la escucha y capturar una petición HTTP real.
        </p>
      </div>

      <button
        type="button"
        onClick={handleRestart}
        disabled={!recipeId}
        className="flex items-center space-x-2 px-3.5 py-2 rounded-md bg-amber-400 hover:bg-amber-300 text-zinc-950 text-xs font-semibold transition-colors shadow-sm disabled:opacity-40"
      >
        <Radio className="w-3.5 h-3.5" />
        <span>Iniciar escucha ahora</span>
      </button>
    </div>
  );
}
