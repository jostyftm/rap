"use client";

import React, { useState, useEffect } from "react";
import {
  Globe,
  Database,
  Crosshair,
  Copy,
  Check,
  Clock,
  Sparkles,
  Play,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { useRecipeStore } from "@/stores/use-recipe-store";
import { useLiveStore } from "@/stores/use-live-store";
import { DataViewer } from "./data-viewer";
import { LiveSitePanel } from "../live-site-panel";
import type { RecipeNode } from "@rpa/dsl";

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
  const nodeExecStatuses = useRecipeStore((s) => s.nodeExecStatuses);

  const live = useLiveStore();
  const outputData = nodeOutputs[node.id];
  const duration = nodeExecDurations[node.id];
  const execStatus = nodeExecStatuses[node.id];

  const [activeTab, setActiveTab] = useState<"live" | "output">(() => {
    return isBrowserAction && outputData === undefined ? "live" : "output";
  });
  const [copied, setCopied] = useState(false);

  // Al ejecutar una acción de navegador, mostrar la pestaña del navegador en vivo para feedback en tiempo real
  useEffect(() => {
    if (isExecuting && isBrowserAction) {
      setActiveTab("live");
    }
  }, [isExecuting, isBrowserAction]);

  // Si el nodo usa selectores, solicitar resaltado en el navegador en vivo
  useEffect(() => {
    if (activeTab === "live" && "locator" in node && (node as any).locator) {
      if (live.isOpen && live.status === "ready") {
        live.locate(node);
      }
    }
  }, [node, activeTab, live]);

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
    <div className={`flex flex-col h-full bg-[#0c0c0e] border-l border-zinc-800 ${className}`}>
      {/* Header con Pestañas: Navegador en vivo | Salida */}
      <div className="flex items-center justify-between p-2.5 border-b border-zinc-800 bg-zinc-950/60 shrink-0">
        <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded p-0.5 text-xs font-mono">
          <button
            type="button"
            onClick={() => setActiveTab("output")}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded transition-colors ${
              activeTab === "output"
                ? "bg-zinc-800 text-white font-medium shadow-xs"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Salida</span>
            {outputData !== undefined && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("live")}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded transition-colors ${
              activeTab === "live"
                ? "bg-zinc-800 text-white font-medium shadow-xs"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Navegador en vivo</span>
            {live.status === "ready" && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </button>
        </div>

        {/* Acciones contextuales */}
        <div className="flex items-center space-x-1">
          {activeTab === "output" && outputData !== undefined && (
            <>
              {duration !== undefined && (
                <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-400">
                  <Clock className="w-3 h-3 text-zinc-500" />
                  <span>{duration}ms</span>
                </div>
              )}
              <button
                type="button"
                onClick={handleCopy}
                title="Copiar salida JSON"
                className="p-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white transition-colors"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </button>
            </>
          )}

          {activeTab === "live" && ["click", "type", "select", "waitFor", "extract"].includes(node.type) && (
            <button
              type="button"
              onClick={handleArmInspector}
              className={`flex items-center space-x-1 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                live.armedNodeId === node.id
                  ? "bg-amber-400 text-zinc-950 font-semibold"
                  : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700"
              }`}
            >
              <Crosshair className="w-3 h-3" />
              <span>{live.armedNodeId === node.id ? "Inspeccionando..." : "Inspeccionar"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Contenido según pestaña */}
      <div className="flex-1 overflow-hidden flex flex-col relative">
        {/* Pestaña: Salida estructurada */}
        <div className={`flex-1 h-full overflow-hidden flex flex-col ${activeTab === "output" ? "" : "hidden"}`}>
          {outputData !== undefined ? (
            <DataViewer
              data={outputData}
              baseTokenPrefix={`{{steps.${node.id}.output`}
            />
          ) : (
            /* Estado vacío de salida */
            <div className="p-6 flex flex-col items-center justify-center text-center space-y-4 m-auto max-w-[280px]">
              <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500">
                <Database className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-mono font-medium text-zinc-200">
                  Sin resultados de salida aún
                </h4>
                <p className="text-[11px] text-zinc-400 leading-relaxed font-sans">
                  Ejecuta este nodo con el botón principal o presionando{" "}
                  <kbd className="px-1 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-300">
                    Ctrl + Enter
                  </kbd>{" "}
                  para ver sus datos estructurados.
                </p>
              </div>

              <button
                type="button"
                onClick={onExecuteNode}
                disabled={isExecuting}
                className="w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-md bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-medium transition-colors shadow-sm disabled:opacity-50"
              >
                {isExecuting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Ejecutando...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Ejecutar nodo ahora</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Pestaña: Navegador en vivo integrado (se mantiene siempre montado para preservar la sesión e iframe) */}
        <div className={`flex-1 h-full overflow-hidden flex ${activeTab === "live" ? "" : "hidden"}`}>
          <LiveSitePanel />
        </div>
      </div>
    </div>
  );
}
