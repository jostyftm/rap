"use client";

import React from "react";
import type { SetVariableNode } from "@rpa/dsl";
import type { NodeInspectorProps } from "../types";

import { VariablePicker } from "../../variable-picker";

export function SetVariableInspectorForm({
  node,
  updateParam,
}: NodeInspectorProps<SetVariableNode>) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-[11px] font-medium text-zinc-400 mb-1">
          Nombre de variable
        </label>
        <input
          type="text"
          value={node.params.name || ""}
          onChange={(e) => updateParam("name", e.target.value)}
          placeholder="ej. contador, precio"
          className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-zinc-600 transition-colors"
        />
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px] font-medium text-zinc-400">
            Valor o expresión (JS / Salida)
          </label>
          <VariablePicker
            onSelect={(token) =>
              updateParam("expression", `${node.params.expression || ""}${token}`)
            }
          />
        </div>
        <input
          type="text"
          value={node.params.expression || ""}
          onChange={(e) => updateParam("expression", e.target.value)}
          placeholder="'admin', 10, o {{steps.extract_1.output}}"
          className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-zinc-600 transition-colors"
        />
      </div>
    </div>
  );
}
