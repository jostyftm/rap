import type { RecipeDsl } from "@rpa/dsl";

export type LayoutMode = "flow" | "split" | "full_site";
export type ActiveView = "canvas" | "steps" | "code";

export interface RecipeEditorData {
  id: string;
  uuid?: string;
  name: string;
  description?: string;
  version: number;
  definition: RecipeDsl;
}
