"use client";

import React, { useState, useEffect, useRef } from "react";
import { CircleDot, X, Globe, Monitor, Loader2 } from "lucide-react";
import { apiFetch } from "../../lib/api-client";

export interface RecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  recipeId: string;
  onRecordingStarted: (sessionId: string, mode: "browser" | "desktop") => void;
  defaultUrl?: string;
}

export function RecordModal({
  isOpen,
  onClose,
  recipeId,
  onRecordingStarted,
  defaultUrl = "http://localhost:8099/index.html",
}: RecordModalProps) {
  const [recordMode, setRecordMode] = useState<"browser" | "desktop">("browser");
  const [recordUrl, setRecordUrl] = useState(defaultUrl);
  const [recordTargetWindow, setRecordTargetWindow] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Enfocar el input cuando se abre el modal
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, recordMode]);

  // Cerrar al pulsar Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleStart = async () => {
    if (!recipeId) return;
    if (recordMode === "browser" && !recordUrl.trim()) return;

    setIsStarting(true);
    try {
      const res = await apiFetch<{ session_id: string; mode?: string }>(
        `/api/v1/recipes/${recipeId}/recorder/start`,
        {
          method: "POST",
          body: JSON.stringify({
            mode: recordMode,
            initial_url: recordMode === "browser" ? recordUrl.trim() : undefined,
            target_window:
              recordMode === "desktop" ? recordTargetWindow.trim() || undefined : undefined,
          }),
        }
      );

      if (res.session_id) {
        onRecordingStarted(res.session_id, (res.mode as any) || recordMode);
        onClose();
      }
    } catch (err: any) {
      alert(`Error al iniciar grabador: ${err.message || err}`);
    } finally {
      setIsStarting(false);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleStart();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={(e) => {
        // Cerrar únicamente si el clic se realiza directamente sobre el fondo oscuro
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-xl p-5 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-neutral-100 flex items-center space-x-2">
            <CircleDot className="w-4 h-4 text-rose-500 animate-pulse" />
            <span>Grabar Acciones y Macros</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
            title="Cerrar (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Pestañas de Selección de Modo */}
        <div className="flex rounded-lg bg-neutral-950 p-1 mb-4 border border-neutral-800 select-none">
          <button
            type="button"
            onClick={() => setRecordMode("browser")}
            className={`flex-1 flex items-center justify-center space-x-2 py-1.5 px-3 rounded-md text-xs font-medium transition-all cursor-pointer ${
              recordMode === "browser"
                ? "bg-rose-600 text-white shadow-sm"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Navegador Web</span>
          </button>
          <button
            type="button"
            onClick={() => setRecordMode("desktop")}
            className={`flex-1 flex items-center justify-center space-x-2 py-1.5 px-3 rounded-md text-xs font-medium transition-all cursor-pointer ${
              recordMode === "desktop"
                ? "bg-purple-600 text-white shadow-sm"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>Escritorio (Macro)</span>
          </button>
        </div>

        {recordMode === "browser" ? (
          <>
            <p className="text-xs text-neutral-400 mb-3 leading-relaxed">
              Playwright abrirá la URL e insertará cada clic o texto interactuado directamente como
              bloques con <strong>previsualización visual instantánea</strong> en el flujo.
            </p>
            <label className="block text-[11px] font-medium text-neutral-300 mb-1">
              URL del sitio web
            </label>
            <input
              ref={inputRef}
              type="text"
              value={recordUrl}
              onChange={(e) => setRecordUrl(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="http://localhost:8099/index.html"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-100 mb-4 outline-none focus:border-rose-500 font-mono transition-colors"
            />
          </>
        ) : (
          <>
            <p className="text-xs text-neutral-400 mb-3 leading-relaxed">
              Registra acciones a nivel de sistema operativo: clics por coordenadas, atajos de
              teclado y captura una <strong>miniatura visual</strong> de cada interacción.
            </p>
            <label className="block text-[11px] font-medium text-neutral-300 mb-1">
              Ventana o aplicación objetivo (opcional)
            </label>
            <input
              ref={inputRef}
              type="text"
              value={recordTargetWindow}
              onChange={(e) => setRecordTargetWindow(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Ej: Calculadora, Bloc de notas, o dejar vacío"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-100 mb-4 outline-none focus:border-purple-500 font-mono transition-colors"
            />
          </>
        )}

        <div className="flex justify-end space-x-2 pt-1 border-t border-neutral-800/80">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleStart}
            disabled={isStarting || (recordMode === "browser" && !recordUrl.trim())}
            className={`flex items-center space-x-1.5 px-4 py-1.5 rounded-lg text-white text-xs font-semibold shadow transition-colors cursor-pointer disabled:opacity-50 ${
              recordMode === "desktop"
                ? "bg-purple-600 hover:bg-purple-500"
                : "bg-rose-600 hover:bg-rose-500"
            }`}
          >
            {isStarting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>
              {recordMode === "desktop" ? "Iniciar Macro Escritorio" : "Comenzar Grabación"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
