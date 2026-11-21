import type { RecipeDsl } from "@rpa/dsl";

export type LayoutMode = "flow" | "split" | "full_site";
export type ActiveView = "canvas" | "steps" | "code";

export interface PublishedVersionSummary {
  id: string;
  version: number;
  definition?: RecipeDsl;
  changelog?: string;
  published_at?: string;
}

export interface DraftVersionSummary {
  id: string;
  version: number;
  definition?: RecipeDsl;
  changelog?: string;
  updated_at?: string;
}

export interface RecipeEditorData {
  id: string;
  uuid?: string;
  name: string;
  description?: string;
  version: number;
  definition: RecipeDsl;
  has_unpublished_changes?: boolean;
  published_version?: PublishedVersionSummary | null;
  draft?: DraftVersionSummary | null;
}

export interface RecipeVersionItem {
  id: string;
  version: number;
  definition?: RecipeDsl;
  changelog?: string;
  is_draft: boolean;
  is_published: boolean;
  restored_from_version?: {
    id: string;
    version: number;
  } | null;
  creator?: {
    id: number;
    name: string;
    email: string;
  } | null;
  created_at?: string;
}
