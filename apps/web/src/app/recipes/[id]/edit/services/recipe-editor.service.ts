import { apiFetch } from "@/lib/api-client";
import type { RecipeEditorData } from "../types/editor.types";
import type { RecipeDsl } from "@rpa/dsl";

export const recipeEditorService = {
  async fetchRecipeById(recipeId: string): Promise<RecipeEditorData | null> {
    try {
      const res = await apiFetch<any>(`/api/v1/recipes/${recipeId}`);
      if (res?.data) {
        const rec = res.data;
        return {
          id: rec.id || rec.uuid || recipeId,
          uuid: rec.uuid,
          name: rec.name,
          description: rec.description,
          version: rec.latest_version?.version || 1,
          definition: rec.latest_version?.definition,
        };
      }
      return null;
    } catch (err) {
      console.warn(`No se pudo cargar la receta ${recipeId} del backend:`, err);
      return null;
    }
  },

  async saveRecipe(
    recipeId: string,
    name: string,
    definition: RecipeDsl
  ): Promise<boolean> {
    if (!recipeId || recipeId === "new") return false;
    try {
      await apiFetch(`/api/v1/recipes/${recipeId}`, {
        method: "PUT",
        body: JSON.stringify({
          name,
          definition,
        }),
      });
      return true;
    } catch (err) {
      console.warn("Fallo al guardar la receta en el backend:", err);
      return false;
    }
  },
};
