"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bot,
  Plus,
  Play,
  FileCode,
  Calendar,
  Layers,
  ArrowRight,
  ShieldCheck,
  Download,
  Loader2,
} from "lucide-react";
import { apiFetch } from "../../lib/api-client";

interface RecipeSummary {
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

export function RecipeListPage() {
  const router = useRouter();
  const [recipes, setRecipes] = useState<RecipeSummary[]>(DEFAULT_SAMPLE_RECIPES);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    async function fetchRecipes() {
      setIsLoading(true);
      try {
        // Obtener primer workspace y proyectos
        const wsRes = await apiFetch<any>("/api/v1/workspaces");
        const firstWs = wsRes?.data?.[0];
        if (firstWs) {
          const prjRes = await apiFetch<any>(`/api/v1/workspaces/${firstWs.uuid || firstWs.id}/projects`);
          const firstPrj = prjRes?.data?.[0];
          if (firstPrj) {
            const recRes = await apiFetch<any>(`/api/v1/projects/${firstPrj.uuid || firstPrj.id}/recipes`);
            if (recRes?.data && recRes.data.length > 0) {
              setRecipes(recRes.data);
            }
          }
        }
      } catch (err) {
        console.warn("Usando recetas de muestra locales:", err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchRecipes();
  }, []);

  const handleCreateNew = async () => {
    setIsCreating(true);
    try {
      const wsRes = await apiFetch<any>("/api/v1/workspaces");
      const firstWs = wsRes?.data?.[0];
      const prjRes = await apiFetch<any>(`/api/v1/workspaces/${firstWs?.uuid || firstWs?.id}/projects`);
      const firstPrj = prjRes?.data?.[0];

      if (firstPrj) {
        const newRec = await apiFetch<any>(`/api/v1/projects/${firstPrj.uuid || firstPrj.id}/recipes`, {
          method: "POST",
          body: JSON.stringify({
            name: "Nueva Receta RPA",
            description: "Flujo determinista creado en el editor low-code",
            definition: {
              schema: "rpa/v1",
              entry: "step_navigate",
              nodes: {
                step_navigate: {
                  id: "step_navigate",
                  type: "navigate",
                  description: "Navegar a la página",
                  params: { url: "https://example.com" },
                  next: "step_click",
                },
                step_click: {
                  id: "step_click",
                  type: "click",
                  description: "Hacer clic en el botón",
                  locator: {
                    primary: { strategy: "testid", value: "main-btn", score: 95 },
                    fallbacks: [],
                  },
                  params: { button: "left" },
                },
              },
              edges: [{ from: "step_navigate", to: "step_click" }],
            },
          }),
        });

        const id = newRec?.data?.id || newRec?.data?.uuid;
        if (id) {
          router.push(`/recipes/${id}/edit`);
          return;
        }
      }
    } catch {
      // Fallback local
    } finally {
      setIsCreating(false);
      const randomId = `rec_${Math.random().toString(36).substring(2, 8)}`;
      router.push(`/recipes/${randomId}/edit`);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col">
      {/* Top Header */}
      <header className="border-b border-neutral-800 bg-neutral-900/60 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-tr from-blue-500 to-indigo-500 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold tracking-tight text-white text-base">
                RPA Studio
              </span>
              <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
                Editor Low-Code
              </span>
            </div>
          </Link>

          <button
            onClick={handleCreateNew}
            disabled={isCreating}
            className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md transition-all disabled:opacity-50"
          >
            {isCreating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            <span>Nueva Receta</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-10 w-full flex-1 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Recetas de Automatización
            </h1>
            <p className="text-sm text-neutral-400 mt-1">
              Diseña, visualiza y exporta flujos deterministas de navegación web listos para Playwright.
            </p>
          </div>
        </div>

        {/* Recipes Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {recipes.map((recipe) => {
            const recipeId = recipe.uuid || recipe.id;
            return (
              <div
                key={recipeId}
                className="group p-5 rounded-xl bg-neutral-900/70 border border-neutral-800 hover:border-neutral-700 transition-all flex flex-col justify-between space-y-4 hover:shadow-xl"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-mono font-semibold">
                      v{recipe.latest_version?.version || 1} • {recipe.status}
                    </span>
                    <span className="text-[11px] text-neutral-500">
                      {recipe.created_at || "Reciente"}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-white group-hover:text-blue-400 transition-colors">
                      {recipe.name}
                    </h3>
                    <p className="text-xs text-neutral-400 line-clamp-2 mt-1 leading-relaxed">
                      {recipe.description || "Sin descripción proporcionada"}
                    </p>
                  </div>
                </div>

                <div className="pt-3 border-t border-neutral-800/80 flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-[11px] text-neutral-400">
                    <Layers className="w-3.5 h-3.5" />
                    <span>DSL v1</span>
                  </div>

                  <Link
                    href={`/recipes/${recipeId}/edit`}
                    className="flex items-center space-x-1 px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium transition-colors"
                  >
                    <span>Abrir Editor</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

export default RecipeListPage;
