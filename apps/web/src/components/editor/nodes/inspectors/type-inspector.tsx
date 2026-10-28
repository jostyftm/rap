"use client";

import React from "react";
import type { TypeNode } from "@rpa/dsl";
import type { NodeInspectorProps } from "../types";
import { ExpressionField } from "@/components/editor/detail/expression-field";

export function TypeInspectorForm({
  node,
  updateParam,
}: NodeInspectorProps<TypeNode>) {
  return (
    <div className="space-y-3">
      <ExpressionField
        label="Texto a escribir"
        value={node.params.text || ""}
        onChange={(value) => updateParam("text", value)}
        placeholder="Texto o variable, ej. {{webhook.body.email}}"
        nodeId={node.id}
        description="También puedes arrastrar una variable desde el panel de entrada."
      />

      <label className="flex cursor-pointer items-start gap-2.5 rounded-control border border-line bg-card px-3 py-2.5 transition-colors hover:bg-hover">
        <input
          type="checkbox"
          id="pressEnterInput"
          checked={node.params.pressEnter ?? false}
          onChange={(e) => updateParam("pressEnter", e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-line accent-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        />
        <span className="text-[12px] text-fg">
          Presionar tecla Enter al finalizar
          <span className="mt-0.5 block text-[11px] leading-relaxed text-fg-subtle">
            Envía la tecla Enter inmediatamente después de ingresar el texto (útil para búsquedas y envíos).
          </span>
        </span>
      </label>
    </div>
  );
}

export function TypeAdvancedForm({
  node,
  updateParam,
}: NodeInspectorProps<TypeNode>) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-control border border-line bg-card px-3 py-2.5 transition-colors hover:bg-hover">
      <input
        type="checkbox"
        id="clearInput"
        checked={node.params.clear ?? true}
        onChange={(e) => updateParam("clear", e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-line accent-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      />
      <span className="text-[12px] text-fg">
        Limpiar el campo antes de escribir
        <span className="mt-0.5 block text-[11px] leading-relaxed text-fg-subtle">
          Evita concatenar el nuevo texto con un valor previo del input.
        </span>
      </span>
    </label>
  );
}
