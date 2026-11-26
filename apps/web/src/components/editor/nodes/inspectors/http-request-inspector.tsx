"use client";

import React, { useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  resolveExpression,
  type HttpAuthConfig,
  type HttpBodyType,
  type HttpMultipartField,
  type HttpRequestMethod,
  type HttpRequestNode,
  type HttpResponseType,
} from "@rpa/dsl";
import type { NodeInspectorProps } from "../types";
import { useRecipeStore } from "@/stores/use-recipe-store";
import { useWebhookTestStore } from "@/stores/use-webhook-test-store";
import {
  Badge,
  Field,
  SegmentedControl,
  Select,
  TextInput,
} from "@/components/ui/primitives";
import { VariablePicker } from "../../variable-picker";
import {
  CodeMirrorTemplateEditor,
  type CodeMirrorTemplateEditorHandle,
} from "../../code-mirror-template-editor";
import { KeyValueList } from "./key-value-list";

type HttpTab = "params" | "headers" | "auth" | "body" | "response";

const HTTP_METHODS: HttpRequestMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];

const BODY_TYPE_OPTIONS: Array<{ value: HttpBodyType; label: string }> = [
  { value: "none", label: "Sin cuerpo" },
  { value: "json", label: "JSON (application/json)" },
  { value: "formUrlEncoded", label: "Form URL-Encoded" },
  { value: "multipart", label: "Multipart / Archivos" },
  { value: "raw", label: "Texto crudo / XML" },
  { value: "binary", label: "Binario (Base64)" },
];

const RESPONSE_TYPE_OPTIONS: Array<{ value: HttpResponseType; label: string }> = [
  { value: "auto", label: "Automático (según Content-Type)" },
  { value: "json", label: "JSON" },
  { value: "text", label: "Texto plano / HTML" },
  { value: "xml", label: "XML" },
  { value: "binary", label: "Binario / Archivo (Base64)" },
  { value: "headersOnly", label: "Solo cabeceras y estado" },
];

export function HttpRequestInspectorForm({
  node,
  updateParam,
}: NodeInspectorProps<HttpRequestNode>) {
  const [activeTab, setActiveTab] = useState<HttpTab>("params");
  const jsonEditorRef = useRef<CodeMirrorTemplateEditorHandle>(null);

  const definition = useRecipeStore((s) => s.definition);
  const nodeOutputs = useRecipeStore((s) => s.nodeOutputs);
  const editorMode = useRecipeStore((s) => s.editorMode);
  const viewingVersion = useRecipeStore((s) => s.viewingVersion);
  const webhookByNode = useWebhookTestStore((s) => s.byNode);
  const isReadOnly = editorMode === "published" || viewingVersion !== null;

  const webhookNode = useMemo(
    () => Object.values(definition?.nodes || {}).find((n) => n.type === "webhook"),
    [definition]
  );
  const webhookPayload = webhookNode
    ? webhookByNode[webhookNode.id]?.payload ?? null
    : null;

  const effectiveNodeOutputs = useMemo(() => {
    if (webhookNode && webhookPayload && nodeOutputs[webhookNode.id] === undefined) {
      return { ...nodeOutputs, [webhookNode.id]: webhookPayload };
    }
    return nodeOutputs;
  }, [nodeOutputs, webhookNode, webhookPayload]);

  const templateAutocompleteContext = useMemo(
    () => ({
      definition,
      currentNodeId: node.id,
      nodeOutputs: effectiveNodeOutputs,
      webhookPayload,
    }),
    [definition, node.id, effectiveNodeOutputs, webhookPayload]
  );

  const renderedJsonPreview = useMemo(() => {
    const raw = node.params.bodyJson || "";
    if (!raw.trim()) return null;
    const evalRes = resolveExpression(raw, {
      definition,
      nodeOutputs: effectiveNodeOutputs,
    });
    let isValidJson = false;
    try {
      JSON.parse(evalRes.resolvedStr);
      isValidJson = true;
    } catch {
      isValidJson = false;
    }
    return {
      resolvedStr: evalRes.resolvedStr,
      missingTokens: evalRes.missingTokens,
      isValidJson,
    };
  }, [node.params.bodyJson, definition, effectiveNodeOutputs]);

  const method = node.params.method || "GET";
  const bodyType: HttpBodyType = node.params.bodyType || "none";
  const responseType: HttpResponseType = node.params.responseType || "auto";
  const auth: HttpAuthConfig = node.params.auth || { type: "none" };
  const multipartFields: HttpMultipartField[] = node.params.bodyMultipart || [];
  const noBodyVerb = method === "GET" || method === "HEAD";

  const handleAuthTypeChange = (type: HttpAuthConfig["type"]) => {
    if (type === "none") updateParam("auth", { type: "none" });
    else if (type === "bearer") updateParam("auth", { type: "bearer", token: "" });
    else if (type === "basic")
      updateParam("auth", { type: "basic", username: "", password: "" });
    else
      updateParam("auth", {
        type: "apiKey",
        keyName: "X-API-Key",
        keyValue: "",
        in: "header",
      });
  };

  const updateMultipartField = (index: number, patch: Partial<HttpMultipartField>) => {
    const next = multipartFields.map((item, idx) =>
      idx === index ? { ...item, ...patch } : item
    );
    updateParam("bodyMultipart", next);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={`http-url-${node.id}`} className="text-[12px] font-medium text-fg">
            Verbo y URL destino
          </label>
          {!isReadOnly && (
            <VariablePicker
              onSelect={(token) =>
                updateParam("url", `${node.params.url || ""}${token}`)
              }
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="w-32 shrink-0">
            <Select
              aria-label="Método HTTP de la petición"
              value={method}
              disabled={isReadOnly}
              onChange={(e) => updateParam("method", e.target.value as HttpRequestMethod)}
              className="font-mono font-semibold"
            >
              {HTTP_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </div>
          <TextInput
            id={`http-url-${node.id}`}
            type="text"
            value={node.params.url || ""}
            disabled={isReadOnly}
            onChange={(e) => updateParam("url", e.target.value)}
            placeholder="https://api.example.com/v1/items/:id"
            className="min-w-0 flex-1 font-mono"
          />
        </div>
      </div>

      <SegmentedControl<HttpTab>
        ariaLabel="Configuración de petición HTTP"
        value={activeTab}
        onChange={setActiveTab}
        className="flex flex-wrap"
        options={[
          { value: "params", label: "Parámetros" },
          { value: "headers", label: "Headers" },
          { value: "auth", label: "Auth" },
          { value: "body", label: "Body" },
          { value: "response", label: "Respuesta" },
        ]}
      />

      {activeTab === "params" && (
        <div className="space-y-4">
          <Field
            label="Path Params (:clave o {clave} en la URL)"
            hint="Reemplaza automáticamente segmentos como :id o {orderId} codificando el valor."
          >
            <KeyValueList
              items={node.params.pathParams || []}
              onChange={(next) => updateParam("pathParams", next)}
              disabled={isReadOnly}
              keyPlaceholder="id"
              valuePlaceholder="Valor o {{token}}"
              addLabel="Añadir Path Param"
              emptyText="Sin parámetros de ruta."
            />
          </Field>

          <Field
            label="Query Params (?clave=valor)"
            hint="Se anexan al query string de la URL respetando codificación URL."
          >
            <KeyValueList
              items={node.params.queryParams || []}
              onChange={(next) => updateParam("queryParams", next)}
              disabled={isReadOnly}
              keyPlaceholder="page"
              valuePlaceholder="1"
              addLabel="Añadir Query Param"
              emptyText="Sin parámetros query string."
            />
          </Field>
        </div>
      )}

      {activeTab === "headers" && (
        <Field
          label="Cabeceras HTTP (Headers)"
          hint="Puedes referenciar secretos con {{secret.MI_TOKEN}} o salidas de pasos."
        >
          <KeyValueList
            items={node.params.headers || []}
            onChange={(next) => updateParam("headers", next)}
            disabled={isReadOnly}
            keyPlaceholder="Accept"
            valuePlaceholder="application/json"
            addLabel="Añadir header"
            emptyText="Sin cabeceras personalizadas."
          />
        </Field>
      )}

      {activeTab === "auth" && (
        <div className="space-y-3">
          <Field label="Tipo de autenticación" htmlFor={`http-auth-type-${node.id}`}>
            <Select
              id={`http-auth-type-${node.id}`}
              value={auth.type}
              disabled={isReadOnly}
              onChange={(e) =>
                handleAuthTypeChange(e.target.value as HttpAuthConfig["type"])
              }
            >
              <option value="none">Ninguna</option>
              <option value="bearer">Bearer Token (Authorization: Bearer ...)</option>
              <option value="basic">Basic Auth (Usuario y contraseña)</option>
              <option value="apiKey">API Key (Header o Query)</option>
            </Select>
          </Field>

          {auth.type === "bearer" && (
            <Field
              label="Token Bearer"
              htmlFor={`http-auth-bearer-${node.id}`}
              action={
                !isReadOnly ? (
                  <VariablePicker
                    onSelect={(token) =>
                      updateParam("auth", { ...auth, token: `${auth.token || ""}${token}` })
                    }
                  />
                ) : undefined
              }
            >
              <TextInput
                id={`http-auth-bearer-${node.id}`}
                type="text"
                value={auth.token}
                disabled={isReadOnly}
                onChange={(e) => updateParam("auth", { ...auth, token: e.target.value })}
                placeholder="{{secret.API_TOKEN}}"
                className="font-mono"
              />
            </Field>
          )}

          {auth.type === "basic" && (
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Usuario" htmlFor={`http-auth-user-${node.id}`}>
                <TextInput
                  id={`http-auth-user-${node.id}`}
                  type="text"
                  value={auth.username}
                  disabled={isReadOnly}
                  onChange={(e) =>
                    updateParam("auth", { ...auth, username: e.target.value })
                  }
                  placeholder="usuario"
                  className="font-mono"
                />
              </Field>
              <Field
                label="Contraseña"
                htmlFor={`http-auth-pass-${node.id}`}
                action={
                  !isReadOnly ? (
                    <VariablePicker
                      onSelect={(token) =>
                        updateParam("auth", {
                          ...auth,
                          password: `${auth.password || ""}${token}`,
                        })
                      }
                    />
                  ) : undefined
                }
              >
                <TextInput
                  id={`http-auth-pass-${node.id}`}
                  type="text"
                  value={auth.password}
                  disabled={isReadOnly}
                  onChange={(e) =>
                    updateParam("auth", { ...auth, password: e.target.value })
                  }
                  placeholder="{{secret.BASIC_PASS}}"
                  className="font-mono"
                />
              </Field>
            </div>
          )}

          {auth.type === "apiKey" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <Field label="Nombre del parámetro" htmlFor={`http-apikey-name-${node.id}`}>
                  <TextInput
                    id={`http-apikey-name-${node.id}`}
                    type="text"
                    value={auth.keyName}
                    disabled={isReadOnly}
                    onChange={(e) =>
                      updateParam("auth", { ...auth, keyName: e.target.value })
                    }
                    placeholder="X-API-Key"
                    className="font-mono"
                  />
                </Field>
                <Field label="Ubicación" htmlFor={`http-apikey-in-${node.id}`}>
                  <Select
                    id={`http-apikey-in-${node.id}`}
                    value={auth.in}
                    disabled={isReadOnly}
                    onChange={(e) =>
                      updateParam("auth", {
                        ...auth,
                        in: e.target.value as "header" | "query",
                      })
                    }
                  >
                    <option value="header">Header HTTP</option>
                    <option value="query">Query Param</option>
                  </Select>
                </Field>
              </div>
              <Field
                label="Valor de la API Key"
                htmlFor={`http-apikey-val-${node.id}`}
                action={
                  !isReadOnly ? (
                    <VariablePicker
                      onSelect={(token) =>
                        updateParam("auth", {
                          ...auth,
                          keyValue: `${auth.keyValue || ""}${token}`,
                        })
                      }
                    />
                  ) : undefined
                }
              >
                <TextInput
                  id={`http-apikey-val-${node.id}`}
                  type="text"
                  value={auth.keyValue}
                  disabled={isReadOnly}
                  onChange={(e) =>
                    updateParam("auth", { ...auth, keyValue: e.target.value })
                  }
                  placeholder="{{secret.SERVICE_API_KEY}}"
                  className="font-mono"
                />
              </Field>
            </div>
          )}
        </div>
      )}

      {activeTab === "body" && (
        <div className="space-y-3">
          {noBodyVerb && (
            <div className="rounded-control border border-warning/30 bg-warning-soft px-3 py-2 text-[11px] text-warning-text">
              Las peticiones {method} no envían cuerpo HTTP. Usa Parámetros o cambia a POST/PUT/PATCH.
            </div>
          )}

          <Field label="Formato del cuerpo (Body)" htmlFor={`http-body-type-${node.id}`}>
            <Select
              id={`http-body-type-${node.id}`}
              value={bodyType}
              disabled={isReadOnly}
              onChange={(e) => updateParam("bodyType", e.target.value as HttpBodyType)}
            >
              {BODY_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </Field>

          {bodyType === "json" && (
            <div className="space-y-2.5">
              <Field
                label="Payload JSON"
                htmlFor={`http-body-json-${node.id}`}
                hint="Escribe {{ para autocompletar variables o salidas de pasos (ej. webhook)."
                action={
                  !isReadOnly ? (
                    <VariablePicker
                      onSelect={(token) => {
                        if (jsonEditorRef.current) {
                          jsonEditorRef.current.insertText(token);
                        } else {
                          updateParam("bodyJson", `${node.params.bodyJson || ""}${token}`);
                        }
                      }}
                    />
                  ) : undefined
                }
              >
                <CodeMirrorTemplateEditor
                  ref={jsonEditorRef}
                  value={node.params.bodyJson || ""}
                  onChange={(val) => updateParam("bodyJson", val)}
                  autocompleteContext={templateAutocompleteContext}
                  readOnly={isReadOnly}
                  placeholder={'{\n  "evento": "pedido",\n  "datos": {{variables.payload}}\n}'}
                  minHeight="140px"
                  ariaLabel="Payload JSON"
                />
              </Field>

              {renderedJsonPreview && (
                <div className="space-y-1.5 rounded-card border border-line bg-card p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
                      Vista previa renderizada
                    </span>
                    <Badge tone={renderedJsonPreview.isValidJson ? "success" : "danger"}>
                      {renderedJsonPreview.isValidJson ? "JSON válido" : "JSON inválido"}
                    </Badge>
                  </div>
                  {renderedJsonPreview.missingTokens.length > 0 && (
                    <p className="text-[10.5px] text-warning-text">
                      Sin valor de prueba aún: {renderedJsonPreview.missingTokens.join(", ")}
                    </p>
                  )}
                  <pre className="max-h-36 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-fg-muted">
                    {renderedJsonPreview.resolvedStr}
                  </pre>
                </div>
              )}
            </div>
          )}

          {bodyType === "formUrlEncoded" && (
            <Field label="Campos Form URL-Encoded">
              <KeyValueList
                items={node.params.bodyForm || []}
                onChange={(next) => updateParam("bodyForm", next)}
                disabled={isReadOnly}
                keyPlaceholder="grant_type"
                valuePlaceholder="client_credentials"
                addLabel="Añadir campo"
                emptyText="Sin campos de formulario."
              />
            </Field>
          )}

          {bodyType === "multipart" && (
            <div className="space-y-2">
              {multipartFields.map((field, idx) => (
                <div
                  key={idx}
                  className="space-y-2 rounded-control border border-line bg-card p-2.5"
                >
                  <div className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={field.enabled !== false}
                      disabled={isReadOnly}
                      onChange={(e) =>
                        updateMultipartField(idx, { enabled: e.target.checked })
                      }
                      className="h-3.5 w-3.5 accent-accent"
                    />
                    <input
                      type="text"
                      value={field.key}
                      disabled={isReadOnly}
                      onChange={(e) => updateMultipartField(idx, { key: e.target.value })}
                      placeholder="Nombre del campo"
                      className="h-8 min-w-0 flex-1 rounded-control border border-line bg-input px-2 font-mono text-[11.5px] text-fg"
                    />
                    <select
                      value={field.fieldType}
                      disabled={isReadOnly}
                      onChange={(e) =>
                        updateMultipartField(idx, {
                          fieldType: e.target.value as "text" | "fileBase64",
                        })
                      }
                      className="h-8 rounded-control border border-line bg-input px-2 text-[11px] text-fg"
                    >
                      <option value="text">Texto</option>
                      <option value="fileBase64">Archivo Base64</option>
                    </select>
                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={() =>
                          updateParam(
                            "bodyMultipart",
                            multipartFields.filter((_, i) => i !== idx)
                          )
                        }
                        className="inline-flex h-8 w-8 items-center justify-center rounded-control text-fg-subtle hover:bg-hover hover:text-danger-text"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={field.value}
                      disabled={isReadOnly}
                      onChange={(e) => updateMultipartField(idx, { value: e.target.value })}
                      placeholder={
                        field.fieldType === "fileBase64"
                          ? "Base64 o {{steps.http_1.output.data}}"
                          : "Valor"
                      }
                      className="h-8 min-w-0 flex-1 rounded-control border border-line bg-input px-2 font-mono text-[11.5px] text-fg"
                    />
                    {!isReadOnly && (
                      <VariablePicker
                        onSelect={(token) =>
                          updateMultipartField(idx, {
                            value: `${field.value || ""}${token}`,
                          })
                        }
                      />
                    )}
                  </div>

                  {field.fieldType === "fileBase64" && (
                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        type="text"
                        value={field.filename || ""}
                        disabled={isReadOnly}
                        onChange={(e) =>
                          updateMultipartField(idx, { filename: e.target.value })
                        }
                        placeholder="archivo.pdf"
                        className="h-7 rounded-control border border-line bg-input px-2 font-mono text-[11px] text-fg"
                      />
                      <input
                        type="text"
                        value={field.contentType || ""}
                        disabled={isReadOnly}
                        onChange={(e) =>
                          updateMultipartField(idx, { contentType: e.target.value })
                        }
                        placeholder="application/pdf"
                        className="h-7 rounded-control border border-line bg-input px-2 font-mono text-[11px] text-fg"
                      />
                    </div>
                  )}
                </div>
              ))}

              {!isReadOnly && (
                <button
                  type="button"
                  onClick={() =>
                    updateParam("bodyMultipart", [
                      ...multipartFields,
                      { key: "", value: "", fieldType: "text", enabled: true },
                    ])
                  }
                  className="inline-flex items-center gap-1.5 rounded-control border border-line bg-card px-2.5 py-1 text-[11px] font-medium text-fg-muted hover:text-fg"
                >
                  <Plus className="h-3 w-3" />
                  <span>Añadir campo multipart</span>
                </button>
              )}
            </div>
          )}

          {bodyType === "raw" && (
            <div className="space-y-3">
              <Field label="Content-Type" htmlFor={`http-raw-ct-${node.id}`}>
                <TextInput
                  id={`http-raw-ct-${node.id}`}
                  type="text"
                  value={node.params.rawContentType || "text/plain; charset=utf-8"}
                  disabled={isReadOnly}
                  onChange={(e) => updateParam("rawContentType", e.target.value)}
                  className="font-mono"
                />
              </Field>
              <Field
                label="Cuerpo de texto"
                htmlFor={`http-raw-body-${node.id}`}
                action={
                  !isReadOnly ? (
                    <VariablePicker
                      onSelect={(token) =>
                        updateParam("bodyRaw", `${node.params.bodyRaw || ""}${token}`)
                      }
                    />
                  ) : undefined
                }
              >
                <textarea
                  id={`http-raw-body-${node.id}`}
                  rows={5}
                  value={node.params.bodyRaw || ""}
                  disabled={isReadOnly}
                  onChange={(e) => updateParam("bodyRaw", e.target.value)}
                  placeholder="<request>...</request>"
                  className="w-full rounded-field border border-line bg-input px-3 py-2 font-mono text-[12px] text-fg focus:border-accent focus:outline-none disabled:opacity-50"
                />
              </Field>
            </div>
          )}

          {bodyType === "binary" && (
            <div className="space-y-3">
              <Field label="Content-Type binario" htmlFor={`http-bin-ct-${node.id}`}>
                <TextInput
                  id={`http-bin-ct-${node.id}`}
                  type="text"
                  value={node.params.binaryContentType || "application/octet-stream"}
                  disabled={isReadOnly}
                  onChange={(e) => updateParam("binaryContentType", e.target.value)}
                  className="font-mono"
                />
              </Field>
              <Field
                label="Datos Base64"
                htmlFor={`http-bin-body-${node.id}`}
                action={
                  !isReadOnly ? (
                    <VariablePicker
                      onSelect={(token) =>
                        updateParam(
                          "bodyBinaryBase64",
                          `${node.params.bodyBinaryBase64 || ""}${token}`
                        )
                      }
                    />
                  ) : undefined
                }
              >
                <textarea
                  id={`http-bin-body-${node.id}`}
                  rows={4}
                  value={node.params.bodyBinaryBase64 || ""}
                  disabled={isReadOnly}
                  onChange={(e) => updateParam("bodyBinaryBase64", e.target.value)}
                  placeholder="{{steps.otro_paso.output.data}}"
                  className="w-full rounded-field border border-line bg-input px-3 py-2 font-mono text-[12px] text-fg focus:border-accent focus:outline-none disabled:opacity-50"
                />
              </Field>
            </div>
          )}
        </div>
      )}

      {activeTab === "response" && (
        <div className="space-y-3">
          <Field label="Formato de respuesta esperado" htmlFor={`http-res-type-${node.id}`}>
            <Select
              id={`http-res-type-${node.id}`}
              value={responseType}
              disabled={isReadOnly}
              onChange={(e) =>
                updateParam("responseType", e.target.value as HttpResponseType)
              }
            >
              {RESPONSE_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Guardar resultado en variable (opcional)"
            htmlFor={`http-output-var-${node.id}`}
            hint={`También accesible siempre como {{steps.${node.id}.output.data}}.`}
          >
            <TextInput
              id={`http-output-var-${node.id}`}
              type="text"
              value={node.params.outputVariable || ""}
              disabled={isReadOnly}
              onChange={(e) =>
                updateParam(
                  "outputVariable",
                  e.target.value.trim() ? e.target.value : undefined
                )
              }
              placeholder="ej. apiRespuesta"
              className="font-mono"
            />
          </Field>

          <Field label="Timeout de la petición (ms)" htmlFor={`http-timeout-${node.id}`}>
            <TextInput
              id={`http-timeout-${node.id}`}
              type="number"
              min={500}
              max={300000}
              value={node.params.timeoutMs ?? 30000}
              disabled={isReadOnly}
              onChange={(e) => updateParam("timeoutMs", Number(e.target.value))}
              className="font-mono"
            />
          </Field>

          <div className="space-y-2 pt-1">
            <label className="flex items-center gap-2 text-[12px] text-fg">
              <input
                type="checkbox"
                checked={node.params.followRedirects !== false}
                disabled={isReadOnly}
                onChange={(e) => updateParam("followRedirects", e.target.checked)}
                className="h-3.5 w-3.5 accent-accent"
              />
              <span>Seguir redirecciones HTTP automáticamente (3xx)</span>
            </label>

            <label className="flex items-center gap-2 text-[12px] text-fg">
              <input
                type="checkbox"
                checked={node.params.failOnHttpError !== false}
                disabled={isReadOnly}
                onChange={(e) => updateParam("failOnHttpError", e.target.checked)}
                className="h-3.5 w-3.5 accent-accent"
              />
              <span>Fallar el nodo si la respuesta es error HTTP (4xx / 5xx)</span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
