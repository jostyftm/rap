"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  Braces,
  Type,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  ChevronDown,
} from "lucide-react";
import { useRecipeStore } from "@/stores/use-recipe-store";
import {
  resolveExpression,
  getAvailableExpressionTokens,
  type AvailableToken,
} from "@/lib/expression-evaluator";

interface ExpressionFieldProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  nodeId: string;
  type?: "text" | "number" | "password";
  description?: string;
  className?: string;
}

export function ExpressionField({
  label,
  value,
  onChange,
  placeholder = "",
  nodeId,
  type = "text",
  description,
  className = "",
}: ExpressionFieldProps) {
  const definition = useRecipeStore((s) => s.definition);
  const nodeOutputs = useRecipeStore((s) => s.nodeOutputs);

  // Determinar si el valor actual es una expresión (contiene {{ o fue alternado manualmente)
  const isExpressionDetected = typeof value === "string" && value.includes("{{");
  const [mode, setMode] = useState<"fixed" | "expression">(
    isExpressionDetected ? "expression" : "fixed"
  );
  const [isDragOver, setIsDragOver] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionFilter, setSuggestionFilter] = useState("");
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Si el valor externo cambia y contiene expresiones, conmutar a expresión
  useEffect(() => {
    if (typeof value === "string" && value.includes("{{") && mode === "fixed") {
      setMode("expression");
    }
  }, [value, mode]);

  // Lista de sugerencias de variables disponibles
  const availableTokens = useMemo(() => {
    return getAvailableExpressionTokens(definition, nodeId, nodeOutputs);
  }, [definition, nodeId, nodeOutputs]);

  // Filtrar sugerencias
  const filteredTokens = useMemo(() => {
    if (!suggestionFilter) return availableTokens.slice(0, 8);
    const q = suggestionFilter.toLowerCase();
    return availableTokens
      .filter((t) => t.token.toLowerCase().includes(q) || t.label.toLowerCase().includes(q))
      .slice(0, 8);
  }, [availableTokens, suggestionFilter]);

  // Evaluar expresión en tiempo real para la vista previa
  const evalResult = useMemo(() => {
    if (mode !== "expression") return null;
    return resolveExpression(value || "", {
      definition,
      nodeOutputs,
    });
  }, [mode, value, definition, nodeOutputs]);

  // Manejadores de Drag and Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    let tokenToInsert = "";
    try {
      const jsonStr = e.dataTransfer.getData("application/json");
      if (jsonStr) {
        const parsed = JSON.parse(jsonStr);
        tokenToInsert = parsed.token || "";
      }
    } catch {
      // Ignorar error JSON
    }

    if (!tokenToInsert) {
      tokenToInsert = e.dataTransfer.getData("text/plain") || "";
    }

    if (tokenToInsert) {
      const currentVal = value || "";
      const newVal =
        mode === "expression" && currentVal
          ? `${currentVal} ${tokenToInsert}`
          : tokenToInsert;
      onChange(newVal);
      setMode("expression");
      inputRef.current?.focus();
    }
  };

  // Manejar entrada de texto y autocompletado con {{
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);

    const cursorPos = e.target.selectionStart || 0;
    const textBeforeCursor = val.slice(0, cursorPos);
    const lastOpenIndex = textBeforeCursor.lastIndexOf("{{");
    const lastCloseIndex = textBeforeCursor.lastIndexOf("}}");

    if (lastOpenIndex !== -1 && lastOpenIndex > lastCloseIndex) {
      const filter = textBeforeCursor.slice(lastOpenIndex + 2);
      setSuggestionFilter(filter);
      setShowSuggestions(true);
      setSelectedSuggestionIndex(0);
    } else {
      setShowSuggestions(false);
    }
  };

  const insertToken = (token: string) => {
    const currentVal = value || "";
    const cursorPos = inputRef.current?.selectionStart || currentVal.length;
    const textBeforeCursor = currentVal.slice(0, cursorPos);
    const textAfterCursor = currentVal.slice(cursorPos);

    const lastOpenIndex = textBeforeCursor.lastIndexOf("{{");
    if (lastOpenIndex !== -1) {
      const prefix = textBeforeCursor.slice(0, lastOpenIndex);
      const nextCloseIndex = textAfterCursor.indexOf("}}");
      const suffix = nextCloseIndex !== -1 ? textAfterCursor.slice(nextCloseIndex + 2) : textAfterCursor;
      const combined = `${prefix}${token}${suffix}`;
      onChange(combined);
    } else {
      onChange(`${currentVal}${token}`);
    }

    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  // Atajos de teclado en el input para navegar sugerencias
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions && filteredTokens.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedSuggestionIndex((prev) => (prev + 1) % filteredTokens.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedSuggestionIndex((prev) => (prev - 1 + filteredTokens.length) % filteredTokens.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const selected = filteredTokens[selectedSuggestionIndex];
        if (selected) {
          insertToken(selected.token);
        }
      } else if (e.key === "Escape") {
        setShowSuggestions(false);
      }
    }
  };

  return (
    <div className={`space-y-1 ${className}`} ref={containerRef}>
      {/* Encabezado del campo: Etiqueta y Switch Fijo / Expresión */}
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-medium text-zinc-300 select-none">
          {label}
        </label>

        {/* Toggle Mode: Fijo vs Expresión */}
        <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded p-0.5 text-[10px] font-mono">
          <button
            type="button"
            onClick={() => setMode("fixed")}
            className={`px-1.5 py-0.5 rounded transition-colors ${
              mode === "fixed"
                ? "bg-zinc-800 text-zinc-100 font-medium"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Fijo
          </button>
          <button
            type="button"
            onClick={() => setMode("expression")}
            className={`px-1.5 py-0.5 rounded transition-colors flex items-center space-x-1 ${
              mode === "expression"
                ? "bg-amber-400 text-zinc-950 font-semibold"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Braces className="w-2.5 h-2.5" />
            <span>Expresión</span>
          </button>
        </div>
      </div>

      {description && (
        <p className="text-[10px] text-zinc-500 font-sans leading-tight">
          {description}
        </p>
      )}

      {/* Zona Receptora de Drop & Entrada de Texto */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative rounded-md transition-all ${
          isDragOver
            ? "border-2 border-dashed border-amber-400 bg-amber-400/10 ring-2 ring-amber-400/20"
            : ""
        }`}
      >
        <div className="relative flex items-center">
          <input
            ref={inputRef}
            type={type === "password" && mode === "fixed" ? "password" : "text"}
            value={value || ""}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={
              mode === "expression"
                ? "Escribe expresión ej. {{steps.node_1.output.id}}"
                : placeholder
            }
            className={`w-full bg-zinc-950 border rounded px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 font-mono focus:outline-none transition-colors ${
              mode === "expression"
                ? "border-amber-500/40 focus:border-amber-400 text-amber-200"
                : "border-zinc-800 focus:border-zinc-600"
            }`}
          />
        </div>

        {/* Menú de Autocompletado Flotante al escribir {{ */}
        {showSuggestions && filteredTokens.length > 0 && (
          <div className="absolute left-0 top-full mt-1 w-full max-h-56 overflow-y-auto bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl z-50 p-1 space-y-0.5 text-xs font-mono">
            <div className="px-2 py-1 text-[9px] text-zinc-500 uppercase tracking-wider border-b border-zinc-800 flex items-center justify-between">
              <span>Variables Disponibles</span>
              <span>↑↓ para navegar · Enter para elegir</span>
            </div>
            {filteredTokens.map((token, idx) => (
              <button
                key={token.token}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertToken(token.token);
                }}
                className={`w-full text-left px-2 py-1.5 rounded flex items-center justify-between transition-colors ${
                  idx === selectedSuggestionIndex
                    ? "bg-amber-400 text-zinc-950 font-medium"
                    : "text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                <div className="truncate mr-2">
                  <div className="truncate text-[11px] font-semibold">{token.token}</div>
                  <div className={`text-[10px] truncate ${idx === selectedSuggestionIndex ? "text-zinc-800" : "text-zinc-500"}`}>
                    {token.label}
                  </div>
                </div>
                <span className={`text-[9px] px-1 py-0.2 rounded border uppercase shrink-0 ${
                  idx === selectedSuggestionIndex
                    ? "bg-zinc-950 text-white border-zinc-950"
                    : "bg-zinc-800 text-zinc-400 border-zinc-700"
                }`}>
                  {token.dataType}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Vista Previa Resuelta en Tiempo Real (Modo Expresión) */}
      {mode === "expression" && evalResult && value && (
        <div className="space-y-1">
          {evalResult.hasError ? (
            <div className="flex items-center space-x-1.5 px-2 py-1 rounded bg-rose-950/40 border border-rose-800/50 text-[10px] font-mono text-rose-300 animate-in fade-in duration-100">
              <AlertCircle className="w-3 h-3 text-rose-400 shrink-0" />
              <span className="truncate">{evalResult.error}</span>
            </div>
          ) : (
            <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800/80 text-[10px] font-mono text-zinc-300">
              <span className="text-zinc-500 shrink-0">→</span>
              <span className="text-emerald-400 font-semibold shrink-0">Valor resuelto:</span>
              <span className="truncate text-zinc-200">
                {typeof evalResult.value === "object"
                  ? JSON.stringify(evalResult.value)
                  : String(evalResult.value ?? "")}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
