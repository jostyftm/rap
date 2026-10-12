"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
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
  Pause,
  Play,
  Square,
  Search,
  Database,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { useRecipeStore, type ExecutionLog } from "../../stores/use-recipe-store";
import { getEcho } from "../../lib/echo";
import { apiFetch } from "../../lib/api-client";
import { dispatchRunControl } from "../../lib/execution-control";

export function ExecutionConsole() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"logs" | "screenshots" | "db_logs">("logs");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<string>("all");
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [dbLogs, setDbLogs] = useState<any[]>([]);
  const [isLoadingDbLogs, setIsLoadingDbLogs] = useState(false);

  const runId = useRecipeStore((s) => s.runId);
  const runStatus = useRecipeStore((s) => s.runStatus);
  const runControlState = useRecipeStore((s) => s.runControlState);
  const setRunControlState = useRecipeStore((s) => s.setRunControlState);
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

  // Suscripción a Reverb / WebSockets y sondeo de respaldo cuando hay un runId activo
  useEffect(() => {
    if (!runId) return;

    let pollingInterval: NodeJS.Timeout | null = null;
    const processedStepKeys = new Set<string>();

    const echo = getEcho();
    if (echo) {
      const channel = echo.channel(`run.${runId}`);

      // 1. Escuchar logs enriquecidos en tiempo real emitidos por el Runner
      channel.listen(
        ".run.log",
        (e: {
          run_id: string;
          level: "info" | "warn" | "error" | "success";
          message: string;
          node_id?: string;
          source?: "runner" | "browser" | "network" | "live";
          context?: Record<string, unknown>;
        }) => {
          addLog({
            level: e.level,
            message: e.message,
            nodeId: e.node_id,
            source: e.source || "runner",
            context: e.context,
          });
        }
      );

      // 2. Escuchar evento de paso
      channel.listen(
        ".step.updated",
        (e: {
          id: string;
          node_id: string;
          status: "running" | "success" | "failed";
          locator_strategy?: string;
          duration_ms?: number;
          screenshot_path?: string;
          error_message?: string;
        }) => {
          const stepKey = `${e.node_id}-${e.status}`;
          if (processedStepKeys.has(stepKey)) return;
          processedStepKeys.add(stepKey);

          if (e.status === "running") {
            setRunningNodeId(e.node_id);
          } else if (e.status === "success") {
            if (e.screenshot_path) {
              const url = e.screenshot_path.startsWith("http")
                ? e.screenshot_path
                : `http://localhost:9000/rpa-artifacts/${e.screenshot_path}`;
              addScreenshot({
                nodeId: e.node_id,
                url,
              });
            }
          } else if (e.status === "failed") {
            if (e.screenshot_path) {
              const url = e.screenshot_path.startsWith("http")
                ? e.screenshot_path
                : `http://localhost:9000/rpa-artifacts/${e.screenshot_path}`;
              addScreenshot({
                nodeId: e.node_id,
                url,
              });
            }
          }
        }
      );

      // 3. Escuchar evento estándar de actualización / finalización del run
      channel.listen(
        ".run.updated",
        (e: {
          id: string;
          status: "queued" | "running" | "paused" | "completed" | "failed";
          duration_ms?: number;
          error_message?: string;
        }) => {
          if (e.status === "paused") {
            setRunControlState("paused");
          } else if (e.status === "running") {
            setRunControlState("running");
          } else if (e.status === "completed") {
            setRunningNodeId(null);
            finishRun("success");
          } else if (e.status === "failed") {
            setRunningNodeId(null);
            finishRun("failed");
          }
        }
      );
    }

    // Polling de respaldo usando apiFetch con autenticación Bearer
    const pollStatus = async () => {
      try {
        const res = await apiFetch<any>(`/api/v1/runs/${runId}`);
        const runData = res?.data;
        if (!runData) return;

        if (Array.isArray(runData.steps)) {
          for (const step of runData.steps) {
            const stepKey = `${step.node_id}-${step.status}`;
            if (!processedStepKeys.has(stepKey)) {
              processedStepKeys.add(stepKey);
              if (step.status === "running") {
                setRunningNodeId(step.node_id);
              } else if (step.status === "success" && step.screenshot_path) {
                const url = step.screenshot_path.startsWith("http")
                  ? step.screenshot_path
                  : `http://localhost:9000/rpa-artifacts/${step.screenshot_path}`;
                addScreenshot({
                  nodeId: step.node_id,
                  url,
                });
              }
            }
          }
        }

        if (runData.status === "completed") {
          setRunningNodeId(null);
          finishRun("success");
          if (pollingInterval) clearInterval(pollingInterval);
        } else if (runData.status === "failed") {
          setRunningNodeId(null);
          finishRun("failed");
          if (pollingInterval) clearInterval(pollingInterval);
        } else if (runData.status === "paused") {
          setRunControlState("paused");
        }
      } catch {
        // Ignorar fallos de sondeo
      }
    };

    if (runStatus === "running") {
      pollingInterval = setInterval(pollStatus, 2000);
      pollStatus();
    }

    return () => {
      if (echo) {
        echo.leaveChannel(`run.${runId}`);
      }
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [runId, runStatus, setRunningNodeId, setRunControlState, addLog, addScreenshot, finishRun]);

  // Manejar comandos de control (Pausar / Reanudar / Detener)
  const handleControlAction = async (action: "pause" | "resume" | "stop") => {
    if (!runId) return;
    await dispatchRunControl(action, runId);
  };

  // Cargar logs persistidos desde la base de datos
  const loadDbLogs = async () => {
    if (!runId) return;
    setIsLoadingDbLogs(true);
    try {
      const res = await apiFetch<{ data: any[] }>(`/api/v1/runs/${runId}/logs?limit=500`);
      if (res?.data) {
        setDbLogs(res.data);
      }
    } catch (err) {
      console.warn("Aviso al cargar logs de BD:", err);
    } finally {
      setIsLoadingDbLogs(false);
    }
  };

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (selectedSource !== "all" && (log.source || "runner") !== selectedSource) {
        return false;
      }
      if (searchFilter.trim()) {
        const query = searchFilter.toLowerCase();
        return (
          log.message.toLowerCase().includes(query) ||
          (log.nodeId && log.nodeId.toLowerCase().includes(query))
        );
      }
      return true;
    });
  }, [logs, selectedSource, searchFilter]);

  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = { all: logs.length, runner: 0, browser: 0, network: 0, live: 0 };
    for (const l of logs) {
      const src = l.source || "runner";
      counts[src] = (counts[src] || 0) + 1;
    }
    return counts;
  }, [logs]);

  return (
    <>
      {/* Barra o Cajón inferior de Consola */}
      <div
        className={`border-t border-zinc-800 bg-[#0c0c0e] flex flex-col transition-all duration-200 z-20 ${
          isOpen ? "h-64" : "h-9"
        }`}
      >
        {/* Encabezado / Barra Minimizable */}
        <div className="h-9 px-4 border-b border-zinc-800 bg-zinc-900 flex items-center justify-between select-none">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="flex items-center space-x-1.5 text-xs font-mono font-medium text-zinc-300 hover:text-white transition-colors"
            >
              <Terminal className="w-3.5 h-3.5 text-zinc-400" />
              <span>Consola de Ejecución</span>
              {isOpen ? (
                <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
              ) : (
                <ChevronUp className="w-3.5 h-3.5 text-zinc-500" />
              )}
            </button>

            {runStatus !== "idle" && (
              <div className="flex items-center space-x-2">
                {runStatus === "running" && (
                  <span className="flex items-center space-x-1 text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full text-[10px] font-mono animate-pulse border border-amber-500/20">
                    <Clock className="w-3 h-3" />
                    <span>
                      {runControlState === "paused"
                        ? "Pausado"
                        : runControlState === "stopping"
                        ? "Deteniendo..."
                        : "Ejecutando en Playwright..."}
                    </span>
                  </span>
                )}
                {runStatus === "success" && (
                  <span className="flex items-center space-x-1 text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full text-[10px] font-mono border border-emerald-500/20">
                    <CheckCircle className="w-3 h-3" />
                    <span>Completado Exitoso</span>
                  </span>
                )}
                {runStatus === "failed" && (
                  <span className="flex items-center space-x-1 text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full text-[10px] font-mono border border-rose-500/20">
                    <AlertCircle className="w-3 h-3" />
                    <span>Falló</span>
                  </span>
                )}

                {/* Controles interactivos de Pausa / Continuar / Detener */}
                {runStatus === "running" && (
                  <div className="flex items-center space-x-1 bg-neutral-950 border border-neutral-800 rounded px-1 py-0.5">
                    {runControlState === "paused" ? (
                      <button
                        onClick={() => handleControlAction("resume")}
                        title="Reanudar ejecución"
                        className="flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>Continuar</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleControlAction("pause")}
                        title="Pausar ejecución"
                        className="flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-600 hover:bg-amber-500 text-white font-semibold transition-colors"
                      >
                        <Pause className="w-3 h-3 fill-current" />
                        <span>Pausar</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleControlAction("stop")}
                      title="Detener ejecución"
                      className="p-1 rounded text-rose-400 hover:text-white hover:bg-rose-900/50 transition-colors"
                    >
                      <Square className="w-3 h-3 fill-current" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {isOpen && (
            <div className="flex items-center space-x-2">
              {/* Buscador en logs */}
              {activeTab === "logs" && (
                <div className="relative">
                  <Search className="w-3 h-3 absolute left-2 top-2 text-neutral-500" />
                  <input
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    placeholder="Filtrar eventos..."
                    className="w-32 bg-neutral-950 border border-neutral-800 rounded pl-6 pr-2 py-0.5 text-[11px] text-neutral-200 focus:w-44 focus:outline-none focus:border-blue-500 transition-all"
                  />
                </div>
              )}

              {/* Selector de Pestañas */}
              <div className="flex items-center rounded-md bg-neutral-950 border border-neutral-800 p-0.5">
                <button
                  onClick={() => setActiveTab("logs")}
                  className={`px-2 py-0.5 text-[11px] rounded font-medium transition-colors ${
                    activeTab === "logs"
                      ? "bg-neutral-800 text-neutral-200"
                      : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  Logs ({logs.length})
                </button>
                <button
                  onClick={() => setActiveTab("screenshots")}
                  className={`px-2 py-0.5 text-[11px] rounded font-medium transition-colors ${
                    activeTab === "screenshots"
                      ? "bg-neutral-800 text-neutral-200"
                      : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  Capturas ({screenshots.length})
                </button>
                {runId && (
                  <button
                    onClick={() => {
                      setActiveTab("db_logs");
                      loadDbLogs();
                    }}
                    className={`flex items-center space-x-1 px-2 py-0.5 text-[11px] rounded font-medium transition-colors ${
                      activeTab === "db_logs"
                        ? "bg-neutral-800 text-blue-300"
                        : "text-neutral-500 hover:text-neutral-300"
                    }`}
                    title="Ver logs guardados en BD para depuración"
                  >
                    <Database className="w-3 h-3" />
                    <span>Historial BD</span>
                  </button>
                )}
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
          <div className="flex-1 flex flex-col overflow-hidden text-xs font-mono">
            {/* Filtros de origen de log (Runner / Navegador / Red / Live) */}
            {activeTab === "logs" && (
              <div className="h-6 px-3 bg-neutral-900/40 border-b border-neutral-800 flex items-center space-x-3 text-[10px] select-none">
                <span className="text-neutral-500 uppercase font-bold tracking-wider">Origen:</span>
                <button
                  onClick={() => setSelectedSource("all")}
                  className={`hover:text-white transition-colors ${
                    selectedSource === "all" ? "text-blue-400 font-bold" : "text-neutral-400"
                  }`}
                >
                  Todos ({sourceCounts.all})
                </button>
                <button
                  onClick={() => setSelectedSource("runner")}
                  className={`hover:text-white transition-colors ${
                    selectedSource === "runner" ? "text-blue-400 font-bold" : "text-neutral-400"
                  }`}
                >
                  Runner ({sourceCounts.runner || 0})
                </button>
                <button
                  onClick={() => setSelectedSource("browser")}
                  className={`hover:text-white transition-colors ${
                    selectedSource === "browser" ? "text-amber-400 font-bold" : "text-neutral-400"
                  }`}
                >
                  Navegador ({sourceCounts.browser || 0})
                </button>
                <button
                  onClick={() => setSelectedSource("network")}
                  className={`hover:text-white transition-colors ${
                    selectedSource === "network" ? "text-rose-400 font-bold" : "text-neutral-400"
                  }`}
                >
                  Red ({sourceCounts.network || 0})
                </button>
                <button
                  onClick={() => setSelectedSource("live")}
                  className={`hover:text-white transition-colors ${
                    selectedSource === "live" ? "text-emerald-400 font-bold" : "text-neutral-400"
                  }`}
                >
                  Live ({sourceCounts.live || 0})
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-3">
              {activeTab === "logs" && (
                filteredLogs.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-neutral-600 text-xs">
                    {searchFilter ? "No se encontraron logs con ese filtro." : "Sin eventos de ejecución en vivo."}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredLogs.map((log) => (
                      <div
                        key={log.id}
                        className="flex items-start space-x-2 leading-relaxed hover:bg-neutral-900/50 p-0.5 rounded transition-colors"
                      >
                        <span className="text-neutral-500 shrink-0 text-[11px]">
                          [{log.timestamp}]
                        </span>
                        <span
                          className={`text-[10px] font-bold uppercase shrink-0 px-1 rounded ${
                            log.source === "browser"
                              ? "bg-amber-950/60 text-amber-400"
                              : log.source === "network"
                              ? "bg-rose-950/60 text-rose-400"
                              : log.source === "live"
                              ? "bg-emerald-950/60 text-emerald-400"
                              : "bg-blue-950/60 text-blue-400"
                          }`}
                        >
                          {log.source || "runner"}
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
                              : log.level === "warn"
                              ? "text-amber-300"
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
              )}

              {activeTab === "screenshots" && (
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

              {activeTab === "db_logs" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-neutral-400 pb-1 border-b border-neutral-800">
                    <span>Logs persistidos en Base de Datos para Run [{runId}]</span>
                    <button
                      onClick={loadDbLogs}
                      disabled={isLoadingDbLogs}
                      className="flex items-center space-x-1 px-2 py-0.5 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-300 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${isLoadingDbLogs ? "animate-spin" : ""}`} />
                      <span>Refrescar</span>
                    </button>
                  </div>

                  {dbLogs.length === 0 ? (
                    <div className="text-center py-6 text-neutral-600 text-xs">
                      {isLoadingDbLogs ? "Cargando logs de BD..." : "Sin logs persistidos para esta ejecución."}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {dbLogs.map((log: any) => (
                        <div key={log.id} className="flex items-start space-x-2 text-[11px] leading-relaxed">
                          <span className="text-neutral-500 shrink-0">[{log.id}]</span>
                          <span className="text-neutral-500 shrink-0">
                            {new Date(log.logged_at).toLocaleTimeString()}
                          </span>
                          <span className="text-blue-400 font-bold uppercase shrink-0">[{log.source}]</span>
                          <span
                            className={`font-bold uppercase shrink-0 ${
                              log.level === "error"
                                ? "text-rose-400"
                                : log.level === "warn"
                                ? "text-amber-400"
                                : "text-neutral-300"
                            }`}
                          >
                            [{log.level}]
                          </span>
                          {log.node_id && <span className="text-neutral-400 bg-neutral-900 px-1 rounded">{log.node_id}</span>}
                          <span className="text-neutral-200">{log.message}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
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
              <span className="text-xs font-semibold text-neutral-300">Visualizador de Captura Playwright</span>
              <button onClick={() => setSelectedImage(null)} className="p-1 rounded text-neutral-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selectedImage} alt="Captura en pantalla completa" className="max-h-[75vh] w-auto object-contain mx-auto" />
          </div>
        </div>
      )}
    </>
  );
}
