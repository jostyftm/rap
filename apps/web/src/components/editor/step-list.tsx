"use client";

import React, { useMemo } from "react";
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
  ArrowUp,
  ArrowDown,
  Trash2,
  Copy,
  Play,
  ShieldCheck,
} from "lucide-react";
import type { RecipeNode } from "@rpa/dsl";
import { useRecipeStore } from "@/stores/use-recipe-store";
import { nodeRegistry } from "./nodes";

export function StepList() {
  const definition = useRecipeStore((s) => s.definition);
  const selectedNodeId = useRecipeStore((s) => s.selectedNodeId);
  const selectedNodeIds = useRecipeStore((s) => s.selectedNodeIds);
  const setSelectedNodeId = useRecipeStore((s) => s.setSelectedNodeId);
  const toggleNodeSelection = useRecipeStore((s) => s.toggleNodeSelection);
  const reorderNodes = useRecipeStore((s) => s.reorderNodes);
  const deleteNode = useRecipeStore((s) => s.deleteNode);
  const addNode = useRecipeStore((s) => s.addNode);
  const runningNodeId = useRecipeStore((s) => s.runningNodeId);

  // Ordenar nodos linealmente comenzando por entry
  const orderedNodes = useMemo(() => {
    const list: RecipeNode[] = [];
    const visited = new Set<string>();

    let currId: string | undefined = definition.entry;
    while (currId && definition.nodes[currId] && !visited.has(currId)) {
      visited.add(currId);
      list.push(definition.nodes[currId]);
      currId = definition.nodes[currId].next;
    }

    // Agregar nodos desconectados al final
    for (const key of Object.keys(definition.nodes)) {
      if (!visited.has(key)) {
        list.push(definition.nodes[key]);
      }
    }

    return list;
  }, [definition]);

  const handleMove = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= orderedNodes.length) return;

    const ids = orderedNodes.map((n) => n.id);
    const temp = ids[index];
    ids[index] = ids[targetIndex];
    ids[targetIndex] = temp;

    reorderNodes(ids);
  };

  return (
    <div className="flex-1 h-full bg-[#09090b] p-6 overflow-y-auto select-none">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium text-zinc-100">
              Secuencia de Pasos ({orderedNodes.length})
            </h2>
            <p className="text-xs text-zinc-400">
              Visualiza y reordena la secuencia determinista de ejecución del flujo.
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          {orderedNodes.map((node, index) => {
            const Icon = nodeRegistry.get(node.type)?.icon || Globe;
            const isSelected =
              selectedNodeIds.length > 0
                ? selectedNodeIds.includes(node.id)
                : selectedNodeId === node.id;
            const isRunning = runningNodeId === node.id;
            const isEntry = definition.entry === node.id;

            return (
              <div
                key={node.id}
                onClick={(e) => {
                  const isMulti = e.shiftKey || e.metaKey || e.ctrlKey;
                  toggleNodeSelection(node.id, isMulti);
                }}
                className={`group flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer ${
                  isRunning
                    ? "bg-amber-950/20 border-amber-400/80 ring-1 ring-amber-400/30"
                    : isSelected
                    ? "bg-zinc-900 border-zinc-300 ring-1 ring-zinc-300/30"
                    : "bg-zinc-900/40 border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-850/50"
                }`}
              >
                <div className="flex items-center space-x-3 min-w-0">
                  {/* Número de paso */}
                  <span className="w-5 text-center font-mono text-xs text-zinc-500 group-hover:text-zinc-300">
                    {index + 1}
                  </span>

                  {/* Icono del nodo */}
                  <div className="w-7 h-7 rounded bg-zinc-800 flex items-center justify-center text-zinc-300 border border-zinc-700/60 shrink-0">
                    <Icon className="w-3.5 h-3.5" />
                  </div>

                  {/* Datos del paso */}
                  <div className="min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-mono font-medium uppercase tracking-wide text-zinc-200">
                        {node.type}
                      </span>
                      {isEntry && (
                        <span className="flex items-center space-x-1 px-1.5 py-0.2 rounded bg-zinc-100 text-zinc-950 text-[9px] font-mono font-medium uppercase">
                          <Play className="w-2 h-2 fill-current" />
                          <span>Inicio</span>
                        </span>
                      )}
                      <span className="text-[10px] font-mono text-zinc-500">
                        ({node.id})
                      </span>
                    </div>

                    <p className="text-xs text-zinc-400 truncate mt-0.5 max-w-lg">
                      {node.description || "Paso sin descripción"}
                    </p>
                  </div>
                </div>

                {/* Badges y Acciones */}
                <div className="flex items-center space-x-4 shrink-0">
                  {"locator" in node && node.locator && (
                    <div className="hidden sm:flex items-center space-x-1 px-2 py-1 rounded bg-neutral-950 border border-neutral-800 text-[10px]">
                      <ShieldCheck className="w-3 h-3 text-emerald-400" />
                      <span className="font-mono text-neutral-400">
                        Score: {node.locator.primary.score}
                      </span>
                    </div>
                  )}

                  {/* Botones de Reordenamiento y Borrado */}
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMove(index, "up");
                      }}
                      disabled={index === 0}
                      title="Mover arriba"
                      className="p-1 rounded text-neutral-500 hover:text-white disabled:opacity-20 hover:bg-neutral-800 transition-colors"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMove(index, "down");
                      }}
                      disabled={index === orderedNodes.length - 1}
                      title="Mover abajo"
                      className="p-1 rounded text-neutral-500 hover:text-white disabled:opacity-20 hover:bg-neutral-800 transition-colors"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNode(node.id);
                      }}
                      title="Eliminar paso"
                      className="p-1 rounded text-neutral-500 hover:text-rose-400 hover:bg-neutral-800 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
