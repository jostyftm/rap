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
import {
  useWebhookTestStore,
  type WebhookReceivedPayload,
} from "@/stores/use-webhook-test-store";
import { Badge, Button, IconButton } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

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
  const payload =
    testEntry.payload || (existingOutput as WebhookReceivedPayload | undefined);

  const path = node.params.path || `/api/v1/webhooks/${node.id}`;
  const method = node.params.httpMethod || "POST";
  const fullUrl = buildWebhookUrl(path);

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

  // 1. Estado éxito
  if (testEntry.status === "success" || (testEntry.status === "idle" && payload)) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-panel text-fg transition-colors">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line bg-card px-3 py-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <Badge tone="success">
              <CheckCircle2 className="h-3 w-3" />
              Evento recibido
            </Badge>
            {payload?.method && (
              <Badge tone="neutral" className="font-mono">
                {payload.method}
              </Badge>
            )}
          </div>

          <Button
            size="sm"
            variant="secondary"
            onClick={handleRestart}
            disabled={!recipeId}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Escuchar de nuevo
          </Button>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden">
          <DataViewer
            data={payload}
            baseTokenPrefix={`{{steps.${node.id}.output`}
            emptyMessage="No se recibió información en el payload."
          />
        </div>
      </div>
    );
  }

  // 2. Estado escuchando
  if (testEntry.status === "listening") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 overflow-y-auto bg-panel p-6 text-center text-fg transition-colors">
        <div className="relative flex items-center justify-center">
          <div className="absolute h-16 w-16 animate-ping rounded-full bg-accent/15" />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-accent-line bg-accent-soft">
            <Radio className="h-7 w-7 animate-pulse text-accent-text" />
          </div>
        </div>

        <div className="max-w-sm space-y-2">
          <h3 className="text-[13px] font-semibold text-fg">
            Escuchando peticiones en tiempo real…
          </h3>
          <p className="text-[11.5px] leading-relaxed text-fg-muted">
            Envía una petición HTTP a la ruta generada. Los datos se capturarán al instante.
          </p>
          {timeLeft !== null && (
            <Badge tone="warning" className="font-mono">
              <Clock className="h-3 w-3" />
              Expira en {timeLeft} s
            </Badge>
          )}
        </div>

        <div className="flex w-full max-w-md items-center justify-between gap-2 rounded-card border border-line bg-card p-2.5 text-left">
          <div className="min-w-0 flex-1">
            <span className="block text-[10px] uppercase tracking-wider text-fg-subtle">
              URL del webhook
            </span>
            <span className="block truncate font-mono text-[11.5px] text-accent-text">
              {fullUrl}
            </span>
          </div>
          <IconButton label="Copiar URL" onClick={handleCopyUrl}>
            {copiedUrl ? (
              <Check className="h-3.5 w-3.5 text-success-text" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </IconButton>
        </div>

        <div className="w-full max-w-md space-y-2 rounded-card border border-line bg-card p-3 text-left">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted">
              <Terminal className="h-3 w-3" />
              Prueba rápida (curl)
            </span>
            <button
              type="button"
              onClick={handleCopyCurl}
              className="inline-flex items-center gap-1 font-mono text-[10px] text-fg-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              {copiedCurl ? (
                <Check className="h-3 w-3 text-success-text" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              <span>{copiedCurl ? "Copiado" : "Copiar"}</span>
            </button>
          </div>
          <pre className="overflow-x-auto whitespace-pre rounded-control border border-line bg-panel p-2 font-mono text-[10px] text-fg-muted">
            {curlExample}
          </pre>
        </div>
      </div>
    );
  }

  // 3. Estado error
  if (testEntry.status === "error") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-panel p-6 text-center text-fg transition-colors">
        <div className="grid h-12 w-12 place-items-center rounded-full border border-danger/25 bg-danger-soft">
          <AlertCircle className="h-6 w-6 text-danger-text" />
        </div>
        <div className="max-w-sm space-y-1.5">
          <h3 className="text-[12.5px] font-semibold text-fg">
            Fallo en la recepción del webhook
          </h3>
          <p className="text-[11.5px] leading-relaxed text-fg-muted">
            {testEntry.error ||
              "No se pudo recibir la petición a tiempo o hubo un error en la conexión."}
          </p>
        </div>
        <Button variant="primary" onClick={handleRestart} disabled={!recipeId}>
          <RefreshCw className="h-3.5 w-3.5" />
          Intentar de nuevo
        </Button>
      </div>
    );
  }

  // 4. Estado inactivo
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-panel p-6 text-center text-fg transition-colors">
      <div className="grid h-12 w-12 place-items-center rounded-full border border-line bg-card text-fg-subtle">
        <Inbox className="h-6 w-6" />
      </div>
      <div className="max-w-xs space-y-1.5">
        <h3 className="text-[12.5px] font-semibold text-fg">Esperando datos…</h3>
        <p className="text-[11.5px] leading-relaxed text-fg-muted">
          Inicia la escucha para capturar una petición HTTP real y ver su{" "}
          <span className={cn("font-medium text-accent-text")}>payload</span> estructurado.
        </p>
      </div>

      <Button variant="primary" onClick={handleRestart} disabled={!recipeId}>
        <Radio className="h-3.5 w-3.5" />
        Iniciar escucha ahora
      </Button>
    </div>
  );
}
