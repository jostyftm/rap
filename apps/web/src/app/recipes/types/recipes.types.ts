import type { RecipeDsl } from "@rpa/dsl";

export interface RecipeSummary {
  id: string;
  uuid?: string;
  name: string;
  description?: string;
  status: string;
  created_at?: string;
  published_at?: string;
  has_unpublished_changes?: boolean;
  published_version?: {
    id?: string;
    version: number;
    definition?: RecipeDsl;
    changelog?: string;
    published_at?: string;
  } | null;
  draft?: {
    id?: string;
    version: number;
    definition?: RecipeDsl;
    changelog?: string;
  } | null;
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
