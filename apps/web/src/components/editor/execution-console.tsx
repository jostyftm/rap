"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Terminal,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
  X,
  Trash2,
  CheckCircle,
  AlertCircle,
  Clock,
  ExternalLink,
} from "lucide-react";
import { useRecipeStore } from "../../stores/use-recipe-store";
import { getEcho } from "../../lib/echo";

export function ExecutionConsole() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"logs" | "screenshots">("logs");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const runId = useRecipeStore((s) => s.runId);
  const runStatus = useRecipeStore((s) => s.runStatus);
  const logs = useRecipeStore((s) => s.logs);
  const screenshots = useRecipeStore((s) => s.screenshots);
  const setRunningNodeId = useRecipeStore((s) => s.setRunningNodeId);
  const addLog = useRecipeStore((s) => s.addLog);
  const addScreenshot = useRecipeStore((s) => s.addScreenshot);
  const finishRun = useRecipeStore((s) => s.finishRun);
  const clearRunState = useRecipeStore((s) => s.clearRunState);

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-abrir cuando empiece una ejecución
  useEffect(() => {
    if (runStatus === "running") {
      setIsOpen(true);
    }
  }, [runStatus]);

  // Auto-scroll al final de los logs
  useEffect(() => {
    if (isOpen && activeTab === "logs") {
      logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, isOpen, activeTab]);

  // Suscripción a Reverb / WebSockets cuando hay un runId activo
  useEffect(() => {
    if (!runId) return;

    const echo = getEcho();
    if (!echo) return;

    const channel = echo.channel(`runs.${runId}`);

    channel.listen(".step.started", (e: { nodeId: string }) => {
      setRunningNodeId(e.nodeId);
      addLog({
        level: "info",
        message: `Paso [${e.nodeId}] iniciado`,
        nodeId: e.nodeId,
      });
    });

    channel.listen(
      ".step.finished",
      (e: {
        nodeId: string;
        durationMs: number;
        locatorStrategy?: string;
        locatorValue?: string;
        screenshotPath?: string;
      }) => {
        let msg = `Paso [${e.nodeId}] finalizado en ${e.durationMs}ms`;
        if (e.locatorStrategy) {
          msg += ` con ${e.locatorStrategy}: ${e.locatorValue}`;
        }
        addLog({
          level: "success",
          message: msg,
          nodeId: e.nodeId,
        });

        if (e.screenshotPath) {
          addScreenshot({
            nodeId: e.nodeId,
            url: e.screenshotPath,
          });
        }
      }
    );

    channel.listen(
      ".step.failed",
      (e: { nodeId: string; error: string; durationMs: number; screenshotPath?: string }) => {
        addLog({
          level: "error",
          message: `Paso [${e.nodeId}] falló tras ${e.durationMs}ms: ${e.error}`,
          nodeId: e.nodeId,
        });

        if (e.screenshotPath) {
          addScreenshot({
            nodeId: e.nodeId,
            url: e.screenshotPath,
          });
        }
      }
    );

    channel.listen(".run.finished", (e: { status: "success" | "failed"; durationMs: number; error?: string }) => {
      setRunningNodeId(null);
      finishRun(e.status);
    });

    return () => {
      echo.leaveChannel(`runs.${runId}`);
    };
  }, [runId, setRunningNodeId, addLog, addScreenshot, finishRun]);

  return (
    <>
      {/* Barra o Cajón inferior de Consola */}
      <div
        className={`border-t border-neutral-800 bg-neutral-950 flex flex-col transition-all duration-200 z-20 ${
          isOpen ? "h-64" : "h-9"
        }`}
      >
        {/* Encabezado / Barra Minimizable */}
        <div className="h-9 px-4 border-b border-neutral-800/80 bg-neutral-900/90 flex items-center justify-between select-none">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="flex items-center space-x-1.5 text-xs font-semibold text-neutral-300 hover:text-white transition-colors"
            >
              <Terminal className="w-3.5 h-3.5 text-neutral-400" />
              <span>Consola de Ejecución</span>
              {isOpen ? (
                <ChevronDown className="w-3.5 h-3.5 text-neutral-500" />
              ) : (
                <ChevronUp className="w-3.5 h-3.5 text-neutral-500" />
              )}
            </button>

            {runStatus !== "idle" && (
              <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono">
                {runStatus === "running" && (
                  <span className="flex items-center space-x-1 text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full animate-pulse border border-amber-500/20">
                    <Clock className="w-3 h-3" />
                    <span>Ejecutando en Playwright...</span>
                  </span>
                )}
                {runStatus === "success" && (
                  <span className="flex items-center space-x-1 text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    <CheckCircle className="w-3 h-3" />
                    <span>Completado Exitoso</span>
                  </span>
                )}
                {runStatus === "failed" && (
                  <span className="flex items-center space-x-1 text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
                    <AlertCircle className="w-3 h-3" />
                    <span>Falló</span>
                  </span>
                )}
              </div>
            )}
          </div>

          {isOpen && (
            <div className="flex items-center space-x-2">
              <div className="flex items-center rounded-md bg-neutral-950 border border-neutral-800 p-0.5">
                <button
                  onClick={() => setActiveTab("logs")}
                  className={`px-2.5 py-1 text-[11px] rounded font-medium transition-colors ${
                    activeTab === "logs"
                      ? "bg-neutral-800 text-neutral-200"
                      : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  Logs ({logs.length})
                </button>
                <button
                  onClick={() => setActiveTab("screenshots")}
                  className={`px-2.5 py-1 text-[11px] rounded font-medium transition-colors ${
                    activeTab === "screenshots"
                      ? "bg-neutral-800 text-neutral-200"
                      : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  Capturas ({screenshots.length})
                </button>
              </div>

              <button
                onClick={clearRunState}
                title="Limpiar consola"
                className="p-1 rounded text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Contenido expandido */}
        {isOpen && (
          <div className="flex-1 overflow-y-auto p-3 text-xs font-mono">
            {activeTab === "logs" ? (
              logs.length === 0 ? (
                <div className="h-full flex items-center justify-center text-neutral-600 text-xs">
                  Sin eventos de ejecución. Presiona "Ejecutar Flujo" para comenzar.
                </div>
              ) : (
                <div className="space-y-1">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-start space-x-2 leading-relaxed"
                    >
                      <span className="text-neutral-500 shrink-0 text-[11px]">
                        [{log.timestamp}]
                      </span>
                      <span
                        className={`text-[11px] font-bold uppercase shrink-0 ${
                          log.level === "success"
                            ? "text-emerald-400"
                            : log.level === "error"
                            ? "text-rose-400"
                            : log.level === "warn"
                            ? "text-amber-400"
                            : "text-blue-400"
                        }`}
                      >
                        [{log.level}]
                      </span>
                      {log.nodeId && (
                        <span className="text-neutral-400 bg-neutral-900 px-1 rounded text-[10px]">
                          {log.nodeId}
                        </span>
                      )}
                      <span
                        className={`${
                          log.level === "error"
                            ? "text-rose-300 font-medium"
                            : log.level === "success"
                            ? "text-emerald-200"
                            : "text-neutral-300"
                        }`}
                      >
                        {log.message}
                      </span>
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              )
            ) : (
              /* Tira de Capturas */
              screenshots.length === 0 ? (
                <div className="h-full flex items-center justify-center text-neutral-600 text-xs">
                  No hay capturas registradas en esta ejecución.
                </div>
              ) : (
                <div className="flex items-center space-x-4 overflow-x-auto py-2">
                  {screenshots.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => setSelectedImage(s.url)}
                      className="group relative w-36 h-24 rounded-lg bg-neutral-900 border border-neutral-800 hover:border-neutral-600 overflow-hidden cursor-pointer shrink-0 transition-all shadow-md"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={s.url}
                        alt={`Captura ${s.nodeId}`}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                      <div className="absolute inset-x-0 bottom-0 p-1 bg-neutral-950/80 backdrop-blur-sm text-[9px] text-neutral-300 truncate">
                        {s.nodeId} ({s.timestamp})
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        )}
      </div>

      {/* Modal Lightbox para Screenshot completo */}
      {selectedImage && (
        <div
          onClick={() => setSelectedImage(null)}
          className="fixed inset-0 bg-neutral-950/80 backdrop-blur-md z-50 flex items-center justify-center p-6"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-4xl max-h-[85vh] bg-neutral-900 rounded-xl border border-neutral-800 overflow-hidden shadow-2xl"
          >
            <div className="flex items-center justify-between p-3 border-b border-neutral-800 bg-neutral-950">
              <span className="text-xs font-semibold text-neutral-300">
                Visualizador de Captura Playwright
              </span>
              <button
                onClick={() => setSelectedImage(null)}
                className="p-1 rounded text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selectedImage}
              alt="Captura en pantalla completa"
              className="max-h-[75vh] w-auto object-contain mx-auto"
            />
          </div>
        </div>
      )}
    </>
  );
}
