"use client";

import React, { useState, useEffect } from "react";
import { X, Copy, Check, Download, Loader2, Code2, Terminal } from "lucide-react";
import { apiFetch } from "../../lib/api-client";

interface ExportModalProps {
  recipeId: string;
  recipeName: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ExportModal({ recipeId, recipeName, isOpen, onClose }: ExportModalProps) {
  const [code, setCode] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen || !recipeId) return;

    setIsLoading(true);
    apiFetch<{ code: string }>(`/api/v1/recipes/${recipeId}/export/playwright`)
      .then((res) => {
        setCode(res.code || "");
      })
      .catch((err) => {
        setCode(`// Error al exportar la receta: ${err.message}`);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [isOpen, recipeId]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: "text/typescript;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${recipeName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.spec.ts`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-neutral-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/60">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <Code2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-neutral-100">
                Exportar a Playwright TypeScript
              </h2>
              <p className="text-xs text-neutral-400">
                Script standalone autónomo listo para ejecutar en CI/CD con{" "}
                <code className="text-blue-400 font-mono">npx playwright test</code>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden p-5 flex flex-col">
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center space-y-2 text-neutral-400">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              <span className="text-xs">Compilando flujo a Playwright TS...</span>
            </div>
          ) : (
            <div className="flex-1 relative rounded-lg border border-neutral-800 bg-neutral-950 overflow-hidden flex flex-col">
              <div className="h-8 px-3 bg-neutral-900/80 border-b border-neutral-800 flex items-center justify-between text-[11px] text-neutral-400">
                <div className="flex items-center space-x-2">
                  <Terminal className="w-3.5 h-3.5" />
                  <span className="font-mono">recipe.spec.ts</span>
                </div>
                <span className="text-[10px] text-neutral-500">TypeScript</span>
              </div>
              <pre className="flex-1 overflow-auto p-4 text-xs font-mono text-neutral-200 leading-relaxed select-text">
                {code}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-neutral-800 bg-neutral-950/60 flex items-center justify-between">
          <span className="text-xs text-neutral-500">
            Incluye resolución de localizadores con fallbacks ponderados y variables.
          </span>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleCopy}
              disabled={isLoading}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium transition-colors"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copied ? "¡Copiado!" : "Copiar Código"}</span>
            </button>

            <button
              onClick={handleDownload}
              disabled={isLoading}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Descargar .spec.ts</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
