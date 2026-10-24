"use client";

import React from "react";
import type { SetVariableNode } from "@rpa/dsl";
import type { NodeInspectorProps } from "../types";
import { VariablePicker } from "../../variable-picker";
import { Field, TextInput } from "@/components/ui/primitives";

export function SetVariableInspectorForm({
  node,
  updateParam,
}: NodeInspectorProps<SetVariableNode>) {
  return (
    <div className="space-y-4">
      <Field
        label="Nombre de la variable"
        htmlFor="set-variable-name"
        hint="Se usará como {{steps.ID.output.nombre}} en pasos posteriores."
      >
        <TextInput
          id="set-variable-name"
          type="text"
          value={node.params.name || ""}
          onChange={(e) => updateParam("name", e.target.value)}
          placeholder="ej. contador, precio"
          className="font-mono"
        />
      </Field>

      <Field
        label="Valor o expresión"
        htmlFor="set-variable-expression"
        hint="Admite valores literales, JSONata o variables del flujo."
        action={
          <VariablePicker
            onSelect={(token) =>
              updateParam("expression", `${node.params.expression || ""}${token}`)
            }
          />
        }
      >
        <TextInput
          id="set-variable-expression"
          type="text"
          value={node.params.expression || ""}
          onChange={(e) => updateParam("expression", e.target.value)}
          placeholder="'admin', 10, o {{steps.extract_1.output}}"
          className="font-mono"
        />
      </Field>
    </div>
  );
}
