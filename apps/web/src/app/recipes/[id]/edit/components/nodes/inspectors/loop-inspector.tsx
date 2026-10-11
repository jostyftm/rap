"use client";

import React from "react";
import type { LoopNode } from "@rpa/dsl";
import type { NodeInspectorProps } from "../types";

export function LoopInspectorForm({
  node,
  updateParam,
}: NodeInspectorProps<LoopNode>) {
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
    </div>
  );
}
