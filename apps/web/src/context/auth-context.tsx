"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getStoredToken, setStoredToken } from "../lib/api-client";

import type { AuthUser, WorkspaceSummary } from "@/types/auth.types";
export type { AuthUser, WorkspaceSummary };

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshUser = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: AuthUser }>("/api/v1/auth/me");
      if (res?.data) {
        setUser(res.data);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
      setStoredToken(null);
      setTokenState(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const existingToken = getStoredToken();
    if (existingToken) {
      setTokenState(existingToken);
    }

    refreshUser();

    const handleUnauthorized = () => {
      setUser(null);
      setTokenState(null);
      setStoredToken(null);
    };

    window.addEventListener("rpa:unauthorized", handleUnauthorized);
    return () => {
      window.removeEventListener("rpa:unauthorized", handleUnauthorized);
    };
  }, [refreshUser]);

  const login = async (email: string, password: string): Promise<AuthUser> => {
    setIsLoading(true);
    try {
      const res = await apiFetch<{ data: AuthUser; token?: string }>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      if (res.token) {
        setStoredToken(res.token);
        setTokenState(res.token);
      }

      setUser(res.data);
      return res.data;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await apiFetch("/api/v1/auth/logout", {
        method: "POST",
      });
    } catch (err) {
      console.warn("Aviso al cerrar sesión en API:", err);
    } finally {
      setStoredToken(null);
      setTokenState(null);
      setUser(null);
      setIsLoading(false);
      router.push("/login");
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    return {
      user: null,
      token: null,
      isLoading: true,
      isAuthenticated: false,
      login: async () => {
        throw new Error("AuthProvider no está disponible");
      },
      logout: async () => {},
      refreshUser: async () => {},
    };
  }
  return context;
}
