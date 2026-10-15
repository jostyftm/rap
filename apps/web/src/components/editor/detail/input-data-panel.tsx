"use client";

import React, { useState, useMemo } from "react";
import {
  Layers,
  Play,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Loader2,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { useRecipeStore } from "@/stores/use-recipe-store";
import { DataViewer } from "./data-viewer";
import { testRecipeNode } from "@/lib/node-tester";
import type { RecipeNode } from "@rpa/dsl";

interface InputDataPanelProps {
  currentNodeId: string;
  onInsertToken?: (token: string) => void;
  className?: string;
}

export function InputDataPanel({
  currentNodeId,
  onInsertToken,
  className = "",
}: InputDataPanelProps) {
  const definition = useRecipeStore((s) => s.definition);
  const nodeOutputs = useRecipeStore((s) => s.nodeOutputs);
  const nodeExecStatuses = useRecipeStore((s) => s.nodeExecStatuses);
  const setNodeOutput = useRecipeStore((s) => s.setNodeOutput);
  const setNodeExecState = useRecipeStore((s) => s.setNodeExecState);

  const [isRunningPrevious, setIsRunningPrevious] = useState(false);

  // 1. Calcular todos los nodos previos al nodo actual en el flujo
  const precedingNodes = useMemo(() => {
    const nodes = definition.nodes || {};
    const edges = definition.edges || [];

    // Nodos con aristas directas hacia currentNodeId
    const directPrecedings = edges
      .filter((e) => e.to === currentNodeId)
      .map((e) => nodes[e.from])
      .filter(Boolean) as RecipeNode[];

    if (directPrecedings.length > 0) return directPrecedings;

    // Si no hay aristas directas, listar todos los nodos anteriores según topología
    const allList = Object.values(nodes);
    const currIndex = allList.findIndex((n) => n.id === currentNodeId);
    if (currIndex > 0) {
      return allList.slice(0, currIndex);
    }

    return allList.filter((n) => n.id !== currentNodeId);
  }, [definition, currentNodeId]);

  const [selectedPrevId, setSelectedPrevId] = useState<string>(
    precedingNodes[0]?.id || "all"
  );

  // Asegurar que selectedPrevId sea válido si cambian los nodos previos
  const activeNodeId =
    selectedPrevId === "all" || precedingNodes.some((n) => n.id === selectedPrevId)
      ? selectedPrevId
      : precedingNodes[0]?.id || "all";

  // Obtener los datos a mostrar
  const displayData = useMemo(() => {
    if (activeNodeId === "all") {
      const combined: Record<string, unknown> = {};
      for (const node of precedingNodes) {
        combined[node.id] = nodeOutputs[node.id] ?? null;
      }
      return combined;
    }
    return nodeOutputs[activeNodeId];
  }, [activeNodeId, precedingNodes, nodeOutputs]);

  const activePrevNode =
    activeNodeId !== "all" ? definition.nodes[activeNodeId] : precedingNodes[0];

  const isExecuted =
    activeNodeId === "all"
      ? precedingNodes.some((n) => nodeOutputs[n.id] !== undefined)
      : nodeOutputs[activeNodeId] !== undefined;

  const handleRunPrevious = async () => {
    if (!activePrevNode) return;
    setIsRunningPrevious(true);
    setNodeExecState(activePrevNode.id, "running");
    try {
      const result = await testRecipeNode(activePrevNode);
      if (result.ok) {
        setNodeExecState(activePrevNode.id, "success", result.durationMs);
        if (result.output !== undefined) {
          setNodeOutput(activePrevNode.id, result.output);
        }
      } else {
        setNodeExecState(activePrevNode.id, "error", result.durationMs);
      }
    } catch {
      setNodeExecState(activePrevNode.id, "error");
    } finally {
      setIsRunningPrevious(false);
    }
  };

  return (
    <div className={`flex flex-col h-full bg-[#0c0c0e] border-r border-zinc-800 ${className}`}>
      {/* Encabezado del Panel de Entrada */}
      <div className="p-3 border-b border-zinc-800 space-y-2 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1.5 text-xs font-mono font-medium text-zinc-300">
            <Layers className="w-3.5 h-3.5 text-zinc-400" />
            <span className="uppercase tracking-wider text-[11px]">Entrada de Datos</span>
          </div>
          <span className="text-[10px] text-zinc-500 font-mono">
            {precedingNodes.length} {precedingNodes.length === 1 ? "nodo previo" : "nodos previos"}
          </span>
        </div>

        {/* Selector de Nodo Previo con Indicador de Estado */}
        {precedingNodes.length > 0 && (
          <div className="flex items-center space-x-2">
            <select
              value={activeNodeId}
              onChange={(e) => setSelectedPrevId(e.target.value)}
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-zinc-700 truncate"
            >
              {precedingNodes.length > 1 && (
                <option value="all">★ Todos los nodos previos</option>
              )}
              {precedingNodes.map((n) => {
                const hasOut = nodeOutputs[n.id] !== undefined;
                return (
                  <option key={n.id} value={n.id}>
                    {n.description || n.type} ({n.id}) {hasOut ? "✓" : "○"}
                  </option>
                );
              })}
            </select>

            {/* Badge de estado del nodo previo seleccionado */}
            {activeNodeId !== "all" && (
              <div className="shrink-0">
                {isExecuted ? (
                  <div className="flex items-center space-x-1 px-1.5 py-1 rounded bg-emerald-950/60 border border-emerald-800/60 text-emerald-400 text-[10px] font-mono">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Ejecutado</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-1 px-1.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-500 text-[10px] font-mono">
                    <Clock className="w-3 h-3" />
                    <span>Sin ejecutar</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Contenido Principal: Datos o Estado Vacío */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {precedingNodes.length === 0 ? (
          <div className="p-6 text-center text-xs text-zinc-500 font-mono space-y-2 m-auto">
            <p>Este es el nodo inicial del flujo.</p>
            <p className="text-[11px] text-zinc-600">No recibe entradas de nodos anteriores.</p>
          </div>
        ) : !isExecuted ? (
          /* ESTADO VACÍO: Si el nodo previo no se ha ejecutado */
          <div className="p-6 flex flex-col items-center justify-center text-center space-y-4 m-auto max-w-[280px]">
            <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500">
              <Clock className="w-5 h-5" />
            </div>

            <div className="space-y-1">
              <h4 className="text-xs font-mono font-medium text-zinc-200">
                Sin datos de entrada aún
              </h4>
              <p className="text-[11px] text-zinc-400 leading-relaxed font-sans">
                El nodo previo{" "}
                <span className="font-mono text-zinc-200">
                  {activePrevNode?.id || "seleccionado"}
                </span>{" "}
                no se ha ejecutado en esta sesión. Ejecútalo para ver su esquema y arrastrar variables.
              </p>
            </div>

            {activePrevNode && (
              <button
                type="button"
                onClick={handleRunPrevious}
                disabled={isRunningPrevious}
                className="w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-md bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-medium transition-colors shadow-sm disabled:opacity-50"
              >
                {isRunningPrevious ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Ejecutando nodo previo...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Ejecutar nodo previo</span>
                  </>
                )}
              </button>
            )}
          </div>
        ) : (
          /* MODO DATOS: Schema | Table | JSON */
          <DataViewer
            data={displayData}
            baseTokenPrefix={
              activeNodeId === "all"
                ? "{{steps"
                : `{{steps.${activeNodeId}.output`
            }
            onInsertToken={onInsertToken}
          />
        )}
      </div>
    </div>
  );
}
