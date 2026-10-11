"use client";

import { useState, useEffect, useCallback } from "react";
import { useRecipeStore } from "@/stores/use-recipe-store";
import { useLiveStore } from "@/stores/use-live-store";
import { useLayoutStore } from "@/stores/use-layout-store";
import { recipeEditorService } from "../services/recipe-editor.service";

export function useRecipeEditor(recipeId: string) {
  const setRecipe = useRecipeStore((s) => s.setRecipe);
  const recipeName = useRecipeStore((s) => s.recipeName);
  const definition = useRecipeStore((s) => s.definition);
  const activeView = useRecipeStore((s) => s.activeView);
  const selectedNodeId = useRecipeStore((s) => s.selectedNodeId);

  const liveOpen = useLiveStore((s) => s.isOpen);
  const layoutMode = useLayoutStore((s) => s.mode);
  const cycleLayoutMode = useLayoutStore((s) => s.cycleLayoutMode);
  const isPaletteCollapsed = useLayoutStore((s) => s.isPaletteCollapsed);
  const togglePaletteCollapsed = useLayoutStore((s) => s.togglePaletteCollapsed);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Cargar receta del backend
  useEffect(() => {
    async function load() {
      if (!recipeId) return;
      const data = await recipeEditorService.fetchRecipeById(recipeId);
      if (data) {
        setRecipe({
          id: data.id,
          name: data.name,
          description: data.description || "",
          version: data.version,
          definition: data.definition || useRecipeStore.getState().definition,
        });
      }
      setIsLoading(false);
    }

    load();
  }, [recipeId, setRecipe]);

  // Guardar receta
  const handleSave = useCallback(async () => {
    if (!recipeId) return;
    setIsSaving(true);
    try {
      await recipeEditorService.saveRecipe(recipeId, recipeName, definition);
    } finally {
      setIsSaving(false);
    }
  }, [recipeId, recipeName, definition]);

  // Atajos de teclado: Ctrl+\ o Cmd+\ (layout) y Ctrl+B (paleta) y Ctrl+S (guardar)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "\\") {
          e.preventDefault();
          cycleLayoutMode();
        } else if (e.key.toLowerCase() === "b") {
          e.preventDefault();
          togglePaletteCollapsed();
        } else if (e.key.toLowerCase() === "s") {
          e.preventDefault();
          handleSave();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cycleLayoutMode, togglePaletteCollapsed, handleSave]);

  // Sincronizar apertura de LiveSitePanel si el layout cambia a split o full_site
  useEffect(() => {
    if ((layoutMode === "split" || layoutMode === "full_site") && !liveOpen) {
      useLiveStore.getState().open();
    }
  }, [layoutMode, liveOpen]);

  return {
    isLoading,
    isSaving,
    activeView,
    selectedNodeId,
    liveOpen,
    layoutMode,
    isPaletteCollapsed,
    togglePaletteCollapsed,
    handleSave,
  };
}
