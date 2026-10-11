"use client";

import React from "react";
import type { ScreenshotNode } from "@rpa/dsl";
import type { NodeInspectorProps } from "../types";

export function ScreenshotInspectorForm({
  node,
  updateParam,
}: NodeInspectorProps<ScreenshotNode>) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-neutral-400 mb-1">
        Nombre de la captura
      </label>
      <input
        type="text"
        value={node.params.name || ""}
        onChange={(e) => updateParam("name", e.target.value)}
        placeholder="ej. pantalla_principal"
        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-blue-500 font-mono"
      />
    </div>
  );
}

export function ScreenshotAdvancedForm({
  node,
  updateParam,
}: NodeInspectorProps<ScreenshotNode>) {
  return (
    <div className="flex items-center space-x-2 pt-1">
      <input
        type="checkbox"
        id="fullPageShot"
        checked={node.params.fullPage ?? true}
        onChange={(e) => updateParam("fullPage", e.target.checked)}
        className="rounded bg-neutral-950 border-neutral-800 text-blue-600 focus:ring-0"
      />
      <label htmlFor="fullPageShot" className="text-xs text-neutral-300 cursor-pointer">
        Captura de página completa (Full page)
      </label>
    </div>
  );
}
