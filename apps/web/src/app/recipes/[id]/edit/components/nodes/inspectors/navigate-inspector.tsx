"use client";

import React from "react";
import type { NavigateNode } from "@rpa/dsl";
import type { NodeInspectorProps } from "../types";

export function NavigateInspectorForm({
  node,
  updateParam,
}: NodeInspectorProps<NavigateNode>) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-neutral-400 mb-1">
        URL de destino
      </label>
      <input
        type="text"
        value={node.params.url || ""}
        onChange={(e) => updateParam("url", e.target.value)}
        placeholder="https://ejemplo.com"
        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-blue-500 font-mono"
      />
    </div>
  );
}

export function NavigateAdvancedForm({
  node,
  updateParam,
}: NodeInspectorProps<NavigateNode>) {
  return (
    <div>
      <label className="block text-[11px] text-neutral-400 mb-1">Esperar hasta</label>
      <select
        value={node.params.waitUntil || "domcontentloaded"}
        onChange={(e) => updateParam("waitUntil", e.target.value)}
        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2 text-xs text-neutral-200 focus:outline-none focus:border-blue-500"
      >
        <option value="domcontentloaded">DOM Content Loaded</option>
        <option value="load">Página Completa (load)</option>
        <option value="networkidle">Red Inactiva (networkidle)</option>
      </select>
    </div>
  );
}
