"use client";

import React from "react";
import type { ScreenshotNode } from "@rpa/dsl";
import type { NodeInspectorProps } from "../types";
import { Field, TextInput } from "@/components/ui/primitives";

export function ScreenshotInspectorForm({
  node,
  updateParam,
}: NodeInspectorProps<ScreenshotNode>) {
  return (
    <Field
      label="Nombre de la captura"
      htmlFor="screenshot-name"
      hint="Se usa para identificar el archivo generado por el runner."
    >
      <TextInput
        id="screenshot-name"
        type="text"
        value={node.params.name || ""}
        onChange={(e) => updateParam("name", e.target.value)}
        placeholder="ej. pantalla_principal"
        className="font-mono"
      />
    </Field>
  );
}

export function ScreenshotAdvancedForm({
  node,
  updateParam,
}: NodeInspectorProps<ScreenshotNode>) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-control border border-line bg-card px-3 py-2.5 transition-colors hover:bg-hover">
      <input
        type="checkbox"
        id="fullPageShot"
        checked={node.params.fullPage ?? true}
        onChange={(e) => updateParam("fullPage", e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-line accent-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      />
      <span className="text-[12px] text-fg">
        Captura de página completa
        <span className="mt-0.5 block text-[11px] leading-relaxed text-fg-subtle">
          Incluye todo el alto del documento, no solo el viewport visible.
        </span>
      </span>
    </label>
  );
}
