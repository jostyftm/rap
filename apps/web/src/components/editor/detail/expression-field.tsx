"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { Braces, AlertCircle } from "lucide-react";
import { useRecipeStore } from "@/stores/use-recipe-store";
import { cn } from "@/lib/utils";
import {
  resolveExpression,
  getAvailableExpressionTokens,
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
      // Sincronizar el modo con el valor externo es intencional.
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
        <label className="select-none text-[12px] font-medium text-fg">
          {label}
        </label>

        {/* Toggle de modo: Fijo vs Expresión */}
        <div
          role="group"
          aria-label="Modo del valor"
          className="flex items-center rounded-control border border-line bg-panel p-0.5 text-[10.5px]"
        >
          <button
            type="button"
            aria-pressed={mode === "fixed"}
            onClick={() => setMode("fixed")}
            className={cn(
              "rounded-[6px] px-2 py-1 font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
              mode === "fixed"
                ? "bg-raised text-fg shadow-[var(--shadow-card)]"
                : "text-fg-muted hover:text-fg"
            )}
          >
            Fijo
          </button>
          <button
            type="button"
            aria-pressed={mode === "expression"}
            onClick={() => setMode("expression")}
            className={cn(
              "flex items-center gap-1 rounded-[6px] px-2 py-1 transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
              mode === "expression"
                ? "bg-accent-soft text-accent-text shadow-[var(--shadow-card)]"
                : "text-fg-muted hover:text-fg"
            )}
          >
            <Braces className="h-2.5 w-2.5" />
            <span>Expresión</span>
          </button>
        </div>
      </div>

      {description && (
        <p className="text-[11.5px] leading-relaxed text-fg-subtle">
          {description}
        </p>
      )}

      {/* Zona Receptora de Drop & Entrada de Texto */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative rounded-field transition-all",
          isDragOver && "bg-accent-soft ring-2 ring-accent/40 ring-offset-2 ring-offset-raised"
        )}
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
            aria-label={label}
            className={cn(
              "h-10 w-full rounded-field border bg-input px-3.5 font-mono text-[13px] text-fg",
              "placeholder:text-fg-subtle shadow-[inset_0_1px_0_rgb(255_255_255/0.02)]",
              "transition-[border-color,box-shadow,background-color] duration-150",
              "hover:border-line-strong focus:outline-none focus:ring-4 focus:ring-accent/15",
              mode === "expression"
                ? "border-accent/50 focus:border-accent"
                : "border-line focus:border-accent"
            )}
          />
        </div>

        {/* Menú de Autocompletado Flotante al escribir {{ */}
        {showSuggestions && filteredTokens.length > 0 && (
          <div className="absolute left-0 top-full z-50 mt-1 max-h-56 w-full space-y-0.5 overflow-y-auto rounded-card border border-line bg-raised p-1 font-mono text-xs shadow-[var(--shadow-modal)]">
            <div className="flex items-center justify-between border-b border-line px-2 py-1 text-[9px] uppercase tracking-wider text-fg-subtle">
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
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left transition-colors",
                  idx === selectedSuggestionIndex
                    ? "bg-accent text-accent-ink font-medium"
                    : "text-fg hover:bg-hover"
                )}
              >
                <div className="truncate mr-2">
                  <div className="truncate text-[11px] font-semibold">{token.token}</div>
                  <div className={cn("truncate text-[10px]", idx === selectedSuggestionIndex ? "text-accent-ink/80" : "text-fg-subtle")}>
                    {token.label}
                  </div>
                </div>
                <span className={cn(
                  "shrink-0 rounded border px-1 py-0.5 text-[9px] uppercase",
                  idx === selectedSuggestionIndex
                    ? "border-accent-ink/20 bg-accent-ink text-white"
                    : "border-line bg-card text-fg-muted"
                )}>
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
            <div className="flex items-center gap-1.5 rounded-control border border-danger/25 bg-danger-soft px-2 py-1 font-mono text-[10px] text-danger-text">
              <AlertCircle className="h-3 w-3 shrink-0" />
              <span className="truncate">{evalResult.error}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 rounded-control border border-line bg-card px-2 py-1 font-mono text-[10px] text-fg-muted">
              <span className="shrink-0 text-fg-subtle">→</span>
              <span className="shrink-0 font-semibold text-success-text">Valor resuelto:</span>
              <span className="truncate text-fg">
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
