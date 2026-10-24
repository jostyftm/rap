"use client";

import React, { useId } from "react";
import { AlertTriangle } from "lucide-react";
import type { RecipeNode, RetryBackoff, RetryPolicy } from "@rpa/dsl";
import { Field, Select, TextInput } from "@/components/ui/primitives";

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  delayMs: 1000,
  backoff: "exponential",
};

const DESTRUCTIVE_NODE_TYPES = new Set<RecipeNode["type"]>([
  "click",
  "type",
  "select",
]);

interface RetryPolicyFieldsProps {
  node: RecipeNode;
  updateNode: (updates: Partial<RecipeNode>) => void;
  variant?: "compact" | "default";
}

export function RetryPolicyFields({
  node,
  updateNode,
}: RetryPolicyFieldsProps) {
  const id = useId();

  if (node.onError !== "retry") {
    return null;
  }

  const policy: RetryPolicy = node.retry ?? DEFAULT_RETRY_POLICY;

  const update = (patch: Partial<RetryPolicy>) => {
    updateNode({
      retry: { ...policy, ...patch },
    } as Partial<RecipeNode>);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Intentos máx." htmlFor={`${id}-attempts`} hint="Entre 1 y 10.">
          <TextInput
            id={`${id}-attempts`}
            type="number"
            min={1}
            max={10}
            value={policy.maxAttempts}
            onChange={(e) => update({ maxAttempts: Number(e.target.value) })}
            className="font-mono"
          />
        </Field>
        <Field label="Espera base" htmlFor={`${id}-delay`} hint="Milisegundos entre intentos.">
          <div className="relative">
            <TextInput
              id={`${id}-delay`}
              type="number"
              min={0}
              max={60000}
              step={100}
              value={policy.delayMs}
              onChange={(e) => update({ delayMs: Number(e.target.value) })}
              className="pr-10 font-mono"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-mono text-fg-subtle">
              ms
            </span>
          </div>
        </Field>
      </div>

      <Field label="Tipo de espera" htmlFor={`${id}-backoff`}>
        <Select
          id={`${id}-backoff`}
          value={policy.backoff}
          onChange={(e) => update({ backoff: e.target.value as RetryBackoff })}
        >
          <option value="exponential">Exponencial (1x, 2x, 4x…)</option>
          <option value="fixed">Fija</option>
        </Select>
      </Field>

      {DESTRUCTIVE_NODE_TYPES.has(node.type) && (
        <div className="flex items-start gap-2 rounded-control border border-warning/25 bg-warning-soft px-3 py-2.5 text-[11px] leading-relaxed text-warning-text">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>
            Reintentar acciones destructivas (clic, escritura o selección) puede duplicar efectos.
            Asegúrate de que la acción sea idempotente.
          </p>
        </div>
      )}
    </div>
  );
}
