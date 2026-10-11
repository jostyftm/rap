"use client";

import React from "react";
import type { ExtractNode } from "@rpa/dsl";
import type { NodeInspectorProps } from "../types";

export function ExtractInspectorForm({
  node,
  updateParam,
}: NodeInspectorProps<ExtractNode>) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-[11px] font-medium text-neutral-400 mb-1">
          Guardar en Variable
        </label>
        <input
          type="text"
          value={node.params.variable || ""}
          onChange={(e) => updateParam("variable", e.target.value)}
          placeholder="ej. resultado"
          className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-blue-500 font-mono"
        />
      </div>

      <div>
        <label className="block text-[11px] font-medium text-neutral-400 mb-1">
          Tipo de Extracción
        </label>
        <select
          value={node.params.extractType || "text"}
          onChange={(e) => updateParam("extractType", e.target.value)}
          className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-blue-500"
        >
          <option value="text">Texto visible (innerText)</option>
          <option value="attribute">Atributo HTML</option>
          <option value="html">HTML interno</option>
        </select>
      </div>

      {node.params.extractType === "attribute" && (
        <div>
          <label className="block text-[11px] font-medium text-neutral-400 mb-1">
            Nombre del Atributo
          </label>
          <input
            type="text"
            value={node.params.attributeName || ""}
            onChange={(e) => updateParam("attributeName", e.target.value)}
            placeholder="ej. href, src, data-id"
            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-blue-500 font-mono"
          />
        </div>
      )}
    </div>
  );
}
