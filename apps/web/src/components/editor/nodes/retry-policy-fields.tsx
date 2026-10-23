"use client";

import React from "react";
import type { RecipeNode, RetryBackoff, RetryPolicy } from "@rpa/dsl";

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
  variant = "compact",
}: RetryPolicyFieldsProps) {
  if (node.onError !== "retry") {
    return null;
  }

  const policy: RetryPolicy = node.retry ?? DEFAULT_RETRY_POLICY;

  const update = (patch: Partial<RetryPolicy>) => {
    updateNode({
      retry: { ...policy, ...patch },
    } as Partial<RecipeNode>);
  };

  const inputClass =
    variant === "compact"
      ? "w-full bg-neutral-950 border border-neutral-800 rounded-lg p-1.5 text-xs text-neutral-200 focus:outline-none focus:border-blue-500"
      : "w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200";

  const labelClass =
    variant === "compact"
      ? "block text-[11px] text-neutral-400 mb-1"
      : "text-[11px] text-zinc-400 block mb-1";

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>Intentos máx. (1-10)</label>
          <input
            type="number"
            min={1}
            max={10}
            value={policy.maxAttempts}
            onChange={(e) => update({ maxAttempts: Number(e.target.value) })}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Espera base (ms)</label>
          <input
            type="number"
            min={0}
            max={60000}
            value={policy.delayMs}
            onChange={(e) => update({ delayMs: Number(e.target.value) })}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>Tipo de espera</label>
        <select
          value={policy.backoff}
          onChange={(e) => update({ backoff: e.target.value as RetryBackoff })}
          className={inputClass}
        >
          <option value="exponential">Exponencial (1x, 2x, 4x…)</option>
          <option value="fixed">Fija</option>
        </select>
      </div>

      {DESTRUCTIVE_NODE_TYPES.has(node.type) && (
        <p className="text-[10px] leading-relaxed text-amber-400 bg-amber-950/30 border border-amber-800/50 rounded px-2 py-1.5">
          Reintentar acciones destructivas (clic, escritura o selección) puede
          duplicar efectos. Asegúrate de que la acción sea idempotente.
        </p>
      )}
    </div>
  );
}
