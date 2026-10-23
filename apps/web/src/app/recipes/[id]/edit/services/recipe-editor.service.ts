import { apiFetch, ApiError } from "@/lib/api-client";
import type { RecipeEditorData } from "../types/editor.types";
import type { RecipeDsl } from "@rpa/dsl";

export const recipeEditorService = {
  /**
   * Carga una receta. Devuelve `null` si el backend responde 404; cualquier
   * otro error (red, 401, 500) se propaga para que la UI lo muestre.
   */
  async fetchRecipeById(recipeId: string): Promise<RecipeEditorData | null> {
    if (!recipeId || recipeId === "new") {
      return null;
    }

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
      if (err instanceof ApiError && err.problem?.status === 404) {
        return null;
      }
      throw err;
    }
  },

  /**
   * Guarda la receta. Lanza el error del backend (404, 422, red) en vez de
   * devolver `false`, para que la UI nunca marque "Guardado" en un fallo.
   */
  async saveRecipe(
    recipeId: string,
    name: string,
    definition: RecipeDsl
  ): Promise<void> {
    if (!recipeId || recipeId === "new") {
      throw new Error("La receta aún no existe en el servidor.");
    }

    await apiFetch(`/api/v1/recipes/${recipeId}`, {
      method: "PUT",
      body: JSON.stringify({
        name,
        definition,
      }),
    });
  },
};
