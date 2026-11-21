import { apiFetch, ApiError } from "@/lib/api-client";
import type { RecipeEditorData, RecipeVersionItem } from "../types/editor.types";
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
        // La definición a editar es la del borrador (draft); si no hay borrador, la publicada o latest
        const definition =
          rec.draft?.definition ||
          rec.published_version?.definition ||
          rec.latest_version?.definition;

        return {
          id: rec.id || rec.uuid || recipeId,
          uuid: rec.uuid,
          name: rec.name,
          description: rec.description,
          version: rec.published_version?.version || rec.latest_version?.version || 1,
          definition,
          has_unpublished_changes: !!rec.has_unpublished_changes,
          published_version: rec.published_version || null,
          draft: rec.draft || null,
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
   * Guarda la receta (actualiza el borrador en modo edición).
   */
  async saveRecipe(
    recipeId: string,
    name: string,
    definition: RecipeDsl
  ): Promise<any> {
    if (!recipeId || recipeId === "new") {
      throw new Error("La receta aún no existe en el servidor.");
    }

    const res = await apiFetch<any>(`/api/v1/recipes/${recipeId}`, {
      method: "PUT",
      body: JSON.stringify({
        name,
        definition,
      }),
    });

    return res?.data;
  },

  /**
   * Publica el borrador actual como una nueva versión inmutable.
   */
  async publishRecipe(recipeId: string, changelog?: string): Promise<any> {
    const res = await apiFetch<any>(`/api/v1/recipes/${recipeId}/publish`, {
      method: "POST",
      body: JSON.stringify({
        changelog: changelog || undefined,
      }),
    });

    return res?.data;
  },

  /**
   * Obtiene la lista de versiones publicadas para el historial.
   */
  async fetchVersions(recipeId: string): Promise<RecipeVersionItem[]> {
    const res = await apiFetch<{ data: RecipeVersionItem[] }>(
      `/api/v1/recipes/${recipeId}/versions`
    );
    return res?.data || [];
  },

  /**
   * Obtiene el detalle de una versión específica.
   */
  async fetchVersionDetail(
    recipeId: string,
    versionNumber: number
  ): Promise<RecipeVersionItem> {
    const res = await apiFetch<{ data: RecipeVersionItem }>(
      `/api/v1/recipes/${recipeId}/versions/${versionNumber}`
    );
    return res?.data;
  },

  /**
   * Retrocede a una versión anterior creando una nueva versión publicada y actualizando el borrador.
   */
  async restoreVersion(recipeId: string, versionNumber: number): Promise<any> {
    const res = await apiFetch<any>(
      `/api/v1/recipes/${recipeId}/versions/${versionNumber}/restore`,
      {
        method: "POST",
      }
    );
    return res?.data;
  },

  /**
   * Exporta la receta (borrador o versión específica) como objeto JSON.
   */
  async exportRecipeJson(
    recipeId: string,
    versionNumber?: number
  ): Promise<any> {
    const query = versionNumber !== undefined ? `?version=${versionNumber}` : "";
    const res = await apiFetch<any>(`/api/v1/recipes/${recipeId}/export${query}`);
    return res;
  },

  /**
   * Importa un JSON reemplazando el borrador actual.
   */
  async importIntoDraft(
    recipeId: string,
    data: any
  ): Promise<{ data: any; missing_secrets: string[] }> {
    const res = await apiFetch<{ data: any; missing_secrets: string[] }>(
      `/api/v1/recipes/${recipeId}/import`,
      {
        method: "POST",
        body: JSON.stringify({ data }),
      }
    );
    return res;
  },
};
