import { apiFetch } from "@/lib/api-client";
import type { RecipeSummary, CreateRecipePayload } from "../types/recipes.types";

interface WorkspaceSummary {
  id?: string;
  uuid?: string;
}

interface ProjectSummary {
  id?: string;
  uuid?: string;
}

function scopeId(item?: WorkspaceSummary | ProjectSummary | null): string | undefined {
  return item?.uuid || item?.id;
}

/**
 * Resuelve el workspace y proyecto por defecto.
 *
 * La aplicación actual trabaja con un único workspace/proyecto, pero si no
 * existe debemos fallar de forma explícita en vez de enviar requests a rutas
 * con `undefined`.
 */
export async function resolveDefaultProject(): Promise<{
  workspaceId: string;
  projectId: string;
}> {
  const wsRes = await apiFetch<{ data?: WorkspaceSummary[] }>("/api/v1/workspaces");
  const workspaceId = scopeId(wsRes?.data?.[0]);
  if (!workspaceId) {
    throw new Error("No hay ningún workspace disponible.");
  }

  const prjRes = await apiFetch<{ data?: ProjectSummary[] }>(
    `/api/v1/workspaces/${workspaceId}/projects`
  );
  const projectId = scopeId(prjRes?.data?.[0]);
  if (!projectId) {
    throw new Error("No hay ningún proyecto disponible en el workspace.");
  }

  return { workspaceId, projectId };
}

export const recipesService = {
  async fetchRecipes(): Promise<RecipeSummary[]> {
    const { projectId } = await resolveDefaultProject();
    const recRes = await apiFetch<{ data?: RecipeSummary[] }>(
      `/api/v1/projects/${projectId}/recipes`
    );
    return recRes?.data ?? [];
  },

  async createRecipe(payload: CreateRecipePayload): Promise<RecipeSummary> {
    if (!payload.definition) {
      throw new Error("La definición DSL es obligatoria para crear una receta.");
    }

    const { projectId } = await resolveDefaultProject();
    const newRec = await apiFetch<{ data?: RecipeSummary }>(
      `/api/v1/projects/${projectId}/recipes`,
      {
        method: "POST",
        body: JSON.stringify({
          name: payload.name,
          description: payload.description,
          definition: payload.definition,
        }),
      }
    );

    if (!newRec?.data?.id) {
      throw new Error("El backend no devolvió la receta creada.");
    }

    return newRec.data;
  },
};
