"use client";

import React from "react";
import type { TryCatchNode } from "@rpa/dsl";
import type { NodeInspectorProps } from "../types";
import { useRecipeStore } from "@/stores/use-recipe-store";

type BranchHandle = "try" | "catch" | "finally";

const BRANCH_OPTIONS: Array<{
  handle: BranchHandle;
  label: string;
  paramKey: "tryEntryNodeId" | "catchEntryNodeId" | "finallyEntryNodeId";
  required: boolean;
  color: string;
}> = [
  {
    handle: "try",
    label: "Bloque try (se ejecuta primero)",
    paramKey: "tryEntryNodeId",
    required: true,
    color: "bg-amber-400",
  },
  {
    handle: "catch",
    label: "Bloque catch (si hay error)",
    paramKey: "catchEntryNodeId",
    required: true,
    color: "bg-rose-500",
  },
  {
    handle: "finally",
    label: "Bloque finally (siempre, salvo parada)",
    paramKey: "finallyEntryNodeId",
    required: false,
    color: "bg-violet-500",
  },
];

export function TryCatchInspectorForm({
  node,
  updateParam,
}: NodeInspectorProps<TryCatchNode>) {
  const definition = useRecipeStore((s) => s.definition);
  const setBranchTarget = useRecipeStore((s) => s.setBranchTarget);

  const availableNodes = Object.values(definition.nodes)
    .filter((candidate) => candidate.id !== node.id)
    .sort((a, b) =>
      (a.description || a.id).localeCompare(b.description || b.id, "es")
    );

  return (
    <div className="space-y-3.5">
      <p className="text-[11px] text-neutral-400 leading-relaxed font-sans">
        Cada rama se ejecuta hasta la continuación del propio bloque try/catch.
        Conecta los bloques desde el canvas o selecciónalos aquí.
      </p>

      {BRANCH_OPTIONS.map((branch) => (
        <div key={branch.handle}>
          <label className="flex items-center space-x-1.5 text-[11px] font-medium text-neutral-400 mb-1">
            <span className={`w-2 h-2 rounded-full ${branch.color}`} />
            <span>{branch.label}</span>
            {branch.required && <span className="text-rose-400">*</span>}
          </label>
          <select
            value={node.params[branch.paramKey] || ""}
            onChange={(e) =>
              setBranchTarget(node.id, branch.handle, e.target.value || undefined)
            }
            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-blue-500"
          >
            <option value="">— Sin conectar —</option>
            {availableNodes.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.description || candidate.id} ({candidate.type})
              </option>
            ))}
          </select>
        </div>
      ))}

      <div>
        <label className="block text-[11px] font-medium text-neutral-400 mb-1">
          Variable donde guardar el error
        </label>
        <input
          type="text"
          value={node.params.errorVariable ?? "error"}
          onChange={(e) => updateParam("errorVariable", e.target.value)}
          placeholder="error"
          className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-neutral-200 font-mono focus:outline-none focus:border-blue-500"
        />
      </div>

      <label className="flex items-start space-x-2 p-2.5 rounded-lg bg-neutral-950 border border-neutral-800 cursor-pointer">
        <input
          type="checkbox"
          checked={node.params.rethrow === true}
          onChange={(e) => updateParam("rethrow", e.target.checked)}
          className="mt-0.5 accent-blue-500"
        />
        <span className="text-[11px] text-neutral-300 leading-relaxed font-sans">
          Relanzar el error después de ejecutar catch y finally
          <span className="block text-neutral-500">
            Si está desactivado, el flujo continúa tras manejar el error.
          </span>
        </span>
      </label>
    </div>
  );
}
