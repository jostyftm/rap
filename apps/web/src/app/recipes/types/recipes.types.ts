import type { RecipeDsl } from "@rpa/dsl";

export interface RecipeSummary {
  id: string;
  uuid?: string;
  name: string;
  description?: string;
  status: string;
  created_at?: string;
  latest_version?: {
    version: number;
    definition?: RecipeDsl;
  };
}

export interface CreateRecipePayload {
  name: string;
  description?: string;
  definition: RecipeDsl;
}
