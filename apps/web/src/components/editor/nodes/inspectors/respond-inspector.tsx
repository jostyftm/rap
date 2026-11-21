"use client";

import React from "react";
import type { KeyValuePair, RespondNode, RespondType } from "@rpa/dsl";
import type { NodeInspectorProps } from "../types";
import { useRecipeStore } from "@/stores/use-recipe-store";
import { Field, Select, TextInput } from "@/components/ui/primitives";
import { VariablePicker } from "../../variable-picker";
import { KeyValueList } from "./key-value-list";

const RESPONSE_TYPE_OPTIONS: Array<{ value: RespondType; label: string }> = [
  { value: "json", label: "JSON (application/json)" },
  { value: "text", label: "Texto plano (text/plain)" },
  { value: "html", label: "HTML (text/html)" },
  { value: "xml", label: "XML (application/xml)" },
  { value: "binary", label: "Binario / Archivo (Base64)" },
  { value: "redirect", label: "Redirección HTTP (301/302)" },
  { value: "empty", label: "Sin cuerpo (204 No Content)" },
];

const STATUS_PRESETS = [200, 201, 204, 302, 400, 404, 500];

export function RespondInspectorForm({
  node,
  updateParam,
}: NodeInspectorProps<RespondNode>) {
  const editorMode = useRecipeStore((s) => s.editorMode);
  const viewingVersion = useRecipeStore((s) => s.viewingVersion);
  const isReadOnly = editorMode === "published" || viewingVersion !== null;

  const responseType: RespondType = node.params.responseType || "json";
  const defaultCode =
    responseType === "empty" ? 204 : responseType === "redirect" ? 302 : 200;
  const statusCode = node.params.statusCode ?? defaultCode;
  const headers: KeyValuePair[] = node.params.headers || [];
  const terminateFlow = node.params.terminateFlow !== false;

  const handleTypeChange = (nextType: RespondType) => {
    updateParam("responseType", nextType);
    if (nextType === "empty" && (!node.params.statusCode || node.params.statusCode === 200)) {
      updateParam("statusCode", 204);
    } else if (
      nextType === "redirect" &&
      (!node.params.statusCode || node.params.statusCode === 200)
    ) {
      updateParam("statusCode", 302);
    } else if (
      nextType !== "empty" &&
      nextType !== "redirect" &&
      (node.params.statusCode === 204 || node.params.statusCode === 302)
    ) {
      updateParam("statusCode", 200);
    }
  };

  return (
    <div className="space-y-4">
      <Field label="Tipo de retorno" htmlFor={`respond-type-${node.id}`}>
        <Select
          id={`respond-type-${node.id}`}
          value={responseType}
          disabled={isReadOnly}
          onChange={(e) => handleTypeChange(e.target.value as RespondType)}
        >
          {RESPONSE_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Código HTTP de respuesta"
        htmlFor={`respond-status-${node.id}`}
        hint="Códigos comunes: 200 OK, 201 Creado, 204 Vacío, 302 Redirect, 400 Error cliente."
      >
        <div className="space-y-2">
          <TextInput
            id={`respond-status-${node.id}`}
            type="number"
            min={100}
            max={599}
            value={statusCode}
            disabled={isReadOnly}
            onChange={(e) => updateParam("statusCode", Number(e.target.value))}
            className="font-mono"
          />
          {!isReadOnly && (
            <div className="flex flex-wrap gap-1">
              {STATUS_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => updateParam("statusCode", preset)}
                  className={`rounded-control border px-2 py-0.5 font-mono text-[10.5px] transition-colors ${
                    statusCode === preset
                      ? "border-accent bg-accent/15 text-accent-text"
                      : "border-line bg-card text-fg-muted hover:text-fg"
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          )}
        </div>
      </Field>

      {responseType === "redirect" ? (
        <Field
          label="URL de redirección (Location)"
          htmlFor={`respond-redirect-${node.id}`}
          action={
            !isReadOnly ? (
              <VariablePicker
                onSelect={(token) =>
                  updateParam("redirectUrl", `${node.params.redirectUrl || ""}${token}`)
                }
              />
            ) : undefined
          }
        >
          <TextInput
            id={`respond-redirect-${node.id}`}
            type="text"
            value={node.params.redirectUrl || ""}
            disabled={isReadOnly}
            onChange={(e) => updateParam("redirectUrl", e.target.value)}
            placeholder="https://example.com/gracias"
            className="font-mono"
          />
        </Field>
      ) : responseType === "empty" ? (
        <div className="rounded-card border border-line bg-card px-3.5 py-2.5 text-[11.5px] text-fg-muted">
          Se responderá únicamente con el código HTTP y las cabeceras configuradas, sin cuerpo.
        </div>
      ) : responseType === "binary" ? (
        <div className="space-y-3">
          <Field
            label="Fuente binaria (Base64 o salida de paso)"
            htmlFor={`respond-binary-body-${node.id}`}
            hint="Acepta cadena Base64, Data URI o una referencia directa como {{steps.http_1.output.data}}."
            action={
              !isReadOnly ? (
                <VariablePicker
                  onSelect={(token) =>
                    updateParam("body", `${node.params.body || ""}${token}`)
                  }
                />
              ) : undefined
            }
          >
            <textarea
              id={`respond-binary-body-${node.id}`}
              rows={3}
              value={node.params.body || ""}
              disabled={isReadOnly}
              onChange={(e) => updateParam("body", e.target.value)}
              placeholder="{{steps.http_1.output.data}}"
              className="w-full rounded-field border border-line bg-input px-3 py-2 font-mono text-[12px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none disabled:opacity-50"
            />
          </Field>

          <div className="grid grid-cols-2 gap-2.5">
            <Field label="MIME / Content-Type" htmlFor={`respond-ct-${node.id}`}>
              <TextInput
                id={`respond-ct-${node.id}`}
                type="text"
                value={node.params.contentType || ""}
                disabled={isReadOnly}
                onChange={(e) => updateParam("contentType", e.target.value)}
                placeholder="application/pdf"
                className="font-mono"
              />
            </Field>
            <Field label="Nombre de archivo" htmlFor={`respond-filename-${node.id}`}>
              <TextInput
                id={`respond-filename-${node.id}`}
                type="text"
                value={node.params.filename || ""}
                disabled={isReadOnly}
                onChange={(e) => updateParam("filename", e.target.value)}
                placeholder="reporte.pdf"
                className="font-mono"
              />
            </Field>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <Field
            label={`Contenido de la respuesta (${responseType.toUpperCase()})`}
            htmlFor={`respond-body-${node.id}`}
            hint={
              responseType === "json"
                ? "Puedes escribir JSON con {{tokens}} o referenciar un objeto directo con {{steps.http_1.output.data}}."
                : "Soporta interpolación de variables y salidas mediante {{token}}."
            }
            action={
              !isReadOnly ? (
                <VariablePicker
                  onSelect={(token) =>
                    updateParam("body", `${node.params.body || ""}${token}`)
                  }
                />
              ) : undefined
            }
          >
            <textarea
              id={`respond-body-${node.id}`}
              rows={6}
              value={node.params.body || ""}
              disabled={isReadOnly}
              onChange={(e) => updateParam("body", e.target.value)}
              placeholder={
                responseType === "json"
                  ? '{"ok": true, "data": {{variables.resultado}}}'
                  : responseType === "html"
                    ? "<h1>Proceso completado</h1>"
                    : responseType === "xml"
                      ? "<response><ok>true</ok></response>"
                      : "Proceso completado"
              }
              className="w-full rounded-field border border-line bg-input px-3.5 py-2.5 font-mono text-[12px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none disabled:opacity-50"
            />
          </Field>

          <Field
            label="Content-Type personalizado (opcional)"
            htmlFor={`respond-ct-${node.id}`}
          >
            <TextInput
              id={`respond-ct-${node.id}`}
              type="text"
              value={node.params.contentType || ""}
              disabled={isReadOnly}
              onChange={(e) => updateParam("contentType", e.target.value)}
              placeholder={
                responseType === "json"
                  ? "application/json; charset=utf-8"
                  : responseType === "html"
                    ? "text/html; charset=utf-8"
                    : responseType === "xml"
                      ? "application/xml; charset=utf-8"
                      : "text/plain; charset=utf-8"
              }
              className="font-mono"
            />
          </Field>
        </div>
      )}

      <Field label="Headers HTTP de respuesta">
        <KeyValueList
          items={headers}
          onChange={(next) => updateParam("headers", next)}
          disabled={isReadOnly}
          keyPlaceholder="Header (ej. X-Request-Id)"
          valuePlaceholder="Valor"
          addLabel="Añadir header"
          emptyText="Sin cabeceras personalizadas adicionales."
        />
      </Field>

      <label className="flex items-start gap-2.5 rounded-card border border-line bg-card px-3 py-2.5 text-[12px] text-fg">
        <input
          type="checkbox"
          checked={terminateFlow}
          disabled={isReadOnly}
          onChange={(e) => updateParam("terminateFlow", e.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 accent-accent"
        />
        <span>
          <span className="block font-medium">Finalizar automatización al responder</span>
          <span className="mt-0.5 block text-[11px] text-fg-subtle">
            Desactívalo si deseas entregar la respuesta al cliente de inmediato y seguir ejecutando pasos en segundo plano.
          </span>
        </span>
      </label>
    </div>
  );
}
