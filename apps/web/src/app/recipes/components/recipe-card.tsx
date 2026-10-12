import React from "react";
import Link from "next/link";
import { Play, ArrowRight, Layers, Clock } from "lucide-react";
import type { RecipeSummary } from "../types/recipes.types";

export function RecipeCard({ recipe }: { recipe: RecipeSummary }) {
  const recipeRouteId = recipe.uuid || recipe.id;

  return (
    <div className="group rounded-xl bg-zinc-900/30 border border-zinc-800/80 hover:border-zinc-700 p-5 flex flex-col justify-between transition-colors">
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-800/60 text-zinc-400 border border-zinc-700/50 flex items-center gap-1.5">
            <Layers className="w-3 h-3 text-zinc-500" />
            v{recipe.latest_version?.version || 1}
          </span>
          <span className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-500">
            <Clock className="w-3 h-3" />
            {recipe.created_at || "Reciente"}
          </span>
        </div>

        <h3 className="text-sm font-medium text-zinc-100 group-hover:text-white transition-colors">
          {recipe.name}
        </h3>

        <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed mt-1.5 mb-5">
          {recipe.description || "Sin descripción proporcionada"}
        </p>
      </div>

      <div className="pt-3 border-t border-zinc-800/70 flex items-center justify-between">
        <Link
          href={`/recipes/${recipeRouteId}/edit`}
          className="text-xs font-medium text-zinc-400 hover:text-zinc-200 flex items-center gap-1.5 transition-colors"
        >
          <span>Abrir Editor</span>
          <ArrowRight className="w-3 h-3 text-zinc-500 group-hover:translate-x-0.5 transition-transform" />
        </Link>

        <Link
          href={`/recipes/${recipeRouteId}/edit`}
          className="p-1.5 rounded-md bg-zinc-800/60 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors border border-zinc-700/50"
          title="Abrir flujo"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
        </Link>
      </div>
    </div>
  );
}
