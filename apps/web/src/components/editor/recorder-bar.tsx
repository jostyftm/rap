"use client";

import React, { useState } from "react";
import { Square, Loader2, Globe, Monitor } from "lucide-react";
import { useRecipeStore } from "../../stores/use-recipe-store";
import { apiFetch } from "../../lib/api-client";

export function RecorderBar() {
  const isRecording = useRecipeStore((s) => s.isRecording);
  const recordingSessionId = useRecipeStore((s) => s.recordingSessionId);
  const recordingMode = useRecipeStore((s) => s.recordingMode);
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

  const isDesktop = recordingMode === "desktop";

  return (
    <div className="h-10 bg-zinc-900 border-b border-zinc-800 px-4 flex items-center justify-between text-xs select-none shadow-sm z-30">
      <div className="flex items-center space-x-3">
        <div className={`flex items-center space-x-2 font-medium ${isDesktop ? "text-purple-400" : "text-rose-400"}`}>
          <span className="relative flex h-2 w-2">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                isDesktop ? "bg-purple-400" : "bg-rose-400"
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                isDesktop ? "bg-purple-500" : "bg-rose-500"
              }`}
            />
          </span>
          {isDesktop ? <Monitor className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
          <span className="text-[11px] font-mono tracking-wide">
            {isDesktop ? "Grabando Macro Escritorio" : "Grabando Navegador Web"}
          </span>
        </div>

        <div className="h-3.5 w-px bg-zinc-800" />

        <div className="flex items-center space-x-1.5 text-zinc-300">
          <span className="font-mono text-[11px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-200 border border-zinc-700/60">
            {recordedActionsCount}
          </span>
          <span className="text-[11px] text-zinc-400">
            {recordedActionsCount === 1 ? "acción registrada" : "acciones registradas"}
          </span>
        </div>
      </div>

      <div className="flex items-center space-x-3">
        <span className="text-[11px] text-zinc-500 hidden md:inline">
          {isDesktop
            ? "Capturando clics por coordenadas, atajos y recortes visuales del sistema"
            : "Interactúa en la página para capturar acciones con recortes visuales automáticamente"}
        </span>

        <button
          onClick={handleStop}
          disabled={isStopping}
          className="flex items-center space-x-1.5 px-3 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
        >
          {isStopping ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Square className="w-3 h-3 fill-current" />
          )}
          <span>Finalizar</span>
        </button>
      </div>
    </div>
  );
}
