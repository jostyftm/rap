"use client";

import React, { useState, useEffect } from "react";
import type {
  KeyValuePair,
  WebhookHttpMethod,
  WebhookNode,
  WebhookResponseMode,
} from "@rpa/dsl";
import type { NodeInspectorProps } from "../types";
import { KeyValueList } from "./key-value-list";
import {
  Copy,
  Check,
  Globe,
  Radio,
  Square,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import {
  buildProductionWebhookPath,
  buildProductionWebhookUrl,
  buildTestWebhookUrl,
} from "@/lib/webhook-url";
import { copyToClipboard } from "@/lib/clipboard";
import { useRecipeStore } from "@/stores/use-recipe-store";
import { useWebhookTestStore } from "@/stores/use-webhook-test-store";
import {
  Badge,
  Button,
  Field,
  Select,
  TextInput,
} from "@/components/ui/primitives";

const HTTP_METHODS: WebhookHttpMethod[] = [
  "POST",
  "GET",
  "PUT",
  "DELETE",
  "PATCH",
  "ANY",
];

export function WebhookInspectorForm({
  node,
  updateParam,
}: NodeInspectorProps<WebhookNode>) {
  const [copied, setCopied] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const recipeId = useRecipeStore((s) => s.recipeId);
  const editorMode = useRecipeStore((s) => s.editorMode);
  const publishedVersion = useRecipeStore((s) => s.publishedVersion);
  const viewingVersion = useRecipeStore((s) => s.viewingVersion);
  const [urlTabOverride, setUrlTabOverride] = useState<{
    mode: string;
    tab: "test" | "production";
  } | null>(null);

  const webhookStore = useWebhookTestStore();
  const testEntry = webhookStore.getEntry(node.id);

  const isReadOnly = editorMode === "published" || viewingVersion !== null;

  const path = node.params.path || `/api/v1/webhooks/${node.id}`;
  const method = node.params.httpMethod || "POST";
  const outputVar = node.params.outputVariable || "webhook";
  const responseCode = node.params.responseCode ?? 200;
  const responseBody = node.params.responseBody || '{"ok":true}';
  const responseMode: WebhookResponseMode = node.params.responseMode || "immediate";
  const responseTimeoutMs = node.params.responseTimeoutMs ?? 30000;
  const responseHeaders: KeyValuePair[] = node.params.responseHeaders || [];

  const pubDef = publishedVersion?.definition;
  const pubEntryNode = pubDef?.entry ? pubDef.nodes[pubDef.entry] : undefined;
  const pubWebhookNode = pubEntryNode?.type === "webhook" ? (pubEntryNode as WebhookNode) : undefined;
  const isPublishedListening = Boolean(pubWebhookNode);

  const testUrl = buildTestWebhookUrl(path, node.id);
  const prodUrl = buildProductionWebhookUrl(
    pubWebhookNode?.params?.path || path,
    pubWebhookNode?.id || node.id
  );
  const hasPathDrift = Boolean(
    pubWebhookNode &&
      buildProductionWebhookPath(path, node.id) !==
        buildProductionWebhookPath(pubWebhookNode.params?.path, pubWebhookNode.id)
  );

  const activeUrlTab =
    urlTabOverride?.mode === editorMode
      ? urlTabOverride.tab
      : editorMode === "published"
        ? "production"
        : "test";

  const displayedUrl = activeUrlTab === "production" ? prodUrl : testUrl;

  useEffect(() => {
    if (testEntry.status !== "listening" || !testEntry.expiresAt) {
      return;
    }

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor(testEntry.expiresAt! - Date.now() / 1000));
      setTimeLeft(remaining);
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [testEntry.status, testEntry.expiresAt]);

  const handleCopyUrl = async () => {
    if (await copyToClipboard(displayedUrl)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleToggleListening = () => {
    if (!recipeId) return;

    if (testEntry.status === "listening") {
      webhookStore.stopListening(recipeId, node.id);
    } else {
      webhookStore.startListening(recipeId, node);
    }
  };

  const handleResponseBodyChange = (val: string) => {
    updateParam("responseBody", val);
    if (!val.trim()) {
      setJsonError(null);
      return;
    }
    try {
      JSON.parse(val);
      setJsonError(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "JSON no válido";
      setJsonError(msg);
    }
  };

  const isListening = testEntry.status === "listening";

  return (
    <div className="space-y-4">
      <Field label="Método HTTP" htmlFor="webhook-method">
        <Select
          id="webhook-method"
          value={method}
          disabled={isListening || isReadOnly}
          onChange={(e) => updateParam("httpMethod", e.target.value as WebhookHttpMethod)}
          className="font-mono"
        >
          {HTTP_METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Slug o ruta del webhook"
        htmlFor="webhook-path"
        hint="Define un identificador único (ej. pedidos). Se usará en ambas URLs: prueba y producción."
      >
        <div className="relative">
          <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
          <TextInput
            id="webhook-path"
            type="text"
            value={path}
            disabled={isListening || isReadOnly}
            onChange={(e) => updateParam("path", e.target.value)}
            placeholder={`/api/v1/webhooks/${node.id}`}
            className="pl-9 font-mono"
          />
        </div>
      </Field>

      {/* Selector de URL aislada: Prueba vs Producción */}
      <div className="overflow-hidden rounded-card border border-line bg-card">
        <div className="flex items-center justify-between gap-2 border-b border-line bg-panel px-2.5 py-1.5">
          <div role="tablist" aria-label="Tipo de URL del webhook" className="flex items-center gap-1">
            <button
              type="button"
              role="tab"
              aria-selected={activeUrlTab === "test"}
              onClick={() => setUrlTabOverride({ mode: editorMode, tab: "test" })}
              className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                activeUrlTab === "test"
                  ? "bg-raised text-fg shadow-[var(--shadow-card)]"
                  : "text-fg-muted hover:bg-hover hover:text-fg"
              }`}
            >
              URL de Prueba
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeUrlTab === "production"}
              onClick={() => setUrlTabOverride({ mode: editorMode, tab: "production" })}
              className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                activeUrlTab === "production"
                  ? "bg-raised text-fg shadow-[var(--shadow-card)]"
                  : "text-fg-muted hover:bg-hover hover:text-fg"
              }`}
            >
              URL de Producción
            </button>
          </div>

          {activeUrlTab === "production" ? (
            <Badge tone={isPublishedListening ? "success" : "neutral"} className="h-5 px-1.5 text-[9.5px]">
              {isPublishedListening
                ? `Siempre escuchando (v${publishedVersion?.version})`
                : "Sin publicar"}
            </Badge>
          ) : (
            <Badge tone="warning" className="h-5 px-1.5 text-[9.5px]">
              Solo pruebas
            </Badge>
          )}
        </div>

        <div className="space-y-2 p-2.5">
          <div className="flex items-center justify-between gap-2 rounded-control border border-line bg-input px-2.5 py-1.5">
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg" title={displayedUrl}>
              {displayedUrl}
            </span>
            <button
              type="button"
              onClick={handleCopyUrl}
              title="Copiar URL completa del endpoint"
              className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-accent-text transition-colors hover:text-accent"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-success-text" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              <span>{copied ? "Copiada" : "Copiar"}</span>
            </button>
          </div>

          <p className="text-[11px] leading-relaxed text-fg-muted">
            {activeUrlTab === "production" ? (
              isPublishedListening ? (
                <>
                  Activa de forma permanente mientras la receta esté publicada. Cada petición ejecutará la{" "}
                  <strong>versión publicada v{publishedVersion?.version}</strong> en segundo plano sin interferir con tu borrador.
                </>
              ) : (
                "Publica la receta con este nodo como entrada para activar esta URL permanentemente en producción."
              )
            ) : (
              "Solo escucha cuando pulsas «Escuchar evento de prueba» o ejecutas manualmente el borrador. Nunca dispara la versión publicada."
            )}
          </p>

          {activeUrlTab === "production" && hasPathDrift && (
            <div className="flex items-start gap-1.5 rounded-control border border-warning/25 bg-warning-soft px-2.5 py-2 text-[11px] text-warning-text">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                El borrador cambió la ruta a{" "}
                <code className="font-mono">{buildProductionWebhookPath(path, node.id)}</code>. Publica para
                actualizar la URL de producción.
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Button
          variant={isListening ? "danger" : "primary"}
          onClick={handleToggleListening}
          disabled={!recipeId || (isReadOnly && !isListening)}
          title={
            !recipeId
              ? "Guarda la receta primero para probar este webhook"
              : isReadOnly
                ? "Cambia a modo Edición para probar el webhook del borrador"
                : undefined
          }
          className={isListening ? "w-full border border-danger/30" : "w-full"}
        >
          {isListening ? (
            <>
              <Square className="h-3.5 w-3.5 fill-current" />
              <span>Detener escucha</span>
              {timeLeft !== null && (
                <span className="ml-1 font-mono text-[11px] opacity-80">({timeLeft}s)</span>
              )}
            </>
          ) : (
            <>
              <Radio className="h-4 w-4" />
              <span>Escuchar evento de prueba</span>
            </>
          )}
        </Button>

        {!recipeId && (
          <p className="text-center text-[11px] text-warning-text">
            Debes guardar la receta para poder iniciar la escucha de prueba.
          </p>
        )}

        {isListening && (
          <div className="flex items-start gap-2 rounded-control border border-warning/25 bg-warning-soft px-3 py-2.5 text-[11px] leading-relaxed text-warning-text">
            <Radio className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-pulse" />
            <span>
              Esperando una petición HTTP {method} en la URL de prueba (<code className="font-mono">/webhooks-test/</code>).
              No afectará a la versión publicada.
            </span>
          </div>
        )}

        {testEntry.status === "error" && testEntry.error && (
          <div className="flex items-start gap-2 rounded-control border border-danger/25 bg-danger-soft px-3 py-2.5 text-[11px] leading-relaxed text-danger-text">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{testEntry.error}</span>
          </div>
        )}
      </div>

      <div className="flex items-start gap-2.5 rounded-card border border-line bg-card px-4 py-3 text-[11.5px] leading-relaxed text-fg-muted">
        <Radio className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-text" />
        <span>
          Cuando la automatización inicia con este nodo y se publica, su URL de producción queda
          escuchando de forma permanente. Mientras editas cambios en el borrador, usa la URL de
          prueba sin riesgo de disparar producción.
        </span>
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-card">
        <button
          type="button"
          onClick={() => setShowAdvanced((prev) => !prev)}
          aria-expanded={showAdvanced}
          className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-[12px] font-medium text-fg transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/30"
        >
          <span className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-accent-text" />
            <span>Opciones avanzadas</span>
          </span>
          <span className="flex items-center gap-2">
            <Badge tone="neutral" className="h-5 px-1.5 text-[9.5px]">
              {responseCode}
            </Badge>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`h-3.5 w-3.5 text-fg-subtle transition-transform duration-200 ${
                showAdvanced ? "rotate-90" : ""
              }`}
              aria-hidden="true"
            >
              <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </button>

        {showAdvanced && (
          <div className="rpa-tab-panel space-y-4 border-t border-line px-3 py-3">
            <Field
              label="Cuándo responder al cliente"
              htmlFor="webhook-response-mode"
              hint={
                responseMode === "immediate"
                  ? "Responde al instante con un JSON estático y ejecuta la automatización en segundo plano."
                  : responseMode === "lastNode"
                    ? "Mantiene abierta la conexión HTTP y devuelve automáticamente la salida JSON del último paso ejecutado."
                    : "Espera hasta que el flujo ejecute un nodo «Responder / Retornar» para enviar estado, headers y cuerpo exactos."
              }
            >
              <Select
                id="webhook-response-mode"
                value={responseMode}
                disabled={isReadOnly}
                onChange={(e) =>
                  updateParam("responseMode", e.target.value as WebhookResponseMode)
                }
              >
                <option value="immediate">De inmediato (asíncrono)</option>
                <option value="lastNode">Al finalizar el flujo (último nodo)</option>
                <option value="respondNode">Cuando se ejecute un nodo «Responder»</option>
              </Select>
            </Field>

            {responseMode === "immediate" ? (
              <>
                <Field
                  label="Código de respuesta HTTP"
                  htmlFor="webhook-response-code"
                  hint="Entre 100 y 599."
                >
                  <TextInput
                    id="webhook-response-code"
                    type="number"
                    value={responseCode}
                    disabled={isReadOnly}
                    onChange={(e) => updateParam("responseCode", Number(e.target.value))}
                    min={100}
                    max={599}
                    className="font-mono"
                  />
                </Field>

                <Field
                  label="Contenido de respuesta (JSON)"
                  htmlFor="webhook-response-body"
                  error={jsonError || undefined}
                >
                  <textarea
                    id="webhook-response-body"
                    rows={3}
                    value={responseBody}
                    disabled={isReadOnly}
                    onChange={(e) => handleResponseBodyChange(e.target.value)}
                    placeholder='{"ok": true}'
                    aria-invalid={Boolean(jsonError)}
                    className="w-full resize-none rounded-field border border-line bg-input px-3.5 py-2.5 font-mono text-[12px] text-fg placeholder:text-fg-subtle transition-[border-color,box-shadow] hover:border-line-strong focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </Field>

                <Field label="Headers adicionales (opcional)">
                  <KeyValueList
                    items={responseHeaders}
                    onChange={(next) => updateParam("responseHeaders", next)}
                    disabled={isReadOnly}
                    keyPlaceholder="X-Webhook-Version"
                    valuePlaceholder="1"
                    addLabel="Añadir header"
                    emptyText="Sin cabeceras extra."
                    showVariablePicker={false}
                  />
                </Field>
              </>
            ) : (
              <Field
                label="Tiempo máximo de espera de respuesta (ms)"
                htmlFor="webhook-response-timeout"
                hint="Entre 1000 ms (1s) y 120000 ms (120s). Si se supera, devuelve HTTP 504."
              >
                <TextInput
                  id="webhook-response-timeout"
                  type="number"
                  value={responseTimeoutMs}
                  disabled={isReadOnly}
                  onChange={(e) =>
                    updateParam("responseTimeoutMs", Number(e.target.value))
                  }
                  min={1000}
                  max={120000}
                  className="font-mono"
                />
              </Field>
            )}

            <Field
              label="Guardar payload en variable"
              htmlFor="webhook-output-variable"
              hint={
                <span>
                  Disponible como{" "}
                  <code className="font-mono text-accent-text">{`{{${outputVar}.body}}`}</code> o{" "}
                  <code className="font-mono text-accent-text">{`{{steps.${node.id}.output.body}}`}</code>.
                </span>
              }
            >
              <TextInput
                id="webhook-output-variable"
                type="text"
                value={outputVar}
                disabled={isReadOnly}
                onChange={(e) => updateParam("outputVariable", e.target.value)}
                placeholder="webhook"
                className="font-mono"
              />
            </Field>
          </div>
        )}
      </div>
    </div>
  );
}
