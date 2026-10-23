import React from "react";
import Link from "next/link";
import { Plus, Loader2, LogOut } from "lucide-react";
import type { AuthUser } from "../../../types/auth.types";
import { StudioLogo } from "../../../components/studio-logo";
import { ThemeToggle } from "../../../components/theme-toggle";

export function RecipesHeader({
  user,
  isCreating,
  onCreateRecipe,
  onLogout,
}: {
  user: AuthUser | null;
  isCreating: boolean;
  onCreateRecipe: () => void;
  onLogout: () => void;
}) {
  return (
    <header className="border-b border-zinc-800/80 bg-[#09090b]/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="h-7 w-7 rounded-md bg-zinc-100 text-zinc-950 flex items-center justify-center transition-transform group-hover:scale-105">
              <StudioLogo className="w-4 h-4" />
            </div>
            <span className="font-medium tracking-tight text-zinc-100 text-sm">
              RPA Studio
            </span>
          </Link>
          <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800 font-mono">
            Recetas
          </span>
        </div>

        <div className="flex items-center gap-3">
          {user && (
            <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-400 font-mono bg-zinc-900/80 px-2.5 py-1 rounded-md border border-zinc-800">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>{user.email}</span>
            </div>
          )}

          <button
            onClick={onCreateRecipe}
            disabled={isCreating}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-zinc-100 hover:bg-white text-zinc-950 shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isCreating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            <span>Nueva Receta</span>
          </button>

          <ThemeToggle variant="button" />

          <button
            onClick={onLogout}
            title="Cerrar sesión"
            className="p-1.5 rounded-md hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
