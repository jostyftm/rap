"use client";

import React from "react";
import type { SelectNode } from "@rpa/dsl";
import type { NodeInspectorProps } from "../types";
import { Field, TextInput } from "@/components/ui/primitives";

export function SelectInspectorForm({
  node,
  updateParam,
}: NodeInspectorProps<SelectNode>) {
  return (
    <Field
      label="Valor de la opción"
      htmlFor="select-option-value"
      hint="Valor del atributo value o texto visible de la opción."
    >
      <TextInput
        id="select-option-value"
        type="text"
        value={node.params.value || ""}
        onChange={(e) => updateParam("value", e.target.value)}
        placeholder="Valor o texto del option…"
        className="font-mono"
      />
    </Field>
  );
}
