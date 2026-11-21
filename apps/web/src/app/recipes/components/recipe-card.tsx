"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Play, ArrowRight, Layers, Clock, Download, Loader2, CheckCircle2 } from "lucide-react";
import type { RecipeSummary } from "../types/recipes.types";
import { downloadRecipeJson } from "@/lib/recipe-file";
import { apiFetch } from "@/lib/api-client";

export function RecipeCard({ recipe }: { recipe: RecipeSummary }) {
  const recipeRouteId = recipe.uuid || recipe.id;
  const [isExporting, setIsExporting] = useState(false);

  const publishedVer = recipe.published_version?.version || recipe.latest_version?.version;

  const handleExport = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsExporting(true);
    try {
      const res = await apiFetch<any>(`/api/v1/recipes/${recipeRouteId}/export`);
      const safeName = (recipe.name || "recipe").toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
      downloadRecipeJson(res, `${safeName}.json`);
    } catch (err) {
      console.error("Error al exportar:", err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="group rounded-xl bg-zinc-900/30 border border-zinc-800/80 hover:border-zinc-700 p-5 flex flex-col justify-between transition-colors">
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            {publishedVer ? (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                v{publishedVer}
              </span>
            ) : (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-800/60 text-zinc-400 border border-zinc-700/50 flex items-center gap-1.5">
                <Layers className="w-3 h-3 text-zinc-500" />
                Borrador
              </span>
            )}

            {recipe.has_unpublished_changes && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                Cambios pendientes
              </span>
            )}
          </div>

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

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting}
            className="p-1.5 rounded-md bg-zinc-800/60 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors border border-zinc-700/50"
            title="Exportar como archivo JSON"
          >
            {isExporting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
          </button>

          <Link
            href={`/recipes/${recipeRouteId}/edit`}
            className="p-1.5 rounded-md bg-zinc-800/60 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors border border-zinc-700/50"
            title="Abrir flujo"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
          </Link>
        </div>
      </div>
    </div>
  );
}
