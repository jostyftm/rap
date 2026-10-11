"use client";

import React from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Globe,
  MousePointer,
  Keyboard,
  ListFilter,
  Clock,
  Camera,
  Download,
  Variable,
  GitBranch,
  Repeat,
  Play,
  ShieldCheck,
  AlertTriangle,
  Crosshair,
} from "lucide-react";
import type { RecipeNode } from "@rpa/dsl";
import { useRecipeStore } from "@/stores/use-recipe-store";
import { useLiveStore } from "@/stores/use-live-store";
import { useLayoutStore } from "@/stores/use-layout-store";
import { nodeRegistry } from "./nodes";

export interface CustomNodeData extends Record<string, unknown> {
  id: string;
  type: RecipeNode["type"];
  strategy?: string;
  description: string;
  isEntry: boolean;
  locator?: {
    strategy: string;
    value: string;
    score: number;
    fallbacksCount: number;
  };
  highlightParam?: string;
  hasErrors?: boolean;
  firstErrorMessage?: string;
  issues?: Array<{ nodeId: string; field: string; message: string }>;
}

export function CustomFlowNode({ data, selected }: { data: CustomNodeData; selected?: boolean }) {
  const nodeData = data;
  const runningNodeId = useRecipeStore((s) => s.runningNodeId);
  const isRunning = runningNodeId === nodeData.id;
  const isArmed = useLiveStore((s) => s.armedNodeId === nodeData.id);

  const Icon = nodeRegistry.get(nodeData.type)?.icon || Globe;

  return (
    <div
      onClick={() => useRecipeStore.getState().setSelectedNodeId(nodeData.id)}
      className={`relative w-64 rounded-xl border bg-neutral-900/95 backdrop-blur-md shadow-xl transition-all duration-200 cursor-pointer ${isRunning
          ? "border-amber-400 ring-4 ring-amber-400/30 animate-pulse"
          : selected
            ? "border-blue-500 ring-2 ring-blue-500/20"
            : "border-neutral-800 hover:border-neutral-700"
        }`}
    >
      {/* Handle superior de entrada */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-neutral-600 !border-2 !border-neutral-900 hover:!bg-blue-400 transition-colors"
      />

      {/* Badge de Entrada Inicial */}
      {nodeData.isEntry && (
        <div className="absolute -top-3 left-4 flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-500 text-neutral-950 text-[9px] font-bold uppercase tracking-wider shadow">
          <Play className="w-2.5 h-2.5 fill-current" />
          <span>Inicio</span>
        </div>
      )}

      {/* Encabezado del Nodo */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-neutral-800/80">
        <div className="flex items-center space-x-2 min-w-0">
          <div className="w-6 h-6 rounded-md bg-neutral-800 flex items-center justify-center text-neutral-200">
            <Icon className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-semibold text-neutral-200 uppercase tracking-wider truncate">
            {nodeData.type}
          </span>
        </div>
        <span className="text-[10px] font-mono text-neutral-500 truncate max-w-[80px]">
          {nodeData.id}
        </span>
      </div>

      {/* Cuerpo del Nodo */}
      <div className="p-3.5 space-y-2">
        <p className="text-xs text-neutral-300 line-clamp-2 leading-relaxed">
          {nodeData.description || "Sin descripción"}
        </p>

        {/* Parámetro destacado (URL, texto, variable) */}
        {nodeData.highlightParam && (
          <div className="p-1.5 rounded bg-neutral-950 border border-neutral-800 text-[11px] font-mono text-neutral-400 truncate">
            {nodeData.highlightParam}
          </div>
        )}

        {/* Localizador y Score de robustez */}
        {nodeData.locator && (
          <div className="flex items-center justify-between pt-1 border-t border-neutral-800/60 text-[10px]">
            <div className="flex items-center space-x-1 text-neutral-400 truncate max-w-[140px]">
              <span className="font-mono text-neutral-500">[{nodeData.locator.strategy}]</span>
              <span className="truncate">{nodeData.locator.value}</span>
            </div>
            <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-neutral-800">
              <ShieldCheck
                className={`w-3 h-3 ${nodeData.locator.score >= 80
                    ? "text-emerald-400"
                    : nodeData.locator.score >= 60
                      ? "text-amber-400"
                      : "text-rose-400"
                  }`}
              />
              <span className="font-mono font-medium text-neutral-300">
                {nodeData.locator.score}
              </span>
            </div>
          </div>
        )}

        {/* Botón directo de selección interactiva SIEMPRE VISIBLE en el nodo para waitFor y acciones */}
        {["waitFor", "click", "type", "select", "extract", "scroll"].includes(nodeData.type) && (
          <button
            type="button"
            onClick={(e: { stopPropagation: () => void; }) => {
              e.stopPropagation();
              useRecipeStore.getState().setSelectedNodeId(nodeData.id);
              if (nodeData.type === "waitFor" && nodeData.strategy !== "selector") {
                useRecipeStore.getState().updateNode(nodeData.id, {
                  params: { ...(nodeData as any).params, strategy: "selector" },
                  locator: nodeData.locator || {
                    primary: { strategy: "css", value: "", score: 60 },
                    fallbacks: [],
                  },
                } as any);
              }
              const live = useLiveStore.getState();
              if (live.isOpen && live.status === "ready") {
                if (live.armedNodeId === nodeData.id) live.disarm();
                else live.arm(nodeData.id);
              } else {
                useLayoutStore.getState().setMode("split");
                useLayoutStore.getState().setPaletteCollapsed(true);
                if (typeof live.openAndArm === "function") {
                  live.openAndArm(nodeData.id);
                } else {
                  useLiveStore.setState({ isOpen: true, pendingArmNodeId: nodeData.id });
                  if (live.status === "ready" && typeof live.arm === "function") {
                    live.arm(nodeData.id);
                  }
                }
                const recId = useRecipeStore.getState().recipeId || "current";
                const definition = useRecipeStore.getState().definition;
                const navNode = Object.values(definition.nodes).find(
                  (n) => n.type === "navigate" && (n as any).params?.url
                );
                if (navNode && (navNode as any).params?.url) {
                  live.startEmbedded(recId, (navNode as any).params.url);
                }
              }
            }}
            className={`nodrag w-full flex items-center justify-center space-x-1.5 py-1.5 px-2 rounded-md text-[11px] font-bold transition-all mt-1 ${isArmed
                ? "bg-amber-500 text-black ring-2 ring-amber-400 animate-pulse"
                : "bg-blue-600 hover:bg-blue-500 text-white shadow-sm"
              }`}
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>{isArmed ? "Seleccionando en el sitio…" : "🎯 Seleccionar en el sitio"}</span>
          </button>
        )}

        {/* Indicador de error de validación */}
        {nodeData.hasErrors && (
          <div
            className="flex items-center space-x-1 text-[10px] text-rose-400 pt-1"
            title={nodeData.firstErrorMessage || "Parámetros incompletos"}
          >
            <AlertTriangle className="w-3 h-3 shrink-0" />
            <span className="truncate">
              {nodeData.firstErrorMessage || "Parámetros incompletos"}
            </span>
          </div>
        )}
      </div>

      {/* Handles inferiores de salida */}
      {nodeData.type === "condition" ? (
        <>
          <Handle
            id="then"
            type="source"
            position={Position.Bottom}
            className="!left-[30%] !w-3 !h-3 !bg-emerald-500 !border-2 !border-neutral-900"
          />
          <Handle
            id="else"
            type="source"
            position={Position.Bottom}
            className="!left-[70%] !w-3 !h-3 !bg-rose-500 !border-2 !border-neutral-900"
          />
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-3 !h-3 !bg-neutral-600 !border-2 !border-neutral-900 hover:!bg-blue-400 transition-colors"
        />
      )}
    </div>
  );
}
