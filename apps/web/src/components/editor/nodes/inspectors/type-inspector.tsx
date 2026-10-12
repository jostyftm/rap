"use client";

import React from "react";
import type { TypeNode } from "@rpa/dsl";
import type { NodeInspectorProps } from "../types";

import { VariablePicker } from "../../variable-picker";

export function TypeInspectorForm({
  node,
  updateParam,
}: NodeInspectorProps<TypeNode>) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[11px] font-medium text-zinc-400">
          Texto a escribir
        </label>
        <VariablePicker
          onSelect={(token) =>
            updateParam("text", `${node.params.text || ""}${token}`)
          }
        />
      </div>
      <input
        type="text"
        value={node.params.text || ""}
        onChange={(e) => updateParam("text", e.target.value)}
        placeholder="Texto o variable ej. {{steps.node_1.output}}"
        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-zinc-600 transition-colors"
      />
    </div>
  );
}

export function TypeAdvancedForm({
  node,
  updateParam,
}: NodeInspectorProps<TypeNode>) {
  return (
    <div className="flex items-center space-x-2 pt-1">
      <input
        type="checkbox"
        id="clearInput"
        checked={node.params.clear ?? true}
        onChange={(e) => updateParam("clear", e.target.checked)}
        className="rounded bg-neutral-950 border-neutral-800 text-blue-600 focus:ring-0"
      />
      <label htmlFor="clearInput" className="text-xs text-neutral-300 cursor-pointer">
        Limpiar campo antes de escribir
      </label>
    </div>
  );
}
