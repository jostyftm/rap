"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Play,
  Sparkles,
  Layers,
  Globe,
  SlidersHorizontal,
} from "lucide-react";
import { useRecipeStore } from "@/stores/use-recipe-store";
import { ThreePanelLayout } from "./three-panel-layout";
import { InputDataPanel } from "./input-data-panel";
import { NodeConfigPanel } from "./node-config-panel";
import { OutputLivePanel } from "./output-live-panel";
import { testRecipeNode } from "@/lib/node-tester";
import { nodeRegistry } from "../nodes";
import type { RecipeNode } from "@rpa/dsl";

export function NodeDetailModal() {
  const activeDetailNodeId = useRecipeStore((s) => s.activeDetailNodeId);
  const closeNodeDetail = useRecipeStore((s) => s.closeNodeDetail);
  const openNodeDetail = useRecipeStore((s) => s.openNodeDetail);
  const definition = useRecipeStore((s) => s.definition);
  const setNodeOutput = useRecipeStore((s) => s.setNodeOutput);
  const setNodeExecState = useRecipeStore((s) => s.setNodeExecState);
  const setEntryNode = useRecipeStore((s) => s.setEntryNode);

  const [isExecuting, setIsExecuting] = useState(false);

  const nodes = definition.nodes || {};
  const edges = definition.edges || [];

  const currentNode: RecipeNode | undefined = activeDetailNodeId
    ? nodes[activeDetailNodeId]
    : undefined;

  // Secuencia lineal de los nodos para cálculo de índices y vecinos
  const orderedNodes = useMemo(() => {
    const list: RecipeNode[] = [];
    const visited = new Set<string>();

    let currId: string | undefined = definition.entry;
    while (currId && nodes[currId] && !visited.has(currId)) {
      visited.add(currId);
      list.push(nodes[currId]);
      currId = nodes[currId].next;
    }

    for (const [id, node] of Object.entries(nodes)) {
      if (!visited.has(id)) {
        visited.add(id);
        list.push(node);
      }
    }
    return list;
  }, [definition.entry, nodes]);

  const currentIndex = orderedNodes.findIndex((n) => n.id === activeDetailNodeId);
  const totalNodes = orderedNodes.length;

  // Nodo previo y siguiente
  const prevNode = currentIndex > 0 ? orderedNodes[currentIndex - 1] : undefined;
  const nextNode =
    currentIndex !== -1 && currentIndex < orderedNodes.length - 1
      ? orderedNodes[currentIndex + 1]
      : undefined;

  // Ejecución individual del nodo activo
  const handleExecuteCurrentNode = useCallback(async () => {
    if (!currentNode) return;
    setIsExecuting(true);
    setNodeExecState(currentNode.id, "running");
    try {
      const result = await testRecipeNode(currentNode);
      if (result.ok) {
        setNodeExecState(currentNode.id, "success", result.durationMs);
        if (result.output !== undefined) {
          setNodeOutput(currentNode.id, result.output);
        }
      } else {
        setNodeExecState(currentNode.id, "error", result.durationMs, result.error);
      }
    } catch (err: any) {
      setNodeExecState(currentNode.id, "error", undefined, err?.message || String(err));
    } finally {
      setIsExecuting(false);
    }
  }, [currentNode, setNodeExecState, setNodeOutput]);

  // Atajos de teclado del modal (Escape, Alt+Left, Alt+Right, Ctrl+Enter)
  useEffect(() => {
    if (!activeDetailNodeId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Cerrar con Escape
      if (e.key === "Escape") {
        e.preventDefault();
        closeNodeDetail();
        return;
      }

      // 2. Ejecutar con Ctrl+Enter o Cmd+Enter
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleExecuteCurrentNode();
        return;
      }

      // 3. Navegar a nodo previo con Alt + ArrowLeft
      if (e.altKey && e.key === "ArrowLeft") {
        e.preventDefault();
        if (prevNode) openNodeDetail(prevNode.id);
        return;
      }

      // 4. Navegar a nodo siguiente con Alt + ArrowRight
      if (e.altKey && e.key === "ArrowRight") {
        e.preventDefault();
        if (nextNode) openNodeDetail(nextNode.id);
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    activeDetailNodeId,
    closeNodeDetail,
    handleExecuteCurrentNode,
    prevNode,
    nextNode,
    openNodeDetail,
  ]);

  if (!activeDetailNodeId || !currentNode) {
    return null;
  }

  const isEntry = definition.entry === currentNode.id;
  const nodeDef = nodeRegistry.get(currentNode.type);
  const Icon = nodeDef?.icon || Globe;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 animate-in fade-in duration-150">
      <div className="relative w-[96vw] max-w-[1720px] h-[92vh] bg-[#0c0c0e] border border-zinc-800 rounded-xl shadow-2xl flex flex-col overflow-visible select-none">
        {/* ================================================================= */}
        {/* BOTONES FLOTANTES DE NAVEGACIÓN EN LA MITAD DEL MODAL (VERTICALLY CENTERED) */}
        {/* Mitad del ancho adentro y la otra mitad afuera con translate-x */}
        {/* ================================================================= */}

        {/* 1. Botón Flotante Nodo Previo (Izquierda) */}
        {prevNode && (
          <button
            type="button"
            onClick={() => openNodeDetail(prevNode.id)}
            title={`Nodo previo: ${prevNode.description || prevNode.type} (Alt + ←)`}
            className="group absolute left-0 -translate-x-1/2 top-1/2 -translate-y-1/2 z-50 w-9 h-9 rounded-full bg-zinc-900 border border-zinc-700 hover:border-zinc-400 text-zinc-300 hover:text-white shadow-2xl flex items-center justify-center transition-all hover:scale-110 active:scale-95 focus:outline-none focus:ring-2 focus:ring-amber-400"
            aria-label={`Ir al nodo previo: ${prevNode.id}`}
          >
            <ChevronLeft className="w-5 h-5 transition-transform group-hover:-translate-x-0.5" />
            {/* Tooltip con nombre del vecino */}
            <div className="pointer-events-none absolute left-full ml-2 px-2 py-1 rounded bg-zinc-950 border border-zinc-800 text-[10px] font-mono text-zinc-200 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
              ← {prevNode.description || prevNode.type} <span className="text-zinc-500">(Alt+←)</span>
            </div>
          </button>
        )}

        {/* 2. Botón Flotante Nodo Siguiente (Derecha) */}
        {nextNode && (
          <button
            type="button"
            onClick={() => openNodeDetail(nextNode.id)}
            title={`Nodo siguiente: ${nextNode.description || nextNode.type} (Alt + →)`}
            className="group absolute right-0 translate-x-1/2 top-1/2 -translate-y-1/2 z-50 w-9 h-9 rounded-full bg-zinc-900 border border-zinc-700 hover:border-zinc-400 text-zinc-300 hover:text-white shadow-2xl flex items-center justify-center transition-all hover:scale-110 active:scale-95 focus:outline-none focus:ring-2 focus:ring-amber-400"
            aria-label={`Ir al nodo siguiente: ${nextNode.id}`}
          >
            <ChevronRight className="w-5 h-5 transition-transform group-hover:translate-x-0.5" />
            {/* Tooltip con nombre del vecino */}
            <div className="pointer-events-none absolute right-full mr-2 px-2 py-1 rounded bg-zinc-950 border border-zinc-800 text-[10px] font-mono text-zinc-200 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
              {nextNode.description || nextNode.type} → <span className="text-zinc-500">(Alt+→)</span>
            </div>
          </button>
        )}

        {/* ================================================================= */}
        {/* BARRA SUPERIOR DE NAVEGACIÓN Y MIGAS DE PAN */}
        {/* ================================================================= */}
        <div className="h-11 px-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/90 rounded-t-xl shrink-0">
          {/* Migas de Pan */}
          <div className="flex items-center space-x-2 text-xs font-mono text-zinc-400">
            <span className="text-zinc-500">Flujo</span>
            <span className="text-zinc-600">/</span>
            <div className="flex items-center space-x-1.5 text-zinc-200 font-medium">
              <Icon className="w-3.5 h-3.5 text-amber-400" />
              <span className="truncate max-w-[200px]">
                {currentNode.description || currentNode.type}
              </span>
            </div>
            {currentIndex !== -1 && (
              <span className="text-[10px] text-zinc-500 font-sans">
                (Paso {currentIndex + 1} de {totalNodes})
              </span>
            )}
          </div>

          {/* Estado de Entrada / Trigger */}
          <div className="flex items-center space-x-2">
            {nodeDef?.isInitializer && (
              isEntry ? (
                <div className="flex items-center space-x-1 px-2 py-0.5 rounded bg-amber-400/15 border border-amber-400/40 text-amber-300 text-[10px] font-mono font-semibold">
                  <Play className="w-2.5 h-2.5 fill-current" />
                  <span>★ Trigger Principal (Inicio del Flujo)</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setEntryNode(currentNode.id)}
                  title="Asignar este trigger como el inicio principal de la receta"
                  className="flex items-center space-x-1 px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white text-[10px] font-mono transition-colors"
                >
                  <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                  <span>Trigger Secundario · Hacer Principal</span>
                </button>
              )
            )}

            {/* Botón Cerrar (Esc) */}
            <button
              type="button"
              onClick={closeNodeDetail}
              title="Cerrar vista (Esc)"
              className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors ml-2"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ================================================================= */}
        {/* CUERPO DEL MODAL: LAYOUT DE TRES ZONAS REDIMENSIONABLES */}
        {/* ================================================================= */}
        <div className="flex-1 overflow-hidden rounded-b-xl flex">
          <ThreePanelLayout
            left={<InputDataPanel currentNodeId={currentNode.id} />}
            center={
              <NodeConfigPanel
                node={currentNode}
                onExecuteNode={handleExecuteCurrentNode}
                isExecuting={isExecuting}
              />
            }
            right={
              <OutputLivePanel
                node={currentNode}
                onExecuteNode={handleExecuteCurrentNode}
                isExecuting={isExecuting}
              />
            }
          />
        </div>
      </div>
    </div>
  );
}
