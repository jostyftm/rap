export interface RecipeSummary {
  id: string;
  uuid?: string;
  name: string;
  description?: string;
  status: string;
  created_at?: string;
  latest_version?: {
    version: number;
    definition?: any;
  };
}

export interface CreateRecipePayload {
  name: string;
  description?: string;
  definition?: any;
}
