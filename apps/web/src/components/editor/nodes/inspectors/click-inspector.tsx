"use client";

import React from "react";
import type { ClickNode } from "@rpa/dsl";
import type { NodeInspectorProps } from "../types";

export function ClickInspectorForm({
  node,
}: NodeInspectorProps<ClickNode>) {
  return (
    <div className="p-2.5 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-neutral-400">
      <p>
        Este paso realiza un clic interactivo en el elemento apuntado por el localizador.
      </p>
    </div>
  );
}

export function ClickAdvancedForm({
  node,
  updateParam,
}: NodeInspectorProps<ClickNode>) {
  return (
    <div>
      <label className="block text-[11px] text-neutral-400 mb-1">Botón de clic</label>
      <select
        value={node.params.button || "left"}
        onChange={(e) => updateParam("button", e.target.value)}
        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2 text-xs text-neutral-200 focus:outline-none focus:border-blue-500"
      >
        <option value="left">Izquierdo (Principal)</option>
        <option value="right">Derecho (Contextual)</option>
        <option value="middle">Central</option>
      </select>
    </div>
  );
}
