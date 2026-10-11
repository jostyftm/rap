"use client";

import React from "react";
import { AuthGuard } from "../../components/auth/auth-guard";
import { useRecipesList } from "./hooks/use-recipes-list";
import { RecipesHeader } from "./components/recipes-header";
import { RecipeCard } from "./components/recipe-card";
import { Loader2 } from "lucide-react";

export function RecipeListPageContent() {
  const {
    user,
    recipes,
    isLoading,
    isCreating,
    handleCreateRecipe,
    handleLogout,
  } = useRecipesList();

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-indigo-500 selection:text-white">
      <RecipesHeader
        user={user}
        isCreating={isCreating}
        onCreateRecipe={handleCreateRecipe}
        onLogout={handleLogout}
      />

      <main className="max-w-7xl mx-auto px-6 py-10 flex-1 w-full">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-white mb-1">
            Mis Automatizaciones RPA
          </h1>
          <p className="text-sm text-slate-400">
            Diseña, versiona y ejecuta flujos de navegación deterministas con Playwright.
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center p-20 text-slate-500 gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
            <span className="text-xs">Cargando recetas disponibles...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {recipes.map((recipe) => (
              <RecipeCard key={recipe.id} recipe={recipe} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default function RecipeListPage() {
  return (
    <AuthGuard>
      <RecipeListPageContent />
    </AuthGuard>
  );
}
