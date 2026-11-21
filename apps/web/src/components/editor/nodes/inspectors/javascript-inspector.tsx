"use client";

import React, { useMemo, useRef } from "react";
import { Cpu, Globe, Sparkles } from "lucide-react";
import type { JavascriptExecutionMode, JavascriptNode } from "@rpa/dsl";
import type { NodeInspectorProps } from "../types";
import { useRecipeStore } from "@/stores/use-recipe-store";
import { useWebhookTestStore } from "@/stores/use-webhook-test-store";
import { Field, SegmentedControl, TextInput } from "@/components/ui/primitives";
import { VariablePicker } from "../../variable-picker";
import {
  CodeMirrorJsEditor,
  type CodeMirrorJsEditorHandle,
} from "../../code-mirror-js-editor";

function tokenToJsExpression(token: string): string {
  const inner = token.replace(/^\{\{\s*/, "").replace(/\s*\}\}$/, "").trim();
  if (inner.startsWith("variables.") || inner.startsWith("steps.")) {
    return inner;
  }
  if (inner.startsWith("webhook.") || inner === "webhook") {
    return `input.${inner}`;
  }
  return `variables.${inner}`;
}

interface QuickTemplate {
  id: string;
  label: string;
  mode: JavascriptExecutionMode;
  code: string;
}

const QUICK_TEMPLATES: QuickTemplate[] = [
  {
    id: "transform_webhook",
    label: "Transformar webhook",
    mode: "sandbox",
    code:
      "const body = input.webhook?.body || {};\n" +
      "return {\n" +
      "  recibido: true,\n" +
      "  resumen: JSON.stringify(body),\n" +
      "};",
  },
  {
    id: "filter_list",
    label: "Filtrar lista",
    mode: "sandbox",
    code:
      "const items = Array.isArray(variables.items) ? variables.items : [];\n" +
      "const filtrados = items.filter(Boolean);\n" +
      "return { total: filtrados.length, items: filtrados };",
  },
  {
    id: "read_dom_table",
    label: "Leer tabla del DOM",
    mode: "browser",
    code:
      "const rows = Array.from(document.querySelectorAll('table tr')).map((tr) =>\n" +
      "  Array.from(tr.querySelectorAll('th, td')).map((cell) => cell.textContent?.trim() || '')\n" +
      ");\n" +
      "return { title: document.title, rows };",
  },
];

export function JavascriptInspectorForm({
  node,
  updateParam,
}: NodeInspectorProps<JavascriptNode>) {
  const editorRef = useRef<CodeMirrorJsEditorHandle>(null);

  const definition = useRecipeStore((s) => s.definition);
  const nodeOutputs = useRecipeStore((s) => s.nodeOutputs);
  const activeDetailNodeId = useRecipeStore((s) => s.activeDetailNodeId);
  const editorMode = useRecipeStore((s) => s.editorMode);
  const viewingVersion = useRecipeStore((s) => s.viewingVersion);
  const webhookByNode = useWebhookTestStore((s) => s.byNode);

  const webhookNode = Object.values(definition?.nodes || {}).find(
    (n) => n.type === "webhook"
  );
  const webhookPayload = webhookNode
    ? webhookByNode[webhookNode.id]?.payload ?? null
    : null;

  const mode: JavascriptExecutionMode =
    node.params.mode === "browser" ? "browser" : "sandbox";
  const isReadOnly = editorMode === "published" || viewingVersion !== null;
  const isDetailModal = activeDetailNodeId === node.id;

  const autocompleteContext = useMemo(
    () => ({
      definition,
      currentNodeId: node.id,
      nodeOutputs,
      webhookPayload,
      mode,
    }),
    [definition, node.id, nodeOutputs, webhookPayload, mode]
  );

  const availableTemplates = useMemo(
    () =>
      QUICK_TEMPLATES.filter((t) => mode === "browser" || t.mode === "sandbox"),
    [mode]
  );

  return (
    <div className="space-y-4">
      <Field
        label="Entorno de ejecución"
        hint={
          mode === "sandbox"
            ? "Corre aislado en el runner sin acceso al sistema. Ideal para transformar datos de webhook o variables."
            : "Corre dentro de la pestaña actual de Playwright con acceso directo a document, window y el DOM."
        }
      >
        <SegmentedControl<JavascriptExecutionMode>
          ariaLabel="Entorno de ejecución JavaScript"
          value={mode}
          onChange={(nextMode) => {
            if (!isReadOnly) updateParam("mode", nextMode);
          }}
          options={[
            {
              value: "sandbox",
              label: "Flujo (Sandbox)",
              icon: <Cpu className="h-3.5 w-3.5" />,
            },
            {
              value: "browser",
              label: "Página (DOM)",
              icon: <Globe className="h-3.5 w-3.5" />,
            },
          ]}
        />
      </Field>

      <Field
        label="Guardar resultado en variable (opcional)"
        htmlFor={`js-output-var-${node.id}`}
        hint={`También accesible siempre como {{steps.${node.id}.output}} en pasos siguientes.`}
      >
        <TextInput
          id={`js-output-var-${node.id}`}
          type="text"
          value={node.params.outputVariable || ""}
          disabled={isReadOnly}
          onChange={(e) => updateParam("outputVariable", e.target.value)}
          placeholder="ej. resultadoJs"
          className="font-mono"
        />
      </Field>

      <Field
        label="Código JavaScript"
        hint={
          mode === "sandbox"
            ? "Admite await, return, variables.*, steps.<id>.output, input, setVariable(nombre, valor) y console.log()."
            : "Admite await, return, document.*, window.*, variables.*, steps.<id>.output e input."
        }
        action={
          <div className="flex items-center gap-1.5">
            {!isReadOnly && (
              <select
                aria-label="Insertar plantilla JavaScript"
                defaultValue=""
                onChange={(e) => {
                  const tpl = QUICK_TEMPLATES.find((t) => t.id === e.target.value);
                  if (tpl) {
                    updateParam("code", tpl.code);
                    e.target.value = "";
                  }
                }}
                className="h-6 rounded-control border border-line bg-card px-1.5 text-[10.5px] text-fg-muted hover:text-fg focus:border-accent focus:outline-none"
              >
                <option value="" disabled>
                  Plantillas…
                </option>
                {availableTemplates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.label}
                  </option>
                ))}
              </select>
            )}

            <VariablePicker
              title="Insertar referencia JS en el cursor"
              onSelect={(token) => {
                const expr = tokenToJsExpression(token);
                if (editorRef.current) {
                  editorRef.current.insertText(expr);
                } else {
                  updateParam("code", `${node.params.code || ""}\n${expr}`);
                }
              }}
            />
          </div>
        }
      >
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px] font-mono text-fg-subtle">
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-amber-400" />
              <span>Autocompletado activo al escribir</span>
            </span>
            <kbd className="rounded border border-line bg-card px-1.5 py-0.5 text-[9.5px]">
              Ctrl + Space
            </kbd>
          </div>

          <CodeMirrorJsEditor
            ref={editorRef}
            value={node.params.code || ""}
            onChange={(nextCode) => updateParam("code", nextCode)}
            autocompleteContext={autocompleteContext}
            readOnly={isReadOnly}
            minHeight={isDetailModal ? "320px" : "180px"}
            ariaLabel="Editor de código JavaScript"
          />
        </div>
      </Field>
    </div>
  );
}
