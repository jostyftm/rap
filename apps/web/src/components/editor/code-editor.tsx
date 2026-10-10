"use client";

import React, { useState, useMemo } from "react";
import Editor from "@monaco-editor/react";
import { Copy, Check, Download, AlertCircle, FileCode } from "lucide-react";
import { exportToPlaywright } from "@rpa/dsl";
import { useRecipeStore } from "../../stores/use-recipe-store";

export function CodeEditor() {
  const definition = useRecipeStore((s) => s.definition);
  const recipeName = useRecipeStore((s) => s.recipeName);
  const setDefinitionFromCode = useRecipeStore((s) => s.setDefinitionFromCode);
  const validationErrors = useRecipeStore((s) => s.validationErrors);

  const [subTab, setSubTab] = useState<"json" | "playwright">("playwright");
  const [copied, setCopied] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Generar código Playwright TypeScript
  const playwrightCode = useMemo(() => {
    try {
      return exportToPlaywright(definition, { testName: recipeName });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return `// Error al generar Playwright TypeScript:\n// ${msg}`;
    }
  }, [definition, recipeName]);

  const handleJsonChange = (val: string | undefined) => {
    if (!val) return;
    try {
      const parsed = JSON.parse(val);
      setJsonError(null);
      setDefinitionFromCode(parsed);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Sintaxis JSON inválida";
      setJsonError(msg);
    }
  };

  const handleCopy = () => {
    const text = subTab === "playwright" ? playwrightCode : JSON.stringify(definition, null, 2);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([playwrightCode], { type: "text/typescript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${recipeName.toLowerCase().replace(/[^a-z0-9]/g, "-") || "receta"}.spec.ts`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 h-full bg-neutral-950 flex flex-col">
      {/* Barra de herramientas del editor de código */}
      <div className="h-12 border-b border-neutral-800 px-4 flex items-center justify-between bg-neutral-900/80">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setSubTab("playwright")}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              subTab === "playwright"
                ? "bg-neutral-800 text-blue-400 border border-neutral-700"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Playwright TypeScript</span>
          </button>
          <button
            onClick={() => setSubTab("json")}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              subTab === "json"
                ? "bg-neutral-800 text-blue-400 border border-neutral-700"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>JSON DSL (Editable)</span>
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleCopy}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">¡Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copiar código</span>
              </>
            )}
          </button>

          {subTab === "playwright" && (
            <button
              onClick={handleDownload}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors shadow"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Descargar .spec.ts</span>
            </button>
          )}
        </div>
      </div>

      {/* Alerta de error de sintaxis si hay */}
      {(jsonError || (subTab === "json" && validationErrors.length > 0)) && (
        <div className="px-4 py-2 bg-rose-950/60 border-b border-rose-900/60 flex items-center space-x-2 text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span className="truncate">{jsonError || validationErrors[0]}</span>
        </div>
      )}

      {/* Monaco Editor */}
      <div className="flex-1 overflow-hidden">
        {subTab === "playwright" ? (
          <Editor
            height="100%"
            language="typescript"
            theme="vs-dark"
            value={playwrightCode}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: "ui-monospace, monospace",
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
          />
        ) : (
          <Editor
            height="100%"
            language="json"
            theme="vs-dark"
            value={JSON.stringify(definition, null, 2)}
            onChange={handleJsonChange}
            options={{
              readOnly: false,
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: "ui-monospace, monospace",
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
          />
        )}
      </div>
    </div>
  );
}
