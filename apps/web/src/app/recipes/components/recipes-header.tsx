import React from "react";
import { Bot, Plus, Loader2, LogOut, User as UserIcon } from "lucide-react";
import type { AuthUser } from "../../../types/auth.types";

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
    <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-bold text-slate-950 shadow-lg shadow-indigo-500/20">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <span className="font-bold tracking-tight text-white text-lg">
              RPA Studio
            </span>
            <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-mono">
              Recetas
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {user && (
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 font-mono bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700/80">
              <UserIcon className="w-3.5 h-3.5 text-indigo-400" />
              <span>{user.email}</span>
            </div>
          )}

          <button
            onClick={onCreateRecipe}
            disabled={isCreating}
            className="flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-400 hover:to-blue-500 text-white shadow-lg shadow-indigo-500/20 transition disabled:opacity-50"
          >
            {isCreating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            <span>Nueva Receta</span>
          </button>

          <button
            onClick={onLogout}
            title="Cerrar sesión"
            className="p-2 rounded-xl bg-slate-800/60 hover:bg-rose-500/10 hover:text-rose-400 text-slate-400 border border-slate-700/60 transition"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
