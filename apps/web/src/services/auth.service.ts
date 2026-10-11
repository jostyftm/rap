import { apiFetch } from "@/lib/api-client";
import type { AuthResponse, AuthUser } from "@/types/auth.types";

export const authService = {
  async login(email: string, password: string): Promise<AuthResponse> {
    const res = await apiFetch<AuthResponse>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    return res;
  },

  async logout(): Promise<void> {
    try {
      await apiFetch("/api/v1/auth/logout", { method: "POST" });
    } catch {
      // Ignorar errores al cerrar sesión
    }
  },

  async getCurrentUser(): Promise<AuthUser | null> {
    try {
      const res = await apiFetch<{ data: AuthUser }>("/api/v1/auth/me");
      return res?.data || null;
    } catch {
      return null;
    }
  },
};
