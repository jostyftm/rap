"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { recipesService } from "../services/recipes.service";
import { useAuth } from "../../../context/auth-context";
import type { RecipeSummary } from "../types/recipes.types";

const DEFAULT_SAMPLE_RECIPES: RecipeSummary[] = [
  {
    id: "rec_login_sample",
    name: "Login y Extracción Determinista",
    description: "Navega al formulario de login, ingresa credenciales, verifica el dashboard y extrae datos de bienvenida.",
    status: "active",
    created_at: "Hoy",
    latest_version: {
      version: 1,
    },
  },
  {
    id: "rec_ecommerce_sample",
    name: "Extracción de Catálogo y Precios",
    description: "Recorre las páginas de productos, extrae nombres y precios con selectores de respaldo automáticos.",
    status: "active",
    created_at: "Ayer",
    latest_version: {
      version: 2,
    },
  },
];

export function useRecipesList() {
  const router = useRouter();
  const { user, logout } = useAuth();

  const [recipes, setRecipes] = useState<RecipeSummary[]>(DEFAULT_SAMPLE_RECIPES);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    async function loadRecipes() {
      try {
        const data = await recipesService.fetchRecipes();
        if (data && data.length > 0) {
          setRecipes(data);
        }
      } catch (err) {
        console.warn("No se pudieron cargar recetas del backend, usando ejemplos:", err);
      } finally {
        setIsLoading(false);
      }
    }

    loadRecipes();
  }, []);

  const handleCreateRecipe = async () => {
    setIsCreating(true);
    try {
      const newRec = await recipesService.createRecipe({
        name: `Nueva Receta RPA #${recipes.length + 1}`,
        description: "Flujo determinista creado con el editor visual",
      });
      const targetId = newRec.id || newRec.uuid;
      router.push(`/recipes/${targetId}/edit`);
    } catch {
      router.push(`/recipes/new/edit`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return {
    user,
    recipes,
    isLoading,
    isCreating,
    handleCreateRecipe,
    handleLogout,
  };
}
