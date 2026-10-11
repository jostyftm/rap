import { apiFetch } from "@/lib/api-client";
import type { RecipeSummary, CreateRecipePayload } from "../types/recipes.types";

export const DEFAULT_SAMPLE_RECIPES: RecipeSummary[] = [
  {
    id: "01a128f6-0067-7363-8b33-d359a5f9fe2f",
    uuid: "01a128f6-0067-7363-8b33-d359a5f9fe2f",
    name: "Automatización de Inicio de Sesión y Dashboard",
    description: "Flujo base para autenticarse, esperar la carga de sesión y extraer métricas clave.",
    status: "active",
    created_at: "Hace 2 horas",
    latest_version: {
      version: 1,
    },
  },
  {
    id: "01a128f6-0067-7363-8b33-d359a5f9fe30",
    uuid: "01a128f6-0067-7363-8b33-d359a5f9fe30",
    name: "Extracción de Catálogo y Precios",
    description: "Recorre las páginas de productos, extrae nombres y precios con selectores de respaldo automáticos.",
    status: "active",
    created_at: "Ayer",
    latest_version: {
      version: 2,
    },
  },
];

export const recipesService = {
  async fetchRecipes(): Promise<RecipeSummary[]> {
    try {
      const wsRes = await apiFetch<any>("/api/v1/workspaces");
      const firstWs = wsRes?.data?.[0];
      if (firstWs) {
        const prjRes = await apiFetch<any>(
          `/api/v1/workspaces/${firstWs.uuid || firstWs.id}/projects`
        );
        const firstPrj = prjRes?.data?.[0];
        if (firstPrj) {
          const recRes = await apiFetch<any>(
            `/api/v1/projects/${firstPrj.uuid || firstPrj.id}/recipes`
          );
          if (recRes?.data && recRes.data.length > 0) {
            return recRes.data;
          }
        }
      }
    } catch (err) {
      console.warn("No se pudieron cargar recetas del backend, usando muestras:", err);
    }
    return DEFAULT_SAMPLE_RECIPES;
  },

  async createRecipe(payload: CreateRecipePayload): Promise<RecipeSummary> {
    try {
      const wsRes = await apiFetch<any>("/api/v1/workspaces");
      const firstWs = wsRes?.data?.[0];
      const prjRes = await apiFetch<any>(
        `/api/v1/workspaces/${firstWs?.uuid || firstWs?.id}/projects`
      );
      const firstPrj = prjRes?.data?.[0];

      if (firstPrj) {
        const newRec = await apiFetch<any>(
          `/api/v1/projects/${firstPrj.uuid || firstPrj.id}/recipes`,
          {
            method: "POST",
            body: JSON.stringify({
              name: payload.name,
              description: payload.description,
              definition: payload.definition,
            }),
          }
        );
        if (newRec?.data) {
          return newRec.data;
        }
      }
    } catch (err) {
      console.warn("Fallo creación en backend, usando identificador generado:", err);
    }

    const randomId = `rec_${Math.random().toString(36).substring(2, 8)}`;
    return {
      id: randomId,
      uuid: randomId,
      name: payload.name,
      description: payload.description,
      status: "draft",
      created_at: "Ahora",
      latest_version: {
        version: 1,
        definition: payload.definition,
      },
    };
  },
};
