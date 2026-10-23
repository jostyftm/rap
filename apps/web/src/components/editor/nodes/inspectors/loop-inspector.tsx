"use client";

import React from "react";
import type { LoopNode } from "@rpa/dsl";
import type { NodeInspectorProps } from "../types";
import { useRecipeStore } from "@/stores/use-recipe-store";

export function LoopInspectorForm({
  node,
  updateParam,
}: NodeInspectorProps<LoopNode>) {
  const definition = useRecipeStore((s) => s.definition);
  const setBranchTarget = useRecipeStore((s) => s.setBranchTarget);

  const availableNodes = Object.values(definition.nodes)
    .filter((candidate) => candidate.id !== node.id)
    .sort((a, b) =>
      (a.description || a.id).localeCompare(b.description || b.id, "es")
    );

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-[11px] font-medium text-neutral-400 mb-1">
          Colección a iterar (Array)
        </label>
        <input
          type="text"
          value={node.params.collectionExpression || ""}
          onChange={(e) => updateParam("collectionExpression", e.target.value)}
          placeholder="variables.items o [1, 2, 3]"
          className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-neutral-200 font-mono focus:outline-none focus:border-blue-500"
        />
        <p className="mt-1 text-[10px] text-neutral-500 leading-relaxed">
          Acepta una variable (<span className="font-mono">variables.items</span>),
          una expresión JSONata o un literal como{" "}
          <span className="font-mono">[1, 2, 3]</span>.
        </p>
      </div>

      <div>
        <label className="block text-[11px] font-medium text-neutral-400 mb-1">
          Variable para cada elemento
        </label>
        <input
          type="text"
          value={node.params.itemVariable || ""}
          onChange={(e) => updateParam("itemVariable", e.target.value)}
          placeholder="item"
          className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-neutral-200 font-mono focus:outline-none focus:border-blue-500"
        />
      </div>

      <div>
        <label className="block text-[11px] font-medium text-neutral-400 mb-1">
          Límite máximo de iteraciones
        </label>
        <input
          type="number"
          value={node.params.maxIterations ?? 10}
          onChange={(e) => updateParam("maxIterations", Number(e.target.value))}
          placeholder="10"
          className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-blue-500"
        />
      </div>

      <div>
        <label className="flex items-center space-x-1.5 text-[11px] font-medium text-neutral-400 mb-1">
          <span className="w-2 h-2 rounded-full bg-rose-500" />
          <span>Inicio del cuerpo del bucle</span>
          <span className="text-rose-400">*</span>
        </label>
        <select
          value={node.params.bodyEntryNodeId || ""}
          onChange={(e) =>
            setBranchTarget(node.id, "body", e.target.value || undefined)
          }
          className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-blue-500"
        >
          <option value="">— Sin conectar —</option>
          {availableNodes.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.description || candidate.id} ({candidate.type})
            </option>
          ))}
        </select>
        <p className="mt-1 text-[10px] text-neutral-500 leading-relaxed">
          El cuerpo se ejecuta una vez por elemento y termina en la
          continuación del bucle.
        </p>
      </div>
    </div>
  );
}
