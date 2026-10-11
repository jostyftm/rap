export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  role: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  workspaces?: WorkspaceSummary[];
}

export interface AuthResponse {
  token?: string;
  data: AuthUser;
}
