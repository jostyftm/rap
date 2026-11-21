"use client";

import React, { useState } from "react";
import { UploadCloud, X, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { recipeEditorService } from "@/app/recipes/[id]/edit/services/recipe-editor.service";
import { useRecipeStore } from "@/stores/use-recipe-store";

interface PublishDialogProps {
  recipeId: string;
  isOpen: boolean;
  onClose: () => void;
  onPublished?: (newVersion: number) => void;
}

export function PublishDialog({
  recipeId,
  isOpen,
  onClose,
  onPublished,
}: PublishDialogProps) {
  const publishedVersion = useRecipeStore((s) => s.publishedVersion);
  const currentPublishedNum = publishedVersion?.version || 0;
  const nextVersionNum = currentPublishedNum + 1;

  const [changelog, setChangelog] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handlePublish = async () => {
    if (!recipeId) return;
    setIsPublishing(true);
    setError(null);

    try {
      const res = await recipeEditorService.publishRecipe(recipeId, changelog);
      setSuccess(true);
      if (res?.published_version) {
        useRecipeStore.getState().setPublishedVersion(res.published_version);
        useRecipeStore.getState().setHasUnpublishedChanges(false);
        useRecipeStore.setState({ isDirty: false });
      }
      setTimeout(() => {
        setSuccess(false);
        onClose();
        if (onPublished && res?.published_version?.version) {
          onPublished(res.published_version.version);
        }
      }, 1000);
    } catch (err: any) {
      setError(
        err?.message || "Ocurrió un error al intentar publicar la automatización."
      );
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-neutral-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-md flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/60">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <UploadCloud className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-neutral-100">
                Publicar Automatización
              </h3>
              <p className="text-xs text-neutral-400">
                Congela el borrador actual como versión oficial
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isPublishing}
            className="p-1 rounded-md text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          <div className="p-3 rounded-lg bg-neutral-950/70 border border-neutral-800 text-xs text-neutral-300 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-neutral-400">Versión actual:</span>
              <span className="font-mono text-neutral-200 font-medium">
                {currentPublishedNum > 0 ? `v${currentPublishedNum}` : "Sin publicar"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-400">Nueva versión a generar:</span>
              <span className="font-mono text-emerald-400 font-bold">
                v{nextVersionNum}
              </span>
            </div>
            <p className="text-[11px] text-neutral-400 pt-1 border-t border-neutral-800/80">
              Las ejecuciones programadas (cron), webhooks y API utilizarán esta versión inmutable.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
              Notas de la versión (changelog opcional)
            </label>
            <textarea
              value={changelog}
              onChange={(e) => setChangelog(e.target.value)}
              disabled={isPublishing || success}
              placeholder="Ej: Se ajustaron los selectores de login y el tiempo de espera..."
              rows={3}
              className="w-full text-xs rounded-lg border border-neutral-800 bg-neutral-950 p-2.5 text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 resize-none transition-colors"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>¡Automatización publicada con éxito como versión v{nextVersionNum}!</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-neutral-800 bg-neutral-950/60 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPublishing}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handlePublish}
            disabled={isPublishing || success}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50 shadow-sm cursor-pointer"
          >
            {isPublishing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <UploadCloud className="w-3.5 h-3.5" />
            )}
            <span>{isPublishing ? "Publicando..." : `Publicar v${nextVersionNum}`}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
