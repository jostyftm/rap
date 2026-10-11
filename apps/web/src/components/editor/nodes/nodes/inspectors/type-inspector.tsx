"use client";

import React from "react";
import type { TypeNode } from "@rpa/dsl";
import type { NodeInspectorProps } from "../types";

export function TypeInspectorForm({
  node,
  updateParam,
}: NodeInspectorProps<TypeNode>) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-neutral-400 mb-1">
        Texto a escribir
      </label>
      <input
        type="text"
        value={node.params.text || ""}
        onChange={(e) => updateParam("text", e.target.value)}
        placeholder="Texto para el campo..."
        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-blue-500"
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
