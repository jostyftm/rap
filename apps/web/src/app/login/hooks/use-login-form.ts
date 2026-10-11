"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../context/auth-context";
import { ApiError } from "../../../lib/api-client";
import type { LoginCredentials } from "../types/login.types";

export function useLoginForm() {
  const router = useRouter();
  const { login, isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const [email, setEmail] = useState("admin@rpa.studio");
  const [password, setPassword] = useState("secret123");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthLoading && isAuthenticated) {
      router.replace("/recipes");
    }
  }, [isAuthLoading, isAuthenticated, router]);

  const handleSubmit = async (credentials?: LoginCredentials) => {
    const targetEmail = credentials?.email ?? email;
    const targetPassword = credentials?.password ?? password;

    if (!targetEmail || !targetPassword) {
      setError("Por favor ingresa tu correo y contraseña.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await login(targetEmail, targetPassword);
      router.push("/recipes");
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        const errorDetail =
          err.problem?.errors?.email?.[0] ||
          err.problem?.detail ||
          err.problem?.title ||
          "Credenciales inválidas";
        setError(errorDetail);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Error inesperado al iniciar sesión.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickDemoLogin = () => {
    setEmail("admin@rpa.studio");
    setPassword("secret123");
    handleSubmit({ email: "admin@rpa.studio", password: "secret123" });
  };

  return {
    email,
    setEmail,
    password,
    setPassword,
    isSubmitting,
    error,
    handleSubmit,
    handleQuickDemoLogin,
  };
}
