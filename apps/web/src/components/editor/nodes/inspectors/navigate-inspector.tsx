"use client";

import React from "react";
import type { NavigateNode } from "@rpa/dsl";
import type { NodeInspectorProps } from "../types";
import { ExpressionField } from "@/components/editor/detail/expression-field";
import { Field, Select } from "@/components/ui/primitives";

export function NavigateInspectorForm({
  node,
  updateParam,
}: NodeInspectorProps<NavigateNode>) {
  return (
    <ExpressionField
      label="URL de destino"
      value={node.params.url || ""}
      onChange={(value) => updateParam("url", value)}
      placeholder="https://ejemplo.com o {{steps.login.output.redirectUrl}}"
      nodeId={node.id}
      description="Dirección web a la que navegará el navegador Playwright."
    />
  );
}

export function NavigateAdvancedForm({
  node,
  updateParam,
}: NodeInspectorProps<NavigateNode>) {
  return (
    <Field
      label="Esperar hasta"
      htmlFor="navigate-wait-until"
      hint="Condición de carga que debe cumplirse antes de continuar."
    >
      <Select
        id="navigate-wait-until"
        value={node.params.waitUntil || "domcontentloaded"}
        onChange={(e) => updateParam("waitUntil", e.target.value)}
      >
        <option value="domcontentloaded">DOM Content Loaded</option>
        <option value="load">Página completa (load)</option>
        <option value="networkidle">Red inactiva (networkidle)</option>
      </Select>
    </Field>
  );
}
