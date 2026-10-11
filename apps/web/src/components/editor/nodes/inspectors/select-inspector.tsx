"use client";

import React from "react";
import type { SelectNode } from "@rpa/dsl";
import type { NodeInspectorProps } from "../types";

export function SelectInspectorForm({
  node,
  updateParam,
}: NodeInspectorProps<SelectNode>) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-neutral-400 mb-1">
        Valor de la opción
      </label>
      <input
        type="text"
        value={node.params.value || ""}
        onChange={(e) => updateParam("value", e.target.value)}
        placeholder="Valor o texto del option..."
        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-blue-500"
      />
    </div>
  );
}
