"use client";

import React from "react";
import type { SetVariableNode } from "@rpa/dsl";
import type { NodeInspectorProps } from "../types";

export function SetVariableInspectorForm({
  node,
  updateParam,
}: NodeInspectorProps<SetVariableNode>) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-[11px] font-medium text-neutral-400 mb-1">
          Nombre de variable
        </label>
        <input
          type="text"
          value={node.params.name || ""}
          onChange={(e) => updateParam("name", e.target.value)}
          placeholder="ej. contador, usuarioId"
          className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-blue-500 font-mono"
        />
      </div>
      <div>
        <label className="block text-[11px] font-medium text-neutral-400 mb-1">
          Valor o expresión JS
        </label>
        <input
          type="text"
          value={node.params.expression || ""}
          onChange={(e) => updateParam("expression", e.target.value)}
          placeholder="'admin' o contador + 1"
          className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-neutral-200 font-mono focus:outline-none focus:border-blue-500"
        />
      </div>
    </div>
  );
}
