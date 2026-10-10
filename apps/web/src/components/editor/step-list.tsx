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
import { useRecipeStore } from "../../stores/use-recipe-store";

export function StepList() {
  const definition = useRecipeStore((s) => s.definition);
  const selectedNodeId = useRecipeStore((s) => s.selectedNodeId);
  const setSelectedNodeId = useRecipeStore((s) => s.setSelectedNodeId);
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

  const iconMap: Record<RecipeNode["type"], React.ComponentType<{ className?: string }>> = {
    navigate: Globe,
    click: MousePointer,
    type: Keyboard,
    select: ListFilter,
    waitFor: Clock,
    extract: Download,
    screenshot: Camera,
    setVariable: Variable,
    condition: GitBranch,
    loop: Repeat,
  };

  return (
    <div className="flex-1 h-full bg-neutral-950 p-6 overflow-y-auto select-none">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-neutral-100">
              Secuencia de Pasos ({orderedNodes.length})
            </h2>
            <p className="text-xs text-neutral-400">
              Visualiza y reordena la secuencia determinista de ejecución del flujo.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {orderedNodes.map((node, index) => {
            const Icon = iconMap[node.type] || Globe;
            const isSelected = selectedNodeId === node.id;
            const isRunning = runningNodeId === node.id;
            const isEntry = definition.entry === node.id;

            return (
              <div
                key={node.id}
                onClick={() => setSelectedNodeId(node.id)}
                className={`group flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer ${
                  isRunning
                    ? "bg-amber-950/20 border-amber-500/80 ring-2 ring-amber-500/30"
                    : isSelected
                    ? "bg-neutral-900 border-blue-500 ring-1 ring-blue-500/30"
                    : "bg-neutral-900/60 border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900"
                }`}
              >
                <div className="flex items-center space-x-3 min-w-0">
                  {/* Número de paso */}
                  <span className="w-6 text-center font-mono text-xs font-bold text-neutral-500 group-hover:text-neutral-300">
                    {index + 1}
                  </span>

                  {/* Icono del nodo */}
                  <div className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center text-neutral-200 shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>

                  {/* Datos del paso */}
                  <div className="min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-neutral-200">
                        {node.type}
                      </span>
                      {isEntry && (
                        <span className="flex items-center space-x-1 px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 text-[9px] font-bold uppercase">
                          <Play className="w-2 h-2 fill-current" />
                          <span>Inicio</span>
                        </span>
                      )}
                      <span className="text-[10px] font-mono text-neutral-500">
                        ({node.id})
                      </span>
                    </div>

                    <p className="text-xs text-neutral-400 truncate mt-0.5 max-w-lg">
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
