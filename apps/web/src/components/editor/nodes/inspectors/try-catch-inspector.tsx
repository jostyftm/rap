"use client";

import React from "react";
import type { TryCatchNode } from "@rpa/dsl";
import type { NodeInspectorProps } from "../types";
import { useRecipeStore } from "@/stores/use-recipe-store";
import { Field, Select, TextInput } from "@/components/ui/primitives";
import { ShieldAlert } from "lucide-react";

type BranchHandle = "try" | "catch" | "finally";

const BRANCH_OPTIONS: Array<{
  handle: BranchHandle;
  label: string;
  paramKey: "tryEntryNodeId" | "catchEntryNodeId" | "finallyEntryNodeId";
  required: boolean;
  dotClass: string;
}> = [
  {
    handle: "try",
    label: "Bloque try (se ejecuta primero)",
    paramKey: "tryEntryNodeId",
    required: true,
    dotClass: "bg-accent",
  },
  {
    handle: "catch",
    label: "Bloque catch (si hay error)",
    paramKey: "catchEntryNodeId",
    required: true,
    dotClass: "bg-danger",
  },
  {
    handle: "finally",
    label: "Bloque finally (siempre, salvo parada)",
    paramKey: "finallyEntryNodeId",
    required: false,
    dotClass: "bg-violet",
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
    <div className="space-y-4">
      <p className="text-[11.5px] leading-relaxed text-fg-muted">
        Cada rama se ejecuta hasta la continuación del propio bloque try/catch.
        Conecta los bloques desde el canvas o selecciónalos aquí.
      </p>

      {BRANCH_OPTIONS.map((branch) => (
        <Field
          key={branch.handle}
          label={
            <span className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${branch.dotClass}`} aria-hidden="true" />
              {branch.label}
              {branch.required && (
                <span className="text-danger-text" aria-hidden="true">
                  *
                </span>
              )}
            </span>
          }
          htmlFor={`try-catch-${branch.handle}`}
        >
          <Select
            id={`try-catch-${branch.handle}`}
            value={node.params[branch.paramKey] || ""}
            onChange={(e) =>
              setBranchTarget(node.id, branch.handle, e.target.value || undefined)
            }
          >
            <option value="">— Sin conectar —</option>
            {availableNodes.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.description || candidate.id} ({candidate.type})
              </option>
            ))}
          </Select>
        </Field>
      ))}

      <Field
        label="Variable donde guardar el error"
        htmlFor="try-catch-error-variable"
        hint="Disponible en catch y finally con el detalle del fallo."
      >
        <TextInput
          id="try-catch-error-variable"
          type="text"
          value={node.params.errorVariable ?? "error"}
          onChange={(e) => updateParam("errorVariable", e.target.value)}
          placeholder="error"
          className="font-mono"
        />
      </Field>

      <label className="flex cursor-pointer items-start gap-2.5 rounded-control border border-line bg-card px-3 py-2.5 transition-colors hover:bg-hover">
        <input
          type="checkbox"
          checked={node.params.rethrow === true}
          onChange={(e) => updateParam("rethrow", e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-line accent-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        />
        <span className="text-[12px] text-fg">
          Relanzar el error después de ejecutar catch y finally
          <span className="mt-0.5 block text-[11px] leading-relaxed text-fg-subtle">
            Si está desactivado, el flujo continúa tras manejar el error.
          </span>
        </span>
      </label>

      <div className="flex items-start gap-2.5 rounded-card border border-warning/25 bg-warning-soft px-4 py-3 text-[11.5px] leading-relaxed text-warning-text">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          El error capturado no detiene el flujo salvo que actives el relanzamiento.
          Úsalo para limpiar recursos o registrar fallos sin romper la receta.
        </p>
      </div>
    </div>
  );
}
