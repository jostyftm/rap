"use client";

import React from "react";
import type { ConditionNode } from "@rpa/dsl";
import type { NodeInspectorProps } from "../types";

export function ConditionInspectorForm({
  node,
  updateParam,
}: NodeInspectorProps<ConditionNode>) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-[11px] font-medium text-neutral-400 mb-1">
          Expresión booleana (JS)
        </label>
        <input
          type="text"
          value={node.params.expression || ""}
          onChange={(e) => updateParam("expression", e.target.value)}
          placeholder="variables.contador > 5"
          className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-neutral-200 font-mono focus:outline-none focus:border-blue-500"
        />
      </div>
      <div className="p-2.5 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-neutral-400 space-y-1">
        <p className="font-semibold text-neutral-300">Conexiones del Flujo:</p>
        <p className="flex items-center space-x-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
          <span>Salida verde: Camino <strong>VERDADERO (then)</strong></span>
        </p>
        <p className="flex items-center space-x-1.5">
          <span className="w-2 h-2 rounded-full bg-rose-500 inline-block"></span>
          <span>Salida roja: Camino <strong>FALSO (else)</strong></span>
        </p>
      </div>
    </div>
  );
}
