"use client";

import React from "react";
import { MousePointerClick } from "lucide-react";
import type { ClickNode } from "@rpa/dsl";
import type { NodeInspectorProps } from "../types";
import { Field, Select } from "@/components/ui/primitives";

export function ClickInspectorForm() {
  return (
    <div className="flex items-start gap-2.5 rounded-card border border-line bg-card px-4 py-3 text-[11.5px] leading-relaxed text-fg-muted">
      <MousePointerClick className="mt-0.5 h-4 w-4 shrink-0 text-fg-subtle" />
      <p>
        Este paso hace clic en el elemento apuntado por el localizador. Puedes ajustar el botón
        del ratón en <span className="font-medium text-fg">Ajustes → Opciones avanzadas</span>.
      </p>
    </div>
  );
}

export function ClickAdvancedForm({
  node,
  updateParam,
}: NodeInspectorProps<ClickNode>) {
  return (
    <Field
      label="Botón del ratón"
      htmlFor="click-button"
      hint="El clic central y el derecho pueden abrir menús contextuales."
    >
      <Select
        id="click-button"
        value={node.params.button || "left"}
        onChange={(e) => updateParam("button", e.target.value)}
      >
        <option value="left">Izquierdo (principal)</option>
        <option value="right">Derecho (contextual)</option>
        <option value="middle">Central</option>
      </Select>
    </Field>
  );
}
