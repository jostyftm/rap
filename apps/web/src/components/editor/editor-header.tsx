"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  Save,
  Play,
  RotateCcw,
  RotateCw,
  CheckCircle2,
  AlertCircle,
  Layout,
  ListOrdered,
  Code2,
  Loader2,
} from "lucide-react";
import { useRecipeStore, type EditorView } from "../../stores/use-recipe-store";
import { apiFetch } from "../../lib/api-client";

interface EditorHeaderProps {
  onSave?: () => Promise<void>;
  isSaving?: boolean;
}

export function EditorHeader({ onSave, isSaving }: EditorHeaderProps) {
  const recipeName = useRecipeStore((s) => s.recipeName);
  const setName = useRecipeStore((s) => s.setName);
  const recipeVersion = useRecipeStore((s) => s.recipeVersion);
  const activeView = useRecipeStore((s) => s.activeView);
  const setActiveView = useRecipeStore((s) => s.setActiveView);
  const validationErrors = useRecipeStore((s) => s.validationErrors);
  const undo = useRecipeStore((s) => s.undo);
  const redo = useRecipeStore((s) => s.redo);
  const isDirty = useRecipeStore((s) => s.isDirty);
  const recipeId = useRecipeStore((s) => s.recipeId);
  const definition = useRecipeStore((s) => s.definition);
  const startRun = useRecipeStore((s) => s.startRun);
  const runStatus = useRecipeStore((s) => s.runStatus);

  const [isExecuting, setIsExecuting] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleRun = async () => {
    if (!recipeId || runStatus === "running") return;
    setIsExecuting(true);
    try {
      const res = await apiFetch<{ data: { id: string } }>(
        `/api/v1/recipes/${recipeId}/runs`,
        {
          method: "POST",
          body: JSON.stringify({
            parameters: {},
          }),
        }
      );
      if (res?.data?.id) {
        startRun(res.data.id);
      }
    } catch (err) {
      console.error("Error al despachar ejecución:", err);
      // Modo local/demo fallback
      const mockRunId = `run_mock_${Math.random().toString(36).substring(2, 8)}`;
      startRun(mockRunId);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleSaveInternal = async () => {
    if (onSave) {
      await onSave();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
      return;
    }

    if (!recipeId) return;
    try {
      await apiFetch(`/api/v1/recipes/${recipeId}`, {
        method: "PUT",
        body: JSON.stringify({
          name: recipeName,
          definition,
        }),
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      console.error("Error al guardar la receta:", err);
    }
  };

  return (
    <header className="h-14 bg-neutral-900 border-b border-neutral-800 px-4 flex items-center justify-between select-none">
      {/* Lado Izquierdo: Back, Título y Versión */}
      <div className="flex items-center space-x-3">
        <Link
          href="/recipes"
          className="p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          title="Volver a la lista de recetas"
        >
          <ChevronLeft className="w-5 h-5" />
        </Link>

        <div className="h-5 w-px bg-neutral-800" />

        <div className="flex items-center space-x-2">
          <input
            type="text"
            value={recipeName}
            onChange={(e) => setName(e.target.value)}
            className="bg-transparent hover:bg-neutral-950/40 focus:bg-neutral-950 font-semibold text-sm text-neutral-100 px-2 py-1 rounded border border-transparent hover:border-neutral-800 focus:border-blue-500 transition-all max-w-xs truncate outline-none"
          />
          <span className="px-2 py-0.5 rounded-full bg-neutral-800 text-[10px] font-mono text-neutral-400 font-semibold">
            v{recipeVersion}
          </span>
          {isDirty && (
            <span className="w-2 h-2 rounded-full bg-amber-400" title="Cambios sin guardar" />
          )}
        </div>

        {/* Indicador de Validez del DSL */}
        <div className="hidden lg:flex items-center pl-2">
          {validationErrors.length === 0 ? (
            <div className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>DSL Válido</span>
            </div>
          ) : (
            <div
              title={validationErrors.join("\n")}
              className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[11px] font-medium cursor-help"
            >
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{validationErrors.length} errores</span>
            </div>
          )}
        </div>
      </div>

      {/* Centro: Selector de Vistas (Lienzo / Pasos / Código) */}
      <div className="flex items-center rounded-lg bg-neutral-950 border border-neutral-800 p-0.5">
        <button
          onClick={() => setActiveView("canvas")}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            activeView === "canvas"
              ? "bg-neutral-800 text-white shadow-sm"
              : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          <Layout className="w-3.5 h-3.5" />
          <span>Lienzo</span>
        </button>
        <button
          onClick={() => setActiveView("steps")}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            activeView === "steps"
              ? "bg-neutral-800 text-white shadow-sm"
              : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          <ListOrdered className="w-3.5 h-3.5" />
          <span>Pasos</span>
        </button>
        <button
          onClick={() => setActiveView("code")}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            activeView === "code"
              ? "bg-neutral-800 text-white shadow-sm"
              : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          <Code2 className="w-3.5 h-3.5" />
          <span>Código</span>
        </button>
      </div>

      {/* Lado Derecho: Undo / Redo / Guardar / Ejecutar */}
      <div className="flex items-center space-x-2">
        <div className="flex items-center space-x-1">
          <button
            onClick={undo}
            title="Deshacer (Ctrl+Z)"
            className="p-1.5 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={redo}
            title="Rehacer (Ctrl+Y)"
            className="p-1.5 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>

        <div className="h-5 w-px bg-neutral-800 mx-1" />

        <button
          onClick={handleSaveInternal}
          disabled={isSaving}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium transition-all disabled:opacity-50"
        >
          {isSaving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-neutral-400" />
          ) : (
            <Save className={`w-3.5 h-3.5 ${saveSuccess ? "text-emerald-400" : ""}`} />
          )}
          <span>{saveSuccess ? "¡Guardado!" : "Guardar"}</span>
        </button>

        <button
          onClick={handleRun}
          disabled={isExecuting || runStatus === "running" || validationErrors.length > 0}
          className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold shadow-md transition-all"
        >
          {isExecuting || runStatus === "running" ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5 fill-current" />
          )}
          <span>Ejecutar Flujo</span>
        </button>
      </div>
    </header>
  );
}
