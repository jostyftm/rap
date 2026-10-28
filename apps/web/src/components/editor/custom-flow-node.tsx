"use client";

import React from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Globe,
  Play,
  ShieldCheck,
  AlertTriangle,
  Crosshair,
  Maximize2,
  Sparkles,
  Monitor,
  Camera,
  X,
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
  isInitializer?: boolean;
  isRoot?: boolean;
  isPrincipal?: boolean;
  isDisabled?: boolean;
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
  output?: unknown;
  preview?: RecipeNode["preview"];
  params?: Record<string, any>;
}

export function CustomFlowNode({ data, selected }: { data: CustomNodeData; selected?: boolean }) {
  const nodeData = data;
  const runningNodeId = useRecipeStore((s) => s.runningNodeId);
  const isRunning = runningNodeId === nodeData.id;
  const isArmed = useLiveStore((s) => s.armedNodeId === nodeData.id);
  const [isQuickTesting, setIsQuickTesting] = React.useState(false);
  const [isPreviewZoomOpen, setIsPreviewZoomOpen] = React.useState(false);

  const Icon = nodeRegistry.get(nodeData.type)?.icon || Globe;

  const handleQuickTest = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const recipeNode = useRecipeStore.getState().definition.nodes[nodeData.id];
    if (!recipeNode) return;
    setIsQuickTesting(true);
    try {
      const { testRecipeNode } = await import("@/lib/node-tester");
      await testRecipeNode(recipeNode);
    } finally {
      setIsQuickTesting(false);
    }
  };

  const handleOpenDetail = (e: React.MouseEvent) => {
    e.stopPropagation();
    useRecipeStore.getState().openNodeDetail(nodeData.id);
  };

  return (
    <div
      onClick={() => useRecipeStore.getState().setSelectedNodeId(nodeData.id)}
      onDoubleClick={handleOpenDetail}
      className={`relative w-64 rounded-lg border bg-zinc-900/95 transition-all cursor-pointer select-none shadow-sm ${
        nodeData.isDisabled
          ? "opacity-50 grayscale"
          : isRunning
          ? "border-amber-400 ring-2 ring-amber-400/20"
          : selected
          ? "border-zinc-300 ring-1 ring-zinc-300/30"
          : "border-zinc-800 hover:border-zinc-700"
      }`}
    >
      {/* Handle superior de entrada */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2.5 !h-2.5 !bg-zinc-500 !border-2 !border-zinc-900 hover:!bg-zinc-200 transition-colors"
      />

      {/* Badges de Entrada / Inicializador */}
      {nodeData.isEntry ? (
        <div className="absolute -top-2.5 left-3 flex items-center space-x-1 px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-950 text-[9px] font-mono font-semibold uppercase tracking-wider shadow-sm">
          <Play className="w-2.5 h-2.5 fill-current" />
          <span>{nodeData.isInitializer ? "Trigger Principal" : "Inicio"}</span>
        </div>
      ) : nodeData.isInitializer && nodeData.isRoot ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            useRecipeStore.getState().setEntryNode(nodeData.id);
          }}
          title="Hacer este nodo el trigger/inicio principal del flujo"
          className="nodrag absolute -top-2.5 left-3 flex items-center space-x-1 px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 text-[9px] font-mono transition-colors shadow-sm"
        >
          <Sparkles className="w-2.5 h-2.5 text-amber-400" />
          <span>Trigger · Hacer Principal</span>
        </button>
      ) : null}

      {/* Encabezado del Nodo */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/80">
        <div className="flex items-center space-x-2 min-w-0">
          <div className="w-5 h-5 rounded bg-zinc-800 flex items-center justify-center text-zinc-300 border border-zinc-700/60">
            <Icon className="w-3 h-3" />
          </div>
          <span className="text-[11px] font-mono font-medium text-zinc-200 uppercase tracking-wide truncate">
            {nodeData.type}
          </span>
        </div>
        <div className="flex items-center space-x-1">
          <button
            type="button"
            title="Abrir vista de edición completa (Doble clic)"
            onClick={handleOpenDetail}
            className="nodrag p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <Maximize2 className="w-3 h-3" />
          </button>
          <button
            type="button"
            title="Probar este paso"
            onClick={handleQuickTest}
            className="nodrag p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400 transition-colors"
          >
            <Play className={`w-2.5 h-2.5 ${isQuickTesting ? "animate-spin" : "fill-current"}`} />
          </button>
          <span className="text-[10px] font-mono text-zinc-500 truncate max-w-[60px]">
            {nodeData.id}
          </span>
        </div>
      </div>

      {/* Cuerpo del Nodo */}
      <div className="p-3 space-y-2">
        <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
          {nodeData.description || "Sin descripción"}
        </p>

        {/* Previsualización visual de la acción grabada */}
        {nodeData.preview?.image && (
          <div className="nodrag relative group/preview mt-1.5 rounded-md overflow-hidden border border-zinc-800 bg-zinc-950/80">
            <img
              src={nodeData.preview.image}
              alt="Previsualización de acción"
              className="w-full h-24 object-cover object-center cursor-pointer transition-transform duration-200 group-hover/preview:scale-[1.03]"
              onClick={(e) => {
                e.stopPropagation();
                setIsPreviewZoomOpen(true);
              }}
            />
            {/* Badge de ámbito (Web vs Escritorio) */}
            <div className="absolute top-1 left-1 flex items-center space-x-1 px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-xs text-[9px] font-mono text-zinc-200 border border-zinc-700/60">
              {nodeData.preview.targetScope === "desktop" ? (
                <>
                  <Monitor className="w-2.5 h-2.5 text-purple-400" />
                  <span>Escritorio</span>
                </>
              ) : (
                <>
                  <Globe className="w-2.5 h-2.5 text-rose-400" />
                  <span>Web</span>
                </>
              )}
            </div>

            {/* Coordenadas */}
            {nodeData.preview.coordinates && (
              <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-[9px] font-mono text-zinc-300 border border-zinc-700/50">
                X:{nodeData.preview.coordinates.x} Y:{nodeData.preview.coordinates.y}
              </div>
            )}

            {/* Botón de lupa */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsPreviewZoomOpen(true);
              }}
              className="absolute top-1 right-1 opacity-0 group-hover/preview:opacity-100 transition-opacity p-1 rounded bg-black/80 hover:bg-zinc-800 text-zinc-200 cursor-pointer"
              title="Ampliar captura"
            >
              <Maximize2 className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Parámetro destacado (URL, texto, variable) */}
        {nodeData.highlightParam && (
          <div className="p-1.5 rounded bg-zinc-950 border border-zinc-800/80 text-[11px] font-mono text-zinc-300 truncate">
            {nodeData.highlightParam}
          </div>
        )}

        {/* Salida probada o ejecutada */}
        {nodeData.output !== undefined && (
          <div className="p-1.5 rounded bg-zinc-950 border border-emerald-500/20 text-[10px] font-mono text-emerald-400 truncate flex items-center justify-between">
            <span className="text-zinc-500 text-[9px] uppercase shrink-0 mr-1">Salida:</span>
            <span className="truncate text-right">
              {typeof nodeData.output === "object" ? JSON.stringify(nodeData.output) : String(nodeData.output)}
            </span>
          </div>
        )}

        {/* Localizador y Score de robustez */}
        {nodeData.locator && (
          <div className="flex items-center justify-between pt-1 border-t border-zinc-800/60 text-[10px]">
            <div className="flex items-center space-x-1 text-zinc-400 truncate max-w-[140px]">
              <span className="font-mono text-zinc-500">[{nodeData.locator.strategy}]</span>
              <span className="truncate">{nodeData.locator.value}</span>
            </div>
            <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700/50">
              <ShieldCheck
                className={`w-3 h-3 ${
                  nodeData.locator.score >= 80
                    ? "text-emerald-400"
                    : nodeData.locator.score >= 60
                    ? "text-amber-400"
                    : "text-rose-400"
                }`}
              />
              <span className="font-mono font-medium text-zinc-300">
                {nodeData.locator.score}
              </span>
            </div>
          </div>
        )}

        {/* Botón directo de selección interactiva */}
        {["waitFor", "click", "type", "select", "extract", "scroll"].includes(nodeData.type) && (
          <button
            type="button"
            onClick={(e: { stopPropagation: () => void }) => {
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
            className={`nodrag w-full flex items-center justify-center space-x-1.5 py-1.5 px-2 rounded text-[11px] font-medium transition-colors mt-1 ${
              isArmed
                ? "bg-amber-400 text-zinc-950 font-semibold"
                : "bg-zinc-800 hover:bg-zinc-750 text-zinc-200 border border-zinc-700/60"
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>{isArmed ? "Seleccionando en el sitio…" : "Inspeccionar elemento"}</span>
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

      {/* Etiquetas de salidas del bloque tryCatch */}
      {nodeData.type === "tryCatch" && (
        <div className="flex items-center justify-between px-3 pb-1 text-[8px] font-mono uppercase tracking-wider">
          <span className="text-amber-400">try</span>
          <span className="text-rose-400">catch</span>
          <span className="text-violet-400">finally</span>
          <span className="text-zinc-500">next</span>
        </div>
      )}

      {/* Etiquetas de salidas del bloque loop */}
      {nodeData.type === "loop" && (
        <div className="flex items-center justify-between px-3 pb-1 text-[8px] font-mono uppercase tracking-wider">
          <span className="text-rose-400">body</span>
          <span className="text-zinc-500">next</span>
        </div>
      )}

      {/* Handles inferiores de salida */}
      {nodeData.type === "condition" ? (
        <>
          <Handle
            id="then"
            type="source"
            position={Position.Bottom}
            className="!left-[30%] !w-2.5 !h-2.5 !bg-emerald-500 !border-2 !border-zinc-900"
          />
          <Handle
            id="else"
            type="source"
            position={Position.Bottom}
            className="!left-[70%] !w-2.5 !h-2.5 !bg-rose-500 !border-2 !border-zinc-900"
          />
        </>
      ) : nodeData.type === "loop" ? (
        <>
          <Handle
            id="body"
            type="source"
            position={Position.Bottom}
            title="Cuerpo del bucle (una vez por elemento)"
            className="!left-[30%] !w-2.5 !h-2.5 !bg-rose-500 !border-2 !border-zinc-900"
          />
          <Handle
            type="source"
            position={Position.Bottom}
            title="Continuación tras el bucle"
            className="!left-[70%] !w-2.5 !h-2.5 !bg-zinc-500 !border-2 !border-zinc-900 hover:!bg-zinc-200 transition-colors"
          />
        </>
      ) : nodeData.type === "tryCatch" ? (
        <>
          <Handle
            id="try"
            type="source"
            position={Position.Bottom}
            title="Bloque try"
            className="!left-[12%] !w-2.5 !h-2.5 !bg-amber-500 !border-2 !border-zinc-900"
          />
          <Handle
            id="catch"
            type="source"
            position={Position.Bottom}
            title="Bloque catch"
            className="!left-[37%] !w-2.5 !h-2.5 !bg-rose-500 !border-2 !border-zinc-900"
          />
          <Handle
            id="finally"
            type="source"
            position={Position.Bottom}
            title="Bloque finally"
            className="!left-[62%] !w-2.5 !h-2.5 !bg-violet-500 !border-2 !border-zinc-900"
          />
          <Handle
            type="source"
            position={Position.Bottom}
            title="Continuación tras el bloque"
            className="!left-[87%] !w-2.5 !h-2.5 !bg-zinc-500 !border-2 !border-zinc-900 hover:!bg-zinc-200 transition-colors"
          />
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-2.5 !h-2.5 !bg-zinc-500 !border-2 !border-zinc-900 hover:!bg-zinc-200 transition-colors"
        />
      )}
      {/* Modal / Zoom de Previsualización */}
      {isPreviewZoomOpen && nodeData.preview?.image && (
        <div
          className="nodrag fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 cursor-default"
          onClick={(e) => {
            e.stopPropagation();
            setIsPreviewZoomOpen(false);
          }}
        >
          <div
            className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
              <div className="flex items-center space-x-2">
                <Camera className="w-4 h-4 text-zinc-400" />
                <span className="text-xs font-semibold text-zinc-200">
                  Previsualización de Acción Capturada
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
                  {nodeData.preview.targetScope === "desktop" ? "Escritorio" : "Web"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsPreviewZoomOpen(false)}
                className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-black flex items-center justify-center">
              <img
                src={nodeData.preview.image}
                alt="Captura ampliada"
                className="max-h-72 w-auto object-contain rounded border border-zinc-800"
              />
            </div>

            <div className="p-3 bg-zinc-950 text-xs text-zinc-300 space-y-1.5 border-t border-zinc-800">
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-zinc-500">Nodo:</span>
                <span className="text-zinc-300">{nodeData.id}</span>
              </div>
              {nodeData.preview.windowTitle && (
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-zinc-500 font-mono">Ventana:</span>
                  <span className="text-zinc-200">{nodeData.preview.windowTitle}</span>
                </div>
              )}
              {nodeData.preview.coordinates && (
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-zinc-500">Coordenadas:</span>
                  <span className="text-purple-400 font-semibold">
                    X: {nodeData.preview.coordinates.x}, Y: {nodeData.preview.coordinates.y}
                  </span>
                </div>
              )}
              {nodeData.preview.elementSnippet && (
                <div className="pt-1 text-[11px] text-zinc-400 border-t border-zinc-800/60 truncate">
                  <span className="text-zinc-500 font-mono mr-1">Objetivo:</span>
                  <span className="font-mono text-zinc-300">{nodeData.preview.elementSnippet}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
