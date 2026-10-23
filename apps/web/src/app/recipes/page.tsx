"use client";

import React, { useState, useMemo } from "react";
import { AuthGuard } from "../../components/auth/auth-guard";
import { useRecipesList } from "./hooks/use-recipes-list";
import { RecipesHeader } from "./components/recipes-header";
import { RecipeCard } from "./components/recipe-card";
import { Loader2, Search, Plus } from "lucide-react";

export function RecipeListPageContent() {
  const {
    user,
    recipes,
    isLoading,
    isCreating,
    loadError,
    createError,
    reloadRecipes,
    clearCreateError,
    handleCreateRecipe,
    handleLogout,
  } = useRecipesList();

  const [search, setSearch] = useState("");

  const filteredRecipes = useMemo(() => {
    if (!search.trim()) return recipes;
    const query = search.toLowerCase();
    return recipes.filter(
      (r) =>
        r.name.toLowerCase().includes(query) ||
        (r.description && r.description.toLowerCase().includes(query))
    );
  }, [recipes, search]);

  return (
    <div className="min-h-screen flex flex-col bg-[#09090b] text-zinc-100 selection:bg-zinc-800 selection:text-white">
      <RecipesHeader
        user={user}
        isCreating={isCreating}
        onCreateRecipe={handleCreateRecipe}
        onLogout={handleLogout}
      />

      <main className="max-w-6xl mx-auto px-6 py-8 flex-1 w-full">
        {/* Workspace Title & Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-lg font-medium tracking-tight text-zinc-100">
              Recetas de Automatización
            </h1>
            <p className="text-xs text-zinc-400 mt-0.5">
              Flujos deterministas compilados para ejecución en Playwright.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-500" />
              <input
                type="text"
                placeholder="Buscar receta..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-zinc-900/60 border border-zinc-800 rounded-md pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-600 transition-colors"
              />
            </div>
          </div>
        </div>

        {createError && (
          <div
            role="alert"
            className="mb-4 flex items-start justify-between gap-3 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300"
          >
            <span>No se pudo crear la receta: {createError}</span>
            <button
              onClick={clearCreateError}
              className="text-rose-400 hover:text-rose-200 shrink-0"
              aria-label="Descartar error"
            >
              ×
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center p-24 text-zinc-500 gap-2.5">
            <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
            <span className="text-xs font-mono">Cargando recetas...</span>
          </div>
        ) : loadError ? (
          <div className="rounded-xl border border-dashed border-rose-500/30 bg-rose-500/5 p-12 text-center flex flex-col items-center justify-center">
            <p className="text-xs text-rose-300 mb-3">
              No se pudieron cargar las recetas: {loadError}
            </p>
            <button
              onClick={() => reloadRecipes()}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-zinc-100 hover:bg-white text-zinc-950 transition-colors shadow-sm"
            >
              Reintentar
            </button>
          </div>
        ) : filteredRecipes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800 p-12 text-center flex flex-col items-center justify-center">
            <p className="text-xs text-zinc-400 mb-3">
              {search.trim()
                ? "No se encontraron recetas con ese término de búsqueda."
                : "No hay recetas creadas en este espacio de trabajo."}
            </p>
            {!search.trim() && (
              <button
                onClick={handleCreateRecipe}
                disabled={isCreating}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-zinc-100 hover:bg-white text-zinc-950 transition-colors shadow-sm disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Crear primera receta</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRecipes.map((recipe) => (
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
