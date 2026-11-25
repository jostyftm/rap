"use client";

import React, { useEffect, useId } from "react";
import { AlertCircle, AlertTriangle, Loader2, Trash2, X } from "lucide-react";

interface DeleteRecipeDialogProps {
  isOpen: boolean;
  recipeName: string;
  isDeleting?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}

export function DeleteRecipeDialog({
  isOpen,
  recipeName,
  isDeleting = false,
  error = null,
  onClose,
  onConfirm,
}: DeleteRecipeDialogProps) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isDeleting) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isDeleting, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDeleting) {
          onClose();
        }
      }}
      className="fixed inset-0 bg-neutral-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-md flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/60">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h3 id={titleId} className="text-sm font-semibold text-neutral-100">
                Eliminar automatización
              </h3>
              <p className="text-xs text-neutral-400">
                Esta acción requiere confirmación previa
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            aria-label="Cerrar diálogo de eliminación"
            className="p-1 rounded-md text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div id={descriptionId} className="p-5 space-y-3 text-xs text-neutral-300 leading-relaxed">
          <p>
            ¿Estás seguro de que deseas eliminar{" "}
            <strong className="text-neutral-100 font-semibold">{recipeName}</strong>?
          </p>
          <p className="text-neutral-400">
            Se desactivarán sus webhooks públicos activos y programaciones cron asociadas, y la automatización dejará de estar disponible en el proyecto.
          </p>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs"
            >
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-neutral-800 bg-neutral-950/60 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-300 hover:text-neutral-100 hover:bg-neutral-800 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm()}
            disabled={isDeleting}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-rose-600 hover:bg-rose-500 text-white transition-colors disabled:opacity-50 shadow-sm cursor-pointer"
          >
            {isDeleting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
            <span>{isDeleting ? "Eliminando..." : "Eliminar automatización"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
