export type Role = "owner" | "admin" | "editor" | "viewer";

export interface WorkspaceSettings {
  allowed_domains?: string[];
  cost_limit_usd_monthly?: number;
  llm?: {
    provider?: string;
    model?: string | null;
  };
  artifact_retention_days?: number;
}

export interface Workspace {
  id: string; // UUID
  name: string;
  slug: string;
  role?: Role;
  settings?: WorkspaceSettings;
}

export interface User {
  id: string; // UUID
  name: string;
  email: string;
  workspaces?: Workspace[];
}

export interface Project {
  id: string; // UUID
  name: string;
  description?: string | null;
  created_at?: string;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  errors?: Record<string, string[]>;
}

export interface ApiResponse<T> {
  data: T;
}
