"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useParams } from "next/navigation";
import { useRecipeStore } from "../../../../stores/use-recipe-store";
import { EditorHeader } from "../../../../components/editor/editor-header";
import { NodePalette } from "../../../../components/editor/node-palette";
import { FlowCanvas } from "../../../../components/editor/flow-canvas";
import { NodeInspector } from "../../../../components/editor/node-inspector";
import { StepList } from "../../../../components/editor/step-list";
import { CodeEditor } from "../../../../components/editor/code-editor";
import { ExecutionConsole } from "../../../../components/editor/execution-console";
import { apiFetch } from "../../../../lib/api-client";
import { Loader2 } from "lucide-react";


function RecipeEditorContent() {
  const params = useParams();
  const recipeId = params?.id as string;

  const setRecipe = useRecipeStore((s) => s.setRecipe);
  const activeView = useRecipeStore((s) => s.activeView);
  const definition = useRecipeStore((s) => s.definition);
  const recipeName = useRecipeStore((s) => s.recipeName);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function loadRecipe() {
      if (!recipeId) return;
      try {
        const res = await apiFetch<any>(`/api/v1/recipes/${recipeId}`);
        if (res?.data) {
          const rec = res.data;
          setRecipe({
            id: rec.id || rec.uuid || recipeId,
            name: rec.name,
            description: rec.description,
            version: rec.latest_version?.version || 1,
            definition: rec.latest_version?.definition || useRecipeStore.getState().definition,
          });
        }
      } catch (err) {
        console.warn("No se pudo cargar la receta del backend, usando estado inicial:", err);
      } finally {
        setIsLoading(false);
      }
    }

    loadRecipe();
  }, [recipeId, setRecipe]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await apiFetch(`/api/v1/recipes/${recipeId}`, {
        method: "PUT",
        body: JSON.stringify({
          name: recipeName,
          definition,
        }),
      });
    } catch (err) {
      console.error("Error al guardar:", err);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-neutral-950 flex flex-col items-center justify-center text-neutral-400 space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <p className="text-xs font-medium">Cargando editor RPA Studio...</p>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-neutral-950 text-neutral-100 overflow-hidden">
      {/* 1. Header con navegación, vista y controles */}
      <EditorHeader onSave={handleSave} isSaving={isSaving} />

      {/* 2. Área Central de Trabajo (3 Paneles sincronizados) */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Panel Izquierdo: Paleta de Bloques (en modo lienzo) */}
        {activeView === "canvas" && <NodePalette />}

        {/* Panel Central: Según la pestaña activa */}
        <main className="flex-1 h-full overflow-hidden flex flex-col relative">
          {activeView === "canvas" && <FlowCanvas />}
          {activeView === "steps" && <StepList />}
          {activeView === "code" && <CodeEditor />}
        </main>

        {/* Panel Derecho: Inspector de Nodos y Localizadores */}
        {activeView !== "code" && <NodeInspector />}
      </div>

      {/* 3. Consola de Ejecución en Tiempo Real (Reverb + Logs + Capturas) */}
      <ExecutionConsole />
    </div>
  );
}

export default function RecipeEditorPage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen w-screen bg-neutral-950 flex flex-col items-center justify-center text-neutral-400 space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <p className="text-xs font-medium">Cargando editor RPA Studio...</p>
        </div>
      }
    >
      <RecipeEditorContent />
    </Suspense>
  );
}
