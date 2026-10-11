"use client";

import React, { useState } from "react";
import { CircleDot, Square, Loader2, Sparkles } from "lucide-react";
import { useRecipeStore } from "../../stores/use-recipe-store";
import { apiFetch } from "../../lib/api-client";

export function RecorderBar() {
  const isRecording = useRecipeStore((s) => s.isRecording);
  const recordingSessionId = useRecipeStore((s) => s.recordingSessionId);
  const recordedActionsCount = useRecipeStore((s) => s.recordedActionsCount);
  const stopRecording = useRecipeStore((s) => s.stopRecording);
  const recipeId = useRecipeStore((s) => s.recipeId);

  const [isStopping, setIsStopping] = useState(false);

  if (!isRecording) return null;

  const handleStop = async () => {
    setIsStopping(true);
    try {
      if (recipeId) {
        await apiFetch(`/api/v1/recipes/${recipeId}/recorder/stop`, {
          method: "POST",
          body: JSON.stringify({ session_id: recordingSessionId }),
        });
      }
    } catch (err) {
      console.warn("Aviso al detener grabación en el servidor:", err);
    } finally {
      stopRecording();
      setIsStopping(false);
    }
  };

  return (
    <div className="h-10 bg-gradient-to-r from-rose-950/80 via-neutral-900 to-rose-950/80 border-b border-rose-500/30 px-4 flex items-center justify-between text-xs animate-in slide-in-from-top duration-200 select-none shadow-lg z-30">
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-1.5 text-rose-400 font-semibold">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500" />
          </span>
          <span>Grabando acciones en vivo</span>
        </div>

        <div className="h-4 w-px bg-rose-500/20" />

        <div className="flex items-center space-x-1.5 text-neutral-300">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>
            <strong className="text-white font-mono">{recordedActionsCount}</strong>{" "}
            {recordedActionsCount === 1 ? "acción agregada al lienzo" : "acciones agregadas al lienzo"}
          </span>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <span className="text-[11px] text-neutral-400 hidden sm:inline">
          Interactúa en la página del navegador para capturar clicks y tipeos automáticamente.
        </span>

        <button
          onClick={handleStop}
          disabled={isStopping}
          className="flex items-center space-x-1.5 px-3 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-semibold transition-all shadow-sm active:scale-95 disabled:opacity-50"
        >
          {isStopping ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Square className="w-3.5 h-3.5 fill-current" />
          )}
          <span>Finalizar Grabación</span>
        </button>
      </div>
    </div>
  );
}
