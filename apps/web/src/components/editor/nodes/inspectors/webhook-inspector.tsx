"use client";

import React, { useState, useEffect } from "react";
import type { WebhookNode, WebhookHttpMethod } from "@rpa/dsl";
import type { NodeInspectorProps } from "../types";
import {
  Copy,
  Check,
  Globe,
  Radio,
  Square,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { buildWebhookUrl } from "@/lib/webhook-url";
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
  const webhookStore = useWebhookTestStore();
  const testEntry = webhookStore.getEntry(node.id);

  const path = node.params.path || `/api/v1/webhooks/${node.id}`;
  const method = node.params.httpMethod || "POST";
  const outputVar = node.params.outputVariable || "webhook";
  const responseCode = node.params.responseCode ?? 200;
  const responseBody = node.params.responseBody || '{"ok":true}';

  const fullUrl = buildWebhookUrl(path);

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

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          disabled={isListening}
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
        label="Ruta del webhook"
        htmlFor="webhook-path"
        action={
          <button
            type="button"
            onClick={handleCopyUrl}
            title="Copiar URL completa del endpoint"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-accent-text transition-colors hover:text-accent"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-success-text" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            <span>{copied ? "Copiada" : "Copiar URL"}</span>
          </button>
        }
        hint={
          <span className="block truncate font-mono" title={fullUrl}>
            {fullUrl}
          </span>
        }
      >
        <div className="relative">
          <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
          <TextInput
            id="webhook-path"
            type="text"
            value={path}
            disabled={isListening}
            onChange={(e) => updateParam("path", e.target.value)}
            placeholder={`/api/v1/webhooks/${node.id}`}
            className="pl-9 font-mono"
          />
        </div>
      </Field>

      <div className="space-y-2">
        <Button
          variant={isListening ? "danger" : "primary"}
          onClick={handleToggleListening}
          disabled={!recipeId}
          title={!recipeId ? "Guarda la receta primero para probar este webhook" : undefined}
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
              Esperando una petición HTTP {method} en la URL. Puedes probar enviando datos
              desde Postman, curl o tu backend.
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
              label="Código de respuesta HTTP"
              htmlFor="webhook-response-code"
              hint="Entre 100 y 599."
            >
              <TextInput
                id="webhook-response-code"
                type="number"
                value={responseCode}
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
                onChange={(e) => handleResponseBodyChange(e.target.value)}
                placeholder='{"ok": true}'
                aria-invalid={Boolean(jsonError)}
                className="w-full resize-none rounded-field border border-line bg-input px-3.5 py-2.5 font-mono text-[12px] text-fg placeholder:text-fg-subtle transition-[border-color,box-shadow] hover:border-line-strong focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15"
              />
            </Field>

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
