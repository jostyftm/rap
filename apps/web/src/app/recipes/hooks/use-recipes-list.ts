"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { recipesService } from "../services/recipes.service";
import { useAuth } from "../../../context/auth-context";
import { ApiError } from "../../../lib/api-client";
import { createInitialDefinition } from "../../../lib/default-recipe";
import { readRecipeFile } from "../../../lib/recipe-file";
import type { RecipeSummary } from "../types/recipes.types";

export function formatApiError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const fieldErrors = err.problem?.errors
      ? Object.entries(err.problem.errors)
          .flatMap(([field, messages]) =>
            (messages || []).map((message) => `${field}: ${message}`)
          )
          .join(" · ")
      : "";
    return fieldErrors || err.problem?.detail || err.problem?.title || fallback;
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return fallback;
}

export function useRecipesList() {
  const router = useRouter();
  const { user, logout } = useAuth();

  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadRecipes = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await recipesService.fetchRecipes();
      setRecipes(data);
    } catch (err) {
      console.error("No se pudieron cargar las recetas:", err);
      setRecipes([]);
      setLoadError(
        formatApiError(err, "No se pudieron cargar las recetas del servidor.")
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecipes();
  }, [loadRecipes]);

  const handleCreateRecipe = async () => {
    setIsCreating(true);
    setCreateError(null);
    try {
      const name = `Nueva Receta RPA #${recipes.length + 1}`;
      const newRec = await recipesService.createRecipe({
        name,
        description: "Flujo determinista creado con el editor visual",
        definition: createInitialDefinition(name),
      });
      const targetId = newRec.id || newRec.uuid;
      if (!targetId) {
        throw new Error("El backend no devolvió un identificador de receta.");
      }
      router.push(`/recipes/${targetId}/edit`);
    } catch (err) {
      console.error("No se pudo crear la receta:", err);
      setCreateError(
        formatApiError(err, "No se pudo crear la receta. Inténtalo de nuevo.")
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleImportRecipe = async (file: File) => {
    setIsImporting(true);
    setCreateError(null);
    try {
      const { data, error } = await readRecipeFile(file);
      if (error || !data) {
        throw new Error(error || "El archivo de receta no es válido.");
      }

      const res = await recipesService.importRecipe(data);
      const targetId = res.data.id || res.data.uuid;
      if (!targetId) {
        throw new Error("El backend no devolvió un identificador de receta para la importación.");
      }

      if (res.missing_secrets && res.missing_secrets.length > 0) {
        alert(
          `Receta importada con éxito.\n\nAtención: Los siguientes secretos referenciados no están definidos en este workspace:\n- ${res.missing_secrets.join("\n- ")}`
        );
      }

      router.push(`/recipes/${targetId}/edit`);
    } catch (err) {
      console.error("No se pudo importar la receta:", err);
      setCreateError(
        formatApiError(err, "No se pudo importar la receta. Verifica el archivo.")
      );
    } finally {
      setIsImporting(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  const handleDeleteRecipe = async (recipeId: string): Promise<void> => {
    await recipesService.deleteRecipe(recipeId);
    setRecipes((prev) =>
      prev.filter((r) => (r.uuid || r.id) !== recipeId && r.id !== recipeId)
    );
  };

  const clearCreateError = () => setCreateError(null);

  return {
    user,
    recipes,
    isLoading,
    isCreating,
    isImporting,
    loadError,
    createError,
    reloadRecipes: loadRecipes,
    clearCreateError,
    handleCreateRecipe,
    handleImportRecipe,
    handleDeleteRecipe,
    handleLogout,
  };
}
