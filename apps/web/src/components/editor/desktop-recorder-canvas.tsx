"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Monitor,
  X,
  Square,
  MousePointer,
  Keyboard,
  MoveVertical,
  Check,
  Minimize2,
  Maximize2,
  Loader2,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import { useRecipeStore } from "../../stores/use-recipe-store";
import { apiFetch } from "../../lib/api-client";

interface ClickPendingState {
  screenX: number;
  screenY: number;
  viewportX: number;
  viewportY: number;
  thumbnail: string;
}

export function DesktopRecorderCanvas() {
  const isRecording = useRecipeStore((s) => s.isRecording);
  const recordingMode = useRecipeStore((s) => s.recordingMode);
  const recordingSessionId = useRecipeStore((s) => s.recordingSessionId);
  const recipeId = useRecipeStore((s) => s.recipeId);
  const recordedActionsCount = useRecipeStore((s) => s.recordedActionsCount);
  const appendRecordedAction = useRecipeStore((s) => s.appendRecordedAction);
  const stopRecording = useRecipeStore((s) => s.stopRecording);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);
  const [pendingAction, setPendingAction] = useState<ClickPendingState | null>(null);
  const [inputText, setInputText] = useState("");
  const [pressEnter, setPressEnter] = useState(false);
  const [recentPulses, setRecentPulses] = useState<Array<{ id: string; x: number; y: number }>>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hiddenCanvasRef = useRef<HTMLCanvasElement>(null);

  // Iniciar la captura de pantalla nativa
  const requestScreenStream = useCallback(async () => {
    setIsInitializing(true);
    setStreamError(null);
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        throw new Error(
          "Tu navegador no soporta la API de captura de pantalla (getDisplayMedia)."
        );
      }

      const mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: "always",
        } as any,
        audio: false,
      });

      // Si el usuario detiene la compartición desde el banner nativo del navegador
      const videoTrack = mediaStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          handleStop();
        };
      }

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err: any) {
      if (err.name === "NotAllowedError") {
        setStreamError("Se canceló el permiso para compartir la pantalla o ventana.");
      } else {
        setStreamError(err.message || "No se pudo iniciar la captura de pantalla.");
      }
    } finally {
      setIsInitializing(false);
    }
  }, []);

  // Iniciar captura al montar si estamos en modo escritorio
  useEffect(() => {
    if (isRecording && recordingMode === "desktop" && !stream && !streamError) {
      requestScreenStream();
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [isRecording, recordingMode, stream, streamError, requestScreenStream]);

  // Asegurar que el video reciba el stream cuando esté listo
  useEffect(() => {
    if (stream && videoRef.current && !videoRef.current.srcObject) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  if (!isRecording || recordingMode !== "desktop") {
    return null;
  }

  const handleStop = async () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    try {
      if (recipeId && recordingSessionId) {
        await apiFetch(`/api/v1/recipes/${recipeId}/recorder/stop`, {
          method: "POST",
          body: JSON.stringify({ session_id: recordingSessionId }),
        });
      }
    } catch {
      // Ignorar aviso de cierre
    } finally {
      stopRecording();
    }
  };

  // Mapear coordenadas relativas del mouse a la resolución real del video
  const calculateVideoCoordinates = (e: React.MouseEvent<HTMLVideoElement>) => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return null;

    const rect = video.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const scaleX = video.videoWidth / rect.width;
    const scaleY = video.videoHeight / rect.height;

    const screenX = Math.round(clientX * scaleX);
    const screenY = Math.round(clientY * scaleY);

    return {
      screenX,
      screenY,
      viewportX: e.clientX,
      viewportY: e.clientY,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLVideoElement>) => {
    const pos = calculateVideoCoordinates(e);
    if (pos) {
      setCoords({ x: pos.screenX, y: pos.screenY });
    }
  };

  // Extraer miniatura visual alrededor de las coordenadas seleccionadas
  const extractThumbnail = (screenX: number, screenY: number): string => {
    const video = videoRef.current;
    if (!video || !hiddenCanvasRef.current) return "";

    const canvas = hiddenCanvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";

    const cropWidth = 240;
    const cropHeight = 140;

    canvas.width = cropWidth;
    canvas.height = cropHeight;

    const sourceX = Math.max(0, screenX - cropWidth / 2);
    const sourceY = Math.max(0, screenY - cropHeight / 2);

    ctx.drawImage(
      video,
      sourceX,
      sourceY,
      cropWidth,
      cropHeight,
      0,
      0,
      cropWidth,
      cropHeight
    );

    // Dibujar pequeño cursor o retículo en el centro de la miniatura
    ctx.strokeStyle = "#f43f5e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cropWidth / 2, cropHeight / 2, 7, 0, Math.PI * 2);
    ctx.stroke();

    return canvas.toDataURL("image/jpeg", 0.65);
  };

  const handleVideoClick = (e: React.MouseEvent<HTMLVideoElement>) => {
    const pos = calculateVideoCoordinates(e);
    if (!pos) return;

    const thumbnail = extractThumbnail(pos.screenX, pos.screenY);

    // Añadir efecto de pulso visual
    const pulseId = `p_${Date.now()}`;
    setRecentPulses((prev) => [...prev, { id: pulseId, x: pos.viewportX, y: pos.viewportY }]);
    setTimeout(() => {
      setRecentPulses((prev) => prev.filter((p) => p.id !== pulseId));
    }, 800);

    setPendingAction({
      screenX: pos.screenX,
      screenY: pos.screenY,
      viewportX: pos.viewportX,
      viewportY: pos.viewportY,
      thumbnail,
    });
    setInputText("");
    setPressEnter(false);
  };

  // Confirmar acción de clic
  const recordClick = (button: "left" | "right" | "middle" = "left", clickCount: number = 1) => {
    if (!pendingAction) return;

    const buttonLabel =
      clickCount === 2
        ? "Doble Clic"
        : button === "right"
        ? "Clic Derecho"
        : "Clic";

    const actionPayload = {
      type: "click" as const,
      locator: {
        primary: {
          strategy: "vision" as const,
          value: `x: ${pendingAction.screenX}, y: ${pendingAction.screenY}`,
          score: 85,
        },
        fallbacks: [],
      },
      params: {
        button,
        clickCount,
        targetScope: "desktop" as const,
        coordinates: { x: pendingAction.screenX, y: pendingAction.screenY },
        windowTitle: "Pantalla Completa",
      },
      preview: {
        image: pendingAction.thumbnail,
        targetScope: "desktop" as const,
        coordinates: { x: pendingAction.screenX, y: pendingAction.screenY },
        windowTitle: "Pantalla Completa",
        capturedAt: Date.now(),
        elementSnippet: `${buttonLabel} en (${pendingAction.screenX}, ${pendingAction.screenY})`,
      },
      description: `Macro Escritorio: ${buttonLabel} en (${pendingAction.screenX}, ${pendingAction.screenY})`,
      url: "desktop://screen",
    };

    appendRecordedAction(actionPayload);

    // Notificar opcionalmente al backend para persistencia o auditoría
    if (recipeId && recordingSessionId) {
      apiFetch(`/api/v1/recipes/${recipeId}/recorder/action`, {
        method: "POST",
        body: JSON.stringify({
          session_id: recordingSessionId,
          action: actionPayload,
        }),
      }).catch(() => {});
    }

    setPendingAction(null);
  };

  // Confirmar acción de tipeo
  const recordType = () => {
    if (!pendingAction || !inputText.trim()) return;

    const actionPayload = {
      type: "type" as const,
      locator: {
        primary: {
          strategy: "vision" as const,
          value: `Coordenadas (${pendingAction.screenX}, ${pendingAction.screenY})`,
          score: 85,
        },
        fallbacks: [],
      },
      params: {
        text: inputText,
        clear: false,
        pressEnter,
        targetScope: "desktop" as const,
        coordinates: { x: pendingAction.screenX, y: pendingAction.screenY },
        windowTitle: "Pantalla Completa",
      },
      preview: {
        image: pendingAction.thumbnail,
        targetScope: "desktop" as const,
        coordinates: { x: pendingAction.screenX, y: pendingAction.screenY },
        windowTitle: "Pantalla Completa",
        capturedAt: Date.now(),
        elementSnippet: `Escribir: "${inputText}"`,
      },
      description: `Macro Escritorio: Escribir "${inputText}"${
        pressEnter ? " y pulsar Enter" : ""
      } en (${pendingAction.screenX}, ${pendingAction.screenY})`,
      url: "desktop://screen",
    };

    appendRecordedAction(actionPayload);

    if (recipeId && recordingSessionId) {
      apiFetch(`/api/v1/recipes/${recipeId}/recorder/action`, {
        method: "POST",
        body: JSON.stringify({
          session_id: recordingSessionId,
          action: actionPayload,
        }),
      }).catch(() => {});
    }

    setPendingAction(null);
    setInputText("");
  };

  // Confirmar acción de scroll
  const recordScroll = (direction: "down" | "up" = "down") => {
    if (!pendingAction) return;

    const deltaY = direction === "down" ? 350 : -350;
    const actionPayload = {
      type: "scroll" as const,
      locator: {
        primary: {
          strategy: "vision" as const,
          value: `x: ${pendingAction.screenX}, y: ${pendingAction.screenY}`,
          score: 85,
        },
        fallbacks: [],
      },
      params: {
        mode: "coordinates" as const,
        y: deltaY,
        behavior: "smooth" as const,
        targetScope: "desktop" as const,
        coordinates: { x: pendingAction.screenX, y: pendingAction.screenY },
        windowTitle: "Pantalla Completa",
      },
      preview: {
        image: pendingAction.thumbnail,
        targetScope: "desktop" as const,
        coordinates: { x: pendingAction.screenX, y: pendingAction.screenY },
        windowTitle: "Pantalla Completa",
        capturedAt: Date.now(),
        elementSnippet: `Scroll ${direction === "down" ? "abajo" : "arriba"} (350px)`,
      },
      description: `Macro Escritorio: Scroll ${
        direction === "down" ? "abajo" : "arriba"
      } en (${pendingAction.screenX}, ${pendingAction.screenY})`,
      url: "desktop://screen",
    };

    appendRecordedAction(actionPayload);

    if (recipeId && recordingSessionId) {
      apiFetch(`/api/v1/recipes/${recipeId}/recorder/action`, {
        method: "POST",
        body: JSON.stringify({
          session_id: recordingSessionId,
          action: actionPayload,
        }),
      }).catch(() => {});
    }

    setPendingAction(null);
  };

  return (
    <>
      <canvas ref={hiddenCanvasRef} className="hidden" />

      {/* Pulso visual del clic */}
      {recentPulses.map((p) => (
        <div
          key={p.id}
          style={{ left: p.x, top: p.y }}
          className="fixed pointer-events-none -translate-x-1/2 -translate-y-1/2 z-50 animate-ping w-8 h-8 rounded-full border-2 border-purple-400 bg-purple-500/30"
        />
      ))}

      {/* Vista minimizada flotante */}
      {isMinimized && (
        <div className="fixed bottom-4 right-4 z-50 bg-neutral-900 border border-purple-500/50 rounded-xl p-3 shadow-2xl flex items-center space-x-3 text-xs">
          <div className="flex items-center space-x-2 text-purple-400 font-medium">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500" />
            </span>
            <Monitor className="w-4 h-4" />
            <span>Grabador de Escritorio</span>
          </div>
          <span className="bg-neutral-800 text-neutral-200 px-2 py-0.5 rounded font-mono">
            {recordedActionsCount} pasos
          </span>
          <button
            onClick={() => setIsMinimized(false)}
            className="p-1.5 hover:bg-neutral-800 text-neutral-300 hover:text-white rounded-lg transition-colors cursor-pointer"
            title="Restaurar pantalla completa"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleStop}
            className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-medium cursor-pointer"
          >
            Finalizar
          </button>
        </div>
      )}

      {/* Overlay Interactivo de Pantalla Completa */}
      {!isMinimized && (
        <div
          ref={containerRef}
          className="fixed inset-0 z-50 bg-neutral-950/95 flex flex-col select-none animate-in fade-in duration-150"
        >
          {/* Barra Superior de Herramientas y Estado */}
          <div className="h-11 bg-neutral-900/90 border-b border-neutral-800 px-4 flex items-center justify-between z-10 backdrop-blur-md">
            <div className="flex items-center space-x-3 text-xs">
              <div className="flex items-center space-x-2 text-purple-400 font-medium">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500" />
                </span>
                <Monitor className="w-4 h-4" />
                <span className="font-semibold tracking-wide">
                  Grabador de Macros de Escritorio (Live Screen)
                </span>
              </div>

              <div className="h-4 w-px bg-neutral-800" />

              {coords && (
                <div className="flex items-center space-x-1.5 text-neutral-300 font-mono text-[11px] bg-neutral-950 px-2 py-0.5 rounded border border-neutral-800">
                  <span className="text-neutral-500">Coord:</span>
                  <span className="text-purple-300">
                    X: {coords.x}, Y: {coords.y}
                  </span>
                </div>
              )}

              <div className="flex items-center space-x-1.5 text-neutral-400 text-[11px]">
                <span className="font-mono bg-neutral-800 px-1.5 py-0.5 rounded text-neutral-200">
                  {recordedActionsCount}
                </span>
                <span>{recordedActionsCount === 1 ? "paso registrado" : "pasos registrados"}</span>
              </div>
            </div>

            <div className="flex items-center space-x-2 text-xs">
              <span className="text-[11px] text-neutral-400 hidden lg:inline flex items-center space-x-1 mr-2">
                <HelpCircle className="w-3.5 h-3.5 text-neutral-500 inline" />
                <span>Haz clic sobre cualquier elemento de la pantalla para registrar una acción</span>
              </span>

              <button
                type="button"
                onClick={() => setIsMinimized(true)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
                title="Minimizar para ver el flujo en RPA Studio"
              >
                <Minimize2 className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleStop}
                className="flex items-center space-x-1.5 px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-semibold shadow transition-colors cursor-pointer text-xs"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Finalizar Grabación</span>
              </button>
            </div>
          </div>

          {/* Área Principal del Video de Pantalla */}
          <div className="flex-1 relative overflow-hidden bg-black flex items-center justify-center">
            {isInitializing && (
              <div className="flex flex-col items-center space-y-3 text-neutral-400 text-xs">
                <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
                <span>Esperando selección de pantalla o ventana del sistema...</span>
              </div>
            )}

            {streamError && (
              <div className="max-w-md p-6 bg-neutral-900 border border-neutral-800 rounded-xl text-center space-y-4">
                <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
                <h3 className="text-sm font-semibold text-neutral-100">
                  No se pudo acceder a la pantalla del sistema
                </h3>
                <p className="text-xs text-neutral-400 leading-relaxed">{streamError}</p>
                <div className="flex justify-center space-x-2 pt-2">
                  <button
                    onClick={requestScreenStream}
                    className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    Reintentar Captura
                  </button>
                  <button
                    onClick={handleStop}
                    className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-xs cursor-pointer"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            )}

            {stream && (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                onMouseMove={handleMouseMove}
                onClick={handleVideoClick}
                className="max-h-full max-w-full object-contain cursor-crosshair shadow-2xl"
              />
            )}

            {/* Popup Contextual de Selección de Acción tras Clic */}
            {pendingAction && (
              <div
                style={{
                  left: Math.min(window.innerWidth - 320, Math.max(20, pendingAction.viewportX - 140)),
                  top: Math.min(window.innerHeight - 280, Math.max(20, pendingAction.viewportY + 15)),
                }}
                className="fixed z-50 w-72 bg-neutral-900 border border-purple-500/40 rounded-xl p-3 shadow-2xl text-xs space-y-3 animate-in zoom-in-95 duration-100"
              >
                <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                  <div className="flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-purple-500" />
                    <span className="font-semibold text-neutral-200">Registrar Acción</span>
                  </div>
                  <span className="font-mono text-[10px] text-purple-400 bg-neutral-950 px-1.5 py-0.5 rounded">
                    X:{pendingAction.screenX} Y:{pendingAction.screenY}
                  </span>
                </div>

                {/* Previsualización visual de la zona */}
                {pendingAction.thumbnail && (
                  <div className="w-full h-20 bg-neutral-950 rounded-lg overflow-hidden border border-neutral-800 flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={pendingAction.thumbnail}
                      alt="Elemento seleccionado"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                {/* Botones de Clic Rápido */}
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    onClick={() => recordClick("left", 1)}
                    className="flex flex-col items-center justify-center py-2 px-1 bg-neutral-800 hover:bg-purple-600/30 hover:border-purple-500/50 border border-neutral-700/60 rounded-lg text-[11px] font-medium text-neutral-200 transition-colors cursor-pointer"
                  >
                    <MousePointer className="w-3.5 h-3.5 mb-1 text-purple-400" />
                    <span>Clic</span>
                  </button>
                  <button
                    onClick={() => recordClick("left", 2)}
                    className="flex flex-col items-center justify-center py-2 px-1 bg-neutral-800 hover:bg-purple-600/30 hover:border-purple-500/50 border border-neutral-700/60 rounded-lg text-[11px] font-medium text-neutral-200 transition-colors cursor-pointer"
                  >
                    <MousePointer className="w-3.5 h-3.5 mb-1 text-purple-400" />
                    <span>Doble Clic</span>
                  </button>
                  <button
                    onClick={() => recordClick("right", 1)}
                    className="flex flex-col items-center justify-center py-2 px-1 bg-neutral-800 hover:bg-purple-600/30 hover:border-purple-500/50 border border-neutral-700/60 rounded-lg text-[11px] font-medium text-neutral-200 transition-colors cursor-pointer"
                  >
                    <MousePointer className="w-3.5 h-3.5 mb-1 text-purple-400" />
                    <span>Clic Der.</span>
                  </button>
                </div>

                {/* Opción de Escritura */}
                <div className="space-y-1.5 pt-1 border-t border-neutral-800">
                  <label className="text-[10px] text-neutral-400 flex items-center space-x-1">
                    <Keyboard className="w-3 h-3 text-neutral-400" />
                    <span>Escribir texto en esta coordenada:</span>
                  </label>
                  <div className="flex space-x-1.5">
                    <input
                      type="text"
                      autoFocus
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          recordType();
                        }
                      }}
                      placeholder="Texto a tipear..."
                      className="flex-1 bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-100 font-mono outline-none focus:border-purple-500"
                    />
                    <button
                      onClick={recordType}
                      disabled={!inputText.trim()}
                      className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded text-xs font-semibold cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <label className="flex items-center space-x-1.5 text-[10px] text-neutral-400 cursor-pointer pt-0.5">
                    <input
                      type="checkbox"
                      checked={pressEnter}
                      onChange={(e) => setPressEnter(e.target.checked)}
                      className="rounded bg-neutral-800 border-neutral-700 text-purple-600 focus:ring-purple-500"
                    />
                    <span>Pulsar tecla Enter tras escribir</span>
                  </label>
                </div>

                {/* Opción de Desplazamiento (Scroll) */}
                <div className="flex items-center justify-between pt-1 border-t border-neutral-800 text-[10px]">
                  <span className="text-neutral-400 flex items-center space-x-1">
                    <MoveVertical className="w-3 h-3 text-neutral-400" />
                    <span>Scroll:</span>
                  </span>
                  <div className="flex space-x-1">
                    <button
                      onClick={() => recordScroll("down")}
                      className="px-2 py-0.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded cursor-pointer"
                    >
                      Abajo
                    </button>
                    <button
                      onClick={() => recordScroll("up")}
                      className="px-2 py-0.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded cursor-pointer"
                    >
                      Arriba
                    </button>
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    onClick={() => setPendingAction(null)}
                    className="text-[10px] text-neutral-400 hover:text-white cursor-pointer px-2 py-1"
                  >
                    Descartar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
