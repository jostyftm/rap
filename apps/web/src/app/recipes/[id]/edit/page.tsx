"use client";

import React, { Suspense } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { EditorHeader } from "@/components/editor/editor-header";
import { NodePalette } from "@/components/editor/node-palette";
import { FlowCanvas } from "@/components/editor/flow-canvas";
import { FlowErrorBoundary } from "@/components/editor/flow-error-boundary";
import { NodeInspector } from "@/components/editor/node-inspector";
import { StepList } from "@/components/editor/step-list";
import { CodeEditor } from "@/components/editor/code-editor";
import { ExecutionConsole } from "@/components/editor/execution-console";
import { RecorderBar } from "@/components/editor/recorder-bar";
import { LiveSitePanel } from "@/components/editor/live-site-panel";
import { NodeDetailModal } from "@/components/editor/detail/node-detail-modal";
import { Loader2, Plus } from "lucide-react";
import { useRecipeEditor } from "./hooks/use-recipe-editor";
import { useSplitResizer } from "./hooks/use-split-resizer";

function RecipeEditorContent() {
  const params = useParams();
  const recipeId = (params?.id as string) || "";

  const {
    isLoading,
    isSaving,
    loadError,
    notFound,
    activeView,
    selectedNodeId,
    liveOpen,
    layoutMode,
    isPaletteCollapsed,
    togglePaletteCollapsed,
    handleSave,
  } = useRecipeEditor(recipeId);

  const {
    splitRatio,
    setSplitRatio,
    isDraggingSplit,
    splitContainerRef,
    splitAreaRef,
    handleMouseDownSplit,
  } = useSplitResizer();

  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-[#09090b] flex flex-col items-center justify-center text-zinc-400 space-y-3">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
        <p className="text-xs font-mono">Cargando editor RPA Studio...</p>
      </div>
    );
  }

  if (loadError || notFound) {
    return (
      <div className="h-screen w-screen bg-[#09090b] flex flex-col items-center justify-center text-zinc-300 space-y-4 px-6 text-center">
        <p className="text-sm font-medium">
          {notFound ? "Receta no encontrada" : "No se pudo cargar la receta"}
        </p>
        <p className="text-xs text-zinc-500 max-w-md">
          {notFound
            ? "El identificador no corresponde a ninguna receta existente."
            : loadError}
        </p>
        <div className="flex items-center gap-2">
          <Link
            href="/recipes"
            className="text-xs font-medium px-3 py-1.5 rounded-md bg-zinc-100 hover:bg-white text-zinc-950 transition-colors"
          >
            Volver a mis recetas
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-[#09090b] text-zinc-100 overflow-hidden select-none">
      {/* 1. Header con navegación, vista y controles */}
      <EditorHeader onSave={handleSave} isSaving={isSaving} />

      {/* 1.1 Barra flotante de grabación interactiva */}
      <RecorderBar />

      {/* 2. Área Central de Trabajo (Flujo / Dividido / Sitio Completo) */}
      <div ref={splitContainerRef} className="flex-1 flex overflow-hidden relative">
        {/* CASO A: Sitio Completo */}
        {layoutMode === "full_site" && liveOpen ? (
          <>
            <div className="flex-1 h-full overflow-hidden flex">
              <LiveSitePanel />
            </div>
            {activeView !== "code" && selectedNodeId && <NodeInspector />}
          </>
        ) : layoutMode === "split" && liveOpen ? (
          /* CASO B: Dividido */
          <>
            {activeView === "canvas" && !isPaletteCollapsed && <NodePalette />}

            <div ref={splitAreaRef} className="flex-1 h-full flex overflow-hidden min-w-0">
              <main
                style={{ flex: `${splitRatio} 1 0%` }}
                className="h-full overflow-hidden flex flex-col relative min-w-0"
              >
                {activeView === "canvas" && isPaletteCollapsed && (
                  <button
                    onClick={togglePaletteCollapsed}
                    title="Mostrar bloques de automatización (Ctrl+B)"
                    className="absolute top-3 left-3 z-20 flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md bg-zinc-900/90 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 shadow-md backdrop-blur transition-colors text-xs font-medium"
                  >
                    <Plus className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Bloques</span>
                    <span className="text-[10px] text-zinc-500 font-mono">Ctrl+B</span>
                  </button>
                )}
                {activeView === "canvas" && (
                  <FlowErrorBoundary>
                    <FlowCanvas />
                  </FlowErrorBoundary>
                )}
                {activeView === "steps" && <StepList />}
                {activeView === "code" && <CodeEditor />}
              </main>

              {/* Separador arrastrable (Gutter) */}
              <div
                onMouseDown={handleMouseDownSplit}
                title="Arrastra para redimensionar el panel (o doble clic para resetear)"
                onDoubleClick={() => setSplitRatio(50)}
                className={`w-2 h-full cursor-col-resize flex items-center justify-center transition-colors z-20 shrink-0 ${
                  isDraggingSplit
                    ? "bg-zinc-600 shadow-sm"
                    : "bg-zinc-900 border-x border-zinc-800 hover:bg-zinc-700"
                }`}
              >
                <div className="w-0.5 h-8 bg-zinc-600 rounded-full" />
              </div>

              {/* Panel Sitio en Vivo */}
              <div
                style={{ flex: `${100 - splitRatio} 1 0%` }}
                className="h-full overflow-hidden flex min-w-0"
              >
                <LiveSitePanel />
              </div>
            </div>

            {/* Inspector anclado a la derecha */}
            {activeView !== "code" && selectedNodeId && <NodeInspector />}
          </>
        ) : (
          /* CASO C: Flujo Estándar */
          <>
            {activeView === "canvas" && !isPaletteCollapsed && <NodePalette />}

            <main className="flex-1 h-full overflow-hidden flex flex-col relative min-w-0">
              {activeView === "canvas" && isPaletteCollapsed && (
                <button
                  onClick={togglePaletteCollapsed}
                  title="Mostrar bloques de automatización (Ctrl+B)"
                  className="absolute top-3 left-3 z-20 flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-neutral-900/90 hover:bg-neutral-850 text-neutral-200 border border-neutral-800 shadow-xl backdrop-blur transition-all text-xs font-medium hover:border-neutral-700 active:scale-95"
                >
                  <Plus className="w-3.5 h-3.5 text-blue-400" />
                  <span>Bloques</span>
                  <span className="text-[10px] text-neutral-500 font-mono">Ctrl+B</span>
                </button>
              )}
              {activeView === "canvas" && (
                <FlowErrorBoundary>
                  <FlowCanvas />
                </FlowErrorBoundary>
              )}
              {activeView === "steps" && <StepList />}
              {activeView === "code" && <CodeEditor />}
            </main>

            {liveOpen && (
              <div className="w-[480px] lg:w-[560px] h-full overflow-hidden flex shrink-0 border-l border-neutral-800">
                <LiveSitePanel />
              </div>
            )}

            {activeView !== "code" && selectedNodeId && <NodeInspector />}
          </>
        )}

        {/* Overlay invisible durante el arrastre */}
        {isDraggingSplit && (
          <div className="fixed inset-0 z-50 cursor-col-resize select-none pointer-events-auto" />
        )}
      </div>

      {/* 3. Consola de Ejecución en Tiempo Real */}
      <ExecutionConsole />

      {/* 4. Modal de Edición de Nodo Estilo n8n */}
      <NodeDetailModal />
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
