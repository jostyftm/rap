import React from "react";
import Link from "next/link";
import { Play, ArrowRight, Layers, Calendar } from "lucide-react";
import type { RecipeSummary } from "../types/recipes.types";

export function RecipeCard({ recipe }: { recipe: RecipeSummary }) {
  const recipeRouteId = recipe.uuid || recipe.id;

  return (
    <div className="group rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700/80 p-6 flex flex-col justify-between transition-all hover:shadow-xl hover:shadow-indigo-500/5">
      <div>
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700/60 flex items-center gap-1.5">
            <Layers className="w-3 h-3 text-indigo-400" />
            v{recipe.latest_version?.version || 1}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-slate-500">
            <Calendar className="w-3 h-3" />
            {recipe.created_at || "Reciente"}
          </span>
        </div>

        <h3 className="text-lg font-semibold text-white group-hover:text-indigo-300 transition mb-2">
          {recipe.name}
        </h3>

        <p className="text-sm text-slate-400 line-clamp-2 leading-relaxed mb-6">
          {recipe.description || "Sin descripción proporcionada"}
        </p>
      </div>

      <div className="pt-4 border-t border-slate-800/60 flex items-center justify-between">
        <Link
          href={`/recipes/${recipeRouteId}/edit`}
          className="text-xs font-medium text-slate-300 hover:text-white flex items-center gap-1.5 transition"
        >
          <span>Abrir Editor</span>
          <ArrowRight className="w-3.5 h-3.5 text-indigo-400 group-hover:translate-x-1 transition-transform" />
        </Link>

        <Link
          href={`/recipes/${recipeRouteId}/edit`}
          className="p-2 rounded-xl bg-slate-800/60 hover:bg-indigo-600 text-slate-300 hover:text-white transition shadow-sm"
          title="Ejecutar flujo"
        >
          <Play className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
