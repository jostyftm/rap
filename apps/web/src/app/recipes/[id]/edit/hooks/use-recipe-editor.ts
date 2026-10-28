"use client";

import { useState, useEffect, useCallback } from "react";
import { reconcileRecipeRoot } from "@rpa/dsl";
import { useRecipeStore } from "@/stores/use-recipe-store";
import { useLiveStore } from "@/stores/use-live-store";
import { useLayoutStore } from "@/stores/use-layout-store";
import { recipeEditorService } from "../services/recipe-editor.service";

export function useRecipeEditor(recipeId: string) {
  const setRecipe = useRecipeStore((s) => s.setRecipe);
  const resetRecipe = useRecipeStore((s) => s.resetRecipe);
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Cargar receta del backend
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!recipeId) {
        resetRecipe();
        setNotFound(true);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setLoadError(null);
      setNotFound(false);

      try {
        const data = await recipeEditorService.fetchRecipeById(recipeId);
        if (cancelled) return;

        if (!data) {
          // Receta inexistente o ID inválido: limpiar el editor para no
          // mostrar la receta que se estaba editando antes.
          resetRecipe();
          setNotFound(true);
          return;
        }

        setRecipe({
          id: data.id,
          name: data.name,
          description: data.description || "",
          version: data.version,
          definition: data.definition || useRecipeStore.getState().definition,
        });
      } catch (err) {
        if (cancelled) return;
        resetRecipe();
        setLoadError(
          err instanceof Error
            ? err.message
            : "No se pudo cargar la receta del servidor."
        );
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [recipeId, setRecipe, resetRecipe]);

  // Guardar receta. Devuelve `true` solo si el backend confirmó el guardado.
  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!recipeId || recipeId === "new" || notFound) {
      return false;
    }

    const currentStore = useRecipeStore.getState();
    let safeDef = reconcileRecipeRoot(currentStore.definition);
    const nodeKeys = Object.keys(safeDef.nodes || {});
    if (nodeKeys.length > 0 && (!safeDef.entry || !safeDef.nodes[safeDef.entry])) {
      safeDef = {
        ...safeDef,
        entry: nodeKeys[0],
      };
    }

    if (safeDef.entry !== currentStore.definition.entry) {
      useRecipeStore.setState({ definition: safeDef });
    }

    setIsSaving(true);
    try {
      await recipeEditorService.saveRecipe(recipeId, currentStore.recipeName, safeDef);
      return true;
    } catch (err) {
      console.error("Error al guardar la receta:", err);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [recipeId, notFound]);

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
    loadError,
    notFound,
    activeView,
    selectedNodeId,
    liveOpen,
    layoutMode,
    isPaletteCollapsed,
    togglePaletteCollapsed,
    handleSave,
  };
}
