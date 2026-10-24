"use client";

import React from "react";
import type { ExtractNode } from "@rpa/dsl";
import type { NodeInspectorProps } from "../types";
import { Field, Select, TextInput } from "@/components/ui/primitives";

export function ExtractInspectorForm({
  node,
  updateParam,
}: NodeInspectorProps<ExtractNode>) {
  return (
    <div className="space-y-4">
      <Field
        label="Guardar en variable"
        htmlFor="extract-variable"
        hint="Nombre con el que podrás referenciar el dato extraído."
      >
        <TextInput
          id="extract-variable"
          type="text"
          value={node.params.variable || ""}
          onChange={(e) => updateParam("variable", e.target.value)}
          placeholder="ej. resultado"
          className="font-mono"
        />
      </Field>

      <Field
        label="Tipo de extracción"
        htmlFor="extract-type"
        hint="Determina qué propiedad del elemento se captura."
      >
        <Select
          id="extract-type"
          value={node.params.extractType || "text"}
          onChange={(e) => updateParam("extractType", e.target.value)}
        >
          <option value="text">Texto visible (innerText)</option>
          <option value="attribute">Atributo HTML</option>
          <option value="html">HTML interno</option>
        </Select>
      </Field>

      {node.params.extractType === "attribute" && (
        <Field
          label="Nombre del atributo"
          htmlFor="extract-attribute"
          hint="Por ejemplo href, src, data-id o aria-label."
        >
          <TextInput
            id="extract-attribute"
            type="text"
            value={node.params.attributeName || ""}
            onChange={(e) => updateParam("attributeName", e.target.value)}
            placeholder="ej. href, src, data-id"
            className="font-mono"
          />
        </Field>
      )}
    </div>
  );
}
