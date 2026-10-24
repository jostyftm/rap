"use client";

import React from "react";
import type { LoopNode } from "@rpa/dsl";
import type { NodeInspectorProps } from "../types";
import { useRecipeStore } from "@/stores/use-recipe-store";
import { Field, Select, TextInput } from "@/components/ui/primitives";
import { Repeat2 } from "lucide-react";

export function LoopInspectorForm({
  node,
  updateParam,
}: NodeInspectorProps<LoopNode>) {
  const definition = useRecipeStore((s) => s.definition);
  const setBranchTarget = useRecipeStore((s) => s.setBranchTarget);

  const availableNodes = Object.values(definition.nodes)
    .filter((candidate) => candidate.id !== node.id)
    .sort((a, b) =>
      (a.description || a.id).localeCompare(b.description || b.id, "es")
    );

  return (
    <div className="space-y-4">
      <Field
        label="Colección a iterar"
        htmlFor="loop-collection"
        hint="Acepta una variable (variables.items), una expresión JSONata o un literal como [1, 2, 3]."
      >
        <TextInput
          id="loop-collection"
          type="text"
          value={node.params.collectionExpression || ""}
          onChange={(e) => updateParam("collectionExpression", e.target.value)}
          placeholder="variables.items o [1, 2, 3]"
          className="font-mono"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Variable del elemento"
          htmlFor="loop-item-variable"
          hint="Nombre disponible dentro del cuerpo."
        >
          <TextInput
            id="loop-item-variable"
            type="text"
            value={node.params.itemVariable || ""}
            onChange={(e) => updateParam("itemVariable", e.target.value)}
            placeholder="item"
            className="font-mono"
          />
        </Field>

        <Field
          label="Máx. iteraciones"
          htmlFor="loop-max-iterations"
          hint="Freno de seguridad."
        >
          <TextInput
            id="loop-max-iterations"
            type="number"
            value={node.params.maxIterations ?? 10}
            onChange={(e) => updateParam("maxIterations", Number(e.target.value))}
            placeholder="10"
            className="font-mono"
          />
        </Field>
      </div>

      <Field
        label={
          <span className="flex items-center gap-1.5">
            Inicio del cuerpo del bucle
            <span className="text-danger-text" aria-hidden="true">
              *
            </span>
          </span>
        }
        htmlFor="loop-body-entry"
        hint="El cuerpo se ejecuta una vez por elemento y termina en la continuación del bucle."
      >
        <Select
          id="loop-body-entry"
          value={node.params.bodyEntryNodeId || ""}
          onChange={(e) =>
            setBranchTarget(node.id, "body", e.target.value || undefined)
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

      <div className="flex items-start gap-2.5 rounded-card border border-violet/25 bg-violet-soft px-4 py-3 text-[11.5px] leading-relaxed text-violet-text">
        <Repeat2 className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Cada iteración expone el elemento actual como{" "}
          <code className="font-mono">
            {`{{steps.${node.id}.output.${node.params.itemVariable || "item"}}}`}
          </code>{" "}
          y el índice como{" "}
          <code className="font-mono">{`{{steps.${node.id}.output.index}}`}</code>.
        </p>
      </div>
    </div>
  );
}
