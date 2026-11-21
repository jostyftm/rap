"use client";

import React, { useState, useEffect } from "react";
import {
  History,
  X,
  Loader2,
  Check,
  RotateCcw,
  Eye,
  Download,
  AlertTriangle,
  GitBranch,
  Calendar,
  User as UserIcon,
} from "lucide-react";
import { recipeEditorService } from "@/app/recipes/[id]/edit/services/recipe-editor.service";
import type { RecipeVersionItem } from "@/app/recipes/[id]/edit/types/editor.types";
import { useRecipeStore } from "@/stores/use-recipe-store";
import { downloadRecipeJson } from "@/lib/recipe-file";

interface VersionHistoryDrawerProps {
  recipeId: string;
  recipeName: string;
  isOpen: boolean;
  onClose: () => void;
}

export function VersionHistoryDrawer({
  recipeId,
  recipeName,
  isOpen,
  onClose,
}: VersionHistoryDrawerProps) {
  const [versions, setVersions] = useState<RecipeVersionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);
  const [confirmRestoreVersion, setConfirmRestoreVersion] = useState<number | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const viewingVersion = useRecipeStore((s) => s.viewingVersion);
  const setViewingVersion = useRecipeStore((s) => s.setViewingVersion);

  const loadVersions = async () => {
    if (!recipeId) return;
    setIsLoading(true);
    setError(null);
    try {
      const list = await recipeEditorService.fetchVersions(recipeId);
      setVersions(list);
    } catch (err: any) {
      setError(err?.message || "No se pudo cargar el historial de versiones.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadVersions();
    } else {
      setConfirmRestoreVersion(null);
      setSuccessMessage(null);
    }
  }, [isOpen, recipeId]);

  if (!isOpen) return null;

  const handleViewVersion = async (v: RecipeVersionItem) => {
    try {
      // Si la versión no tiene definition cargada en el listado, obtener detalle
      let def = v.definition;
      if (!def) {
        const detail = await recipeEditorService.fetchVersionDetail(recipeId, v.version);
        def = detail.definition;
      }
      if (def) {
        setViewingVersion({
          version: v.version,
          definition: def,
          changelog: v.changelog,
        });
        onClose();
      }
    } catch (err: any) {
      setError(err?.message || "Error al cargar la versión.");
    }
  };

  const handleRestore = async (versionNumber: number) => {
    setRestoringVersion(versionNumber);
    setError(null);
    try {
      const res = await recipeEditorService.restoreVersion(recipeId, versionNumber);
      if (res?.published_version) {
        useRecipeStore.getState().setRecipe({
          id: res.id || recipeId,
          name: res.name || recipeName,
          description: res.description || "",
          version: res.published_version.version,
          definition: res.draft?.definition || res.published_version.definition,
          publishedVersion: res.published_version,
          hasUnpublishedChanges: false,
        });
      }
      setSuccessMessage(`Versión v${versionNumber} restaurada exitosamente como nueva versión v${res?.published_version?.version || "actualizada"}.`);
      setConfirmRestoreVersion(null);
      await loadVersions();
    } catch (err: any) {
      setError(err?.message || "No se pudo restaurar la versión.");
    } finally {
      setRestoringVersion(null);
    }
  };

  const handleDownloadVersion = async (v: RecipeVersionItem) => {
    try {
      const res = await recipeEditorService.exportRecipeJson(recipeId, v.version);
      const safeName = recipeName.toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
      downloadRecipeJson(res, `${safeName}-v${v.version}.json`);
    } catch (err: any) {
      setError(err?.message || "Error al exportar la versión.");
    }
  };

  return (
    <div className="fixed inset-0 bg-neutral-950/80 backdrop-blur-sm z-50 flex justify-end">
      <div className="bg-neutral-900 border-l border-neutral-800 w-full max-w-lg h-full flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/60">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-neutral-100">
                Historial de Versiones
              </h3>
              <p className="text-xs text-neutral-400">
                Consulta y retrocede a cualquier versión anterior
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status Messages */}
        {successMessage && (
          <div className="m-4 mb-0 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {error && (
          <div className="m-4 mb-0 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading ? (
            <div className="h-48 flex flex-col items-center justify-center gap-2 text-neutral-500 text-xs">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Cargando versiones...</span>
            </div>
          ) : versions.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center gap-2 text-neutral-500 text-xs text-center p-6">
              <History className="w-8 h-8 text-neutral-600 mb-1" />
              <span>No hay versiones publicadas registradas aún.</span>
              <span className="text-[11px] text-neutral-600">
                Pulsa &quot;Publicar&quot; en el editor para crear la primera versión inmutable.
              </span>
            </div>
          ) : (
            versions.map((v) => {
              const isCurrentViewing = viewingVersion?.version === v.version;
              const isConfirmingThis = confirmRestoreVersion === v.version;
              const isRestoringThis = restoringVersion === v.version;

              return (
                <div
                  key={v.id || v.version}
                  className={`p-3.5 rounded-xl border transition-all ${
                    v.is_published
                      ? "bg-neutral-950/80 border-emerald-500/30"
                      : "bg-neutral-950/40 border-neutral-800/80 hover:border-neutral-700"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-bold text-neutral-100">
                        v{v.version}
                      </span>
                      {v.is_published && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          Publicada (activa)
                        </span>
                      )}
                      {v.restored_from_version && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                          <RotateCcw className="w-2.5 h-2.5" />
                          <span>Copia de v{v.restored_from_version.version}</span>
                        </span>
                      )}
                      {isCurrentViewing && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                          Viendo en canvas
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleDownloadVersion(v)}
                        title="Exportar esta versión como JSON"
                        className="p-1 rounded-md text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleViewVersion(v)}
                        title="Ver versión en canvas (solo lectura)"
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-neutral-300 hover:text-white hover:bg-neutral-800 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5 text-neutral-400" />
                        <span>Ver</span>
                      </button>

                      {!v.is_published && (
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmRestoreVersion(
                              isConfirmingThis ? null : v.version
                            )
                          }
                          title="Restaurar esta versión como activa"
                          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Retroceder</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {v.changelog && (
                    <p className="text-xs text-neutral-300 bg-neutral-900/60 p-2 rounded-lg border border-neutral-800/60 my-2">
                      {v.changelog}
                    </p>
                  )}

                  <div className="flex items-center gap-3 text-[11px] text-neutral-500 mt-2 pt-2 border-t border-neutral-800/40">
                    {v.created_at && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <span>{new Date(v.created_at).toLocaleString()}</span>
                      </span>
                    )}
                    {v.creator?.name && (
                      <span className="flex items-center gap-1">
                        <UserIcon className="w-3 h-3" />
                        <span>{v.creator.name}</span>
                      </span>
                    )}
                  </div>

                  {/* Panel de confirmación de rollback */}
                  {isConfirmingThis && (
                    <div className="mt-3 p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-xs space-y-2">
                      <div className="flex items-start gap-1.5 text-indigo-300">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                        <span>
                          ¿Retroceder a <strong>v{v.version}</strong>? Se creará una nueva versión publicada con esta definición y se actualizará tu borrador de trabajo.
                        </span>
                      </div>
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setConfirmRestoreVersion(null)}
                          disabled={isRestoringThis}
                          className="px-2.5 py-1 rounded-md text-xs text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRestore(v.version)}
                          disabled={isRestoringThis}
                          className="flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
                        >
                          {isRestoringThis ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <RotateCcw className="w-3 h-3" />
                          )}
                          <span>Confirmar Rollback</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-neutral-800 bg-neutral-950/60 flex items-center justify-between">
          <span className="text-[11px] text-neutral-500">
            Total versiones: {versions.length}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-300 hover:bg-neutral-800 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
