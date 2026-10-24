"use client";

import React, { useState, useEffect } from "react";
import {
  Globe,
  Database,
  Crosshair,
  Copy,
  Check,
  Clock,
  Play,
  Loader2,
} from "lucide-react";
import { useRecipeStore } from "@/stores/use-recipe-store";
import { useLiveStore } from "@/stores/use-live-store";
import { DataViewer } from "./data-viewer";
import { LiveSitePanel } from "../live-site-panel";
import { WebhookOutputPanel } from "./webhook-output-panel";
import {
  Badge,
  Button,
  IconButton,
  SegmentedControl,
} from "@/components/ui/primitives";
import type { RecipeNode, WebhookNode } from "@rpa/dsl";

interface OutputLivePanelProps {
  node: RecipeNode;
  onExecuteNode: () => Promise<void>;
  isExecuting: boolean;
  className?: string;
}

export function OutputLivePanel({
  node,
  onExecuteNode,
  isExecuting,
  className = "",
}: OutputLivePanelProps) {
  const isBrowserAction = [
    "navigate",
    "click",
    "type",
    "select",
    "waitFor",
    "extract",
    "screenshot",
    "scroll",
  ].includes(node.type);

  const nodeOutputs = useRecipeStore((s) => s.nodeOutputs);
  const nodeExecDurations = useRecipeStore((s) => s.nodeExecDurations);

  const live = useLiveStore();
  const outputData = nodeOutputs[node.id];
  const duration = nodeExecDurations[node.id];

  const [activeTab, setActiveTab] = useState<"live" | "output">(() => {
    return isBrowserAction && outputData === undefined ? "live" : "output";
  });
  const [copied, setCopied] = useState(false);

  // Al ejecutar una acción de navegador, mostrar la pestaña del navegador en vivo
  useEffect(() => {
    if (isExecuting && isBrowserAction) {
      const timer = setTimeout(() => setActiveTab("live"), 0);
      return () => clearTimeout(timer);
    }
  }, [isExecuting, isBrowserAction]);

  // Si el nodo usa selectores, solicitar resaltado en el navegador en vivo
  useEffect(() => {
    if (activeTab === "live" && "locator" in node && (node as { locator?: unknown }).locator) {
      if (live.isOpen && live.status === "ready") {
        live.locate(node);
      }
    }
  }, [node, activeTab, live]);

  if (node.type === "webhook") {
    return (
      <div className={`flex h-full flex-col bg-panel ${className}`}>
        <WebhookOutputPanel node={node as WebhookNode} />
      </div>
    );
  }

  const handleCopy = () => {
    if (outputData !== undefined) {
      navigator.clipboard.writeText(JSON.stringify(outputData, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const handleArmInspector = () => {
    if (live.isOpen && live.status === "ready") {
      if (live.armedNodeId === node.id) live.disarm();
      else live.arm(node.id);
    } else {
      live.openAndArm(node.id);
    }
  };

  return (
    <div className={`flex h-full flex-col bg-panel transition-colors ${className}`}>
      {/* Header con pestañas */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line px-2.5 py-2">
        <SegmentedControl
          ariaLabel="Vista de la salida del nodo"
          value={activeTab}
          onChange={setActiveTab}
          options={[
            {
              value: "output",
              label: "Salida",
              icon: (
                <span className="relative flex">
                  <Database className="h-3.5 w-3.5" />
                  {outputData !== undefined && (
                    <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-success" />
                  )}
                </span>
              ),
            },
            {
              value: "live",
              label: "En vivo",
              icon: (
                <span className="relative flex">
                  <Globe className="h-3.5 w-3.5" />
                  {live.status === "ready" && (
                    <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
                  )}
                </span>
              ),
            },
          ]}
        />

        <div className="flex items-center gap-1">
          {activeTab === "output" && outputData !== undefined && (
            <>
              {duration !== undefined && (
                <Badge tone="neutral">
                  <Clock className="h-3 w-3" />
                  {duration} ms
                </Badge>
              )}
              <IconButton label="Copiar salida JSON" onClick={handleCopy}>
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-success-text" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </IconButton>
            </>
          )}

          {activeTab === "live" &&
            ["click", "type", "select", "waitFor", "extract"].includes(node.type) && (
              <Button
                size="sm"
                variant={live.armedNodeId === node.id ? "primary" : "secondary"}
                onClick={handleArmInspector}
              >
                <Crosshair className="h-3.5 w-3.5" />
                {live.armedNodeId === node.id ? "Inspeccionando…" : "Inspeccionar"}
              </Button>
            )}
        </div>
      </div>

      {/* Contenido */}
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <div
          className={`flex h-full flex-1 flex-col overflow-hidden ${
            activeTab === "output" ? "rpa-tab-panel" : "hidden"
          }`}
        >
          {outputData !== undefined ? (
            <DataViewer data={outputData} baseTokenPrefix={`{{steps.${node.id}.output`} />
          ) : (
            <div className="m-auto flex max-w-[280px] flex-col items-center justify-center gap-4 px-6 text-center">
              <div className="grid h-10 w-10 place-items-center rounded-full border border-line bg-card text-fg-subtle">
                <Database className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-[12px] font-medium text-fg">Sin resultados de salida aún</h4>
                <p className="text-[11.5px] leading-relaxed text-fg-muted">
                  Ejecuta este nodo con el botón principal o presionando{" "}
                  <kbd className="rounded border border-line bg-card px-1 py-0.5 font-mono text-[10px] text-fg-muted">
                    Ctrl + Enter
                  </kbd>{" "}
                  para ver sus datos estructurados.
                </p>
              </div>

              <Button variant="primary" onClick={onExecuteNode} disabled={isExecuting} className="w-full">
                {isExecuting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Ejecutando…</span>
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 fill-current" />
                    <span>Ejecutar nodo ahora</span>
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        {/* Navegador en vivo (siempre montado para preservar la sesión) */}
        <div
          aria-hidden={activeTab !== "live"}
          className={`flex h-full flex-1 overflow-hidden ${activeTab === "live" ? "" : "hidden"}`}
        >
          <LiveSitePanel showLayoutToggle={false} />
        </div>
      </div>
    </div>
  );
}
