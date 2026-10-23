"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  Save,
  Play,
  Pause,
  Square,
  RotateCcw,
  RotateCw,
  CheckCircle2,
  AlertCircle,
  Layout,
  ListOrdered,
  Code2,
  Loader2,
  Key,
  Clock,
  Lock,
  CircleDot,
  LogOut,
  Globe,
  Monitor,
  Zap,
  Columns,
  Maximize2,
  ChevronDown,
  Check,
  MoreHorizontal,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useRecipeStore } from "../../stores/use-recipe-store";
import { useLayoutStore } from "../../stores/use-layout-store";
import { apiFetch } from "../../lib/api-client";
import { getEcho } from "../../lib/echo";
import { useAuth } from "../../context/auth-context";
import { ExportModal } from "./export-modal";
import { TriggersModal } from "./triggers-modal";
import { SecretsModal } from "./secrets-modal";
import { useLiveStore } from "../../stores/use-live-store";
import { dispatchRunControl } from "../../lib/execution-control";
import { runRecipeInLivePanel } from "../../lib/live-runner";

interface EditorHeaderProps {
  onSave?: () => Promise<boolean | void>;
  isSaving?: boolean;
}

function getInitials(name?: string): string {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatValidationError(err: string, nodes: Record<string, any> = {}): string {
  const match = err.match(/^nodes\.([^.]+)\.(.+)$/);
  if (!match) return err;
  const nodeId = match[1];
  const rest = match[2];
  const node = nodes[nodeId];
  const nodeLabel = node?.type ? node.type.toUpperCase() : nodeId;
  if (rest.includes("Invalid discriminator value")) {
    return `Paso [${nodeLabel}]: El tipo '${node?.type || nodeId}' no está cargado en esta sesión. Recarga la página (Ctrl+Shift+R).`;
  }
  const colonIdx = rest.indexOf(": ");
  if (colonIdx !== -1) {
    const message = rest.substring(colonIdx + 2);
    return `Paso [${nodeLabel}]: ${message}`;
  }
  return `Paso [${nodeLabel}]: ${rest}`;
}

export function EditorHeader({ onSave, isSaving }: EditorHeaderProps) {
  const recipeName = useRecipeStore((s) => s.recipeName);
  const setName = useRecipeStore((s) => s.setName);
  const recipeVersion = useRecipeStore((s) => s.recipeVersion);
  const activeView = useRecipeStore((s) => s.activeView);
  const setActiveView = useRecipeStore((s) => s.setActiveView);
  const validationErrors = useRecipeStore((s) => s.validationErrors);
  const undo = useRecipeStore((s) => s.undo);
  const redo = useRecipeStore((s) => s.redo);
  const isDirty = useRecipeStore((s) => s.isDirty);
  const recipeId = useRecipeStore((s) => s.recipeId);
  const definition = useRecipeStore((s) => s.definition);
  const startRun = useRecipeStore((s) => s.startRun);
  const runId = useRecipeStore((s) => s.runId);
  const runStatus = useRecipeStore((s) => s.runStatus);
  const runControlState = useRecipeStore((s) => s.runControlState);

  // Layout Store
  const layoutMode = useLayoutStore((s) => s.mode);
  const setLayoutMode = useLayoutStore((s) => s.setMode);

  // Sitio en vivo & Grabador
  const liveOpen = useLiveStore((s) => s.isOpen);
  const isRecording = useRecipeStore((s) => s.isRecording);
  const startRecording = useRecipeStore((s) => s.startRecording);
  const appendRecordedAction = useRecipeStore((s) => s.appendRecordedAction);

  const [isExecuting, setIsExecuting] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const { user, logout } = useAuth();

  // Estados de menús desplegables
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isLiveMenuOpen, setIsLiveMenuOpen] = useState(false);
  const [isRunOptionsOpen, setIsRunOptionsOpen] = useState(false);
  const [isRecordPopoverOpen, setIsRecordPopoverOpen] = useState(false);

  // Modales
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isTriggersOpen, setIsTriggersOpen] = useState(false);
  const [isSecretsOpen, setIsSecretsOpen] = useState(false);

  // Parámetros de grabación y ejecución
  const [recordUrl, setRecordUrl] = useState("http://localhost:8099/index.html");
  const [isStartingRecording, setIsStartingRecording] = useState(false);
  const [displayMode, setDisplayMode] = useState<"headed" | "live" | "headless">("headed");
  const [slowMoMs, setSlowMoMs] = useState<number>(350);
  const [highlight, setHighlight] = useState<boolean>(true);
  const [keepOpenMs, setKeepOpenMs] = useState<number>(0);

  const headerRef = useRef<HTMLElement>(null);

  // Cerrar popovers al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setIsToolsMenuOpen(false);
        setIsUserMenuOpen(false);
        setIsLiveMenuOpen(false);
        setIsRunOptionsOpen(false);
        setIsRecordPopoverOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Suscripción a Reverb para capturar acciones del grabador
  useEffect(() => {
    if (!recipeId) return;

    const echo = getEcho();
    if (!echo) return;

    const channel = echo.channel(`recipe.${recipeId}`);
    channel.listen(".recording.action", (e: { action: any }) => {
      if (e?.action) {
        appendRecordedAction(e.action);
      }
    });

    return () => {
      echo.leaveChannel(`recipe.${recipeId}`);
    };
  }, [recipeId, appendRecordedAction]);

  const ensureAuthenticated = async (): Promise<boolean> => {
    return !!user;
  };

  const handleRun = async () => {
    if (!recipeId || runStatus === "running") return;
    setIsExecuting(true);
    setIsRunOptionsOpen(false);

    try {
      if (displayMode === "live") {
        if (!liveOpen) useLiveStore.getState().open();
        if (layoutMode === "flow") setLayoutMode("split");
        await runRecipeInLivePanel(definition, slowMoMs);
        return;
      }

      await ensureAuthenticated();
      const res = await apiFetch<{ data: { id: string } }>(
        `/api/v1/recipes/${recipeId}/runs`,
        {
          method: "POST",
          body: JSON.stringify({
            parameters: {},
            options: {
              display: displayMode,
              slow_mo_ms: slowMoMs,
              highlight: highlight,
              keep_open_ms: keepOpenMs,
            },
          }),
        }
      );
      if (res?.data?.id) {
        startRun(res.data.id);
      }
    } catch (err) {
      console.error("Error al despachar ejecución:", err);
      const mockRunId = `run_mock_${Math.random().toString(36).substring(2, 8)}`;
      startRun(mockRunId);
    } finally {
      setIsExecuting(false);
    }
  };

  const showSaveSuccess = () => {
    setSaveFailed(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const showSaveFailure = () => {
    setSaveSuccess(false);
    setSaveFailed(true);
    setTimeout(() => setSaveFailed(false), 4000);
  };

  const handleSaveInternal = async () => {
    setSaveFailed(false);
    await ensureAuthenticated();

    if (onSave) {
      const result = await onSave();
      if (result === false) {
        showSaveFailure();
      } else {
        showSaveSuccess();
      }
      return;
    }

    if (!recipeId || recipeId === "new") {
      showSaveFailure();
      return;
    }
    try {
      await apiFetch(`/api/v1/recipes/${recipeId}`, {
        method: "PUT",
        body: JSON.stringify({
          name: recipeName,
          definition,
        }),
      });
      showSaveSuccess();
    } catch (err) {
      console.error("Error al guardar la receta:", err);
      showSaveFailure();
    }
  };

  const handleStartRecording = async () => {
    if (!recipeId || !recordUrl.trim()) return;
    setIsStartingRecording(true);
    try {
      await ensureAuthenticated();
      const res = await apiFetch<{ session_id: string }>(
        `/api/v1/recipes/${recipeId}/recorder/start`,
        {
          method: "POST",
          body: JSON.stringify({ initial_url: recordUrl.trim() }),
        }
      );
      if (res.session_id) {
        startRecording(res.session_id);
        setIsRecordPopoverOpen(false);
      }
    } catch (err: any) {
      alert(`Error al iniciar grabador: ${err.message || err}`);
    } finally {
      setIsStartingRecording(false);
    }
  };

  const toggleLivePanel = () => {
    if (liveOpen) {
      useLiveStore.getState().close(recipeId);
      setLayoutMode("flow");
    } else {
      useLiveStore.getState().open();
      setLayoutMode("split");
    }
  };

  return (
    <>
      <header
        ref={headerRef}
        className="h-13 bg-[#0c0c0e] border-b border-zinc-800 px-4 flex items-center justify-between select-none relative z-40"
      >
        {/* ============================================================== */}
        {/* ZONA 1 (IZQUIERDA): Identidad limpia y Estado sutil de guardado */}
        {/* ============================================================== */}
        <div className="flex items-center space-x-3 min-w-0">
          <Link
            href="/recipes"
            className="p-1.5 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            title="Volver a mis recetas"
          >
            <ChevronLeft className="w-4 h-4" />
          </Link>

          <div className="h-3.5 w-px bg-zinc-800" />

          {/* Título editable in-place */}
          <div className="flex items-center space-x-2 min-w-0">
            <input
              type="text"
              value={recipeName}
              onChange={(e) => setName(e.target.value)}
              title="Haz clic para renombrar la receta"
              className="bg-transparent hover:bg-zinc-900/60 focus:bg-zinc-900 font-medium text-xs text-zinc-100 px-2 py-1 rounded border border-transparent hover:border-zinc-800 focus:border-zinc-600 transition-colors max-w-[150px] sm:max-w-[220px] md:max-w-[320px] truncate outline-none"
            />

            {/* Estado sutil de guardado / cambios */}
            <div className="flex items-center text-xs shrink-0 pl-1">
              {isSaving ? (
                <span className="flex items-center space-x-1.5 text-zinc-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span className="hidden sm:inline text-[11px] font-mono">Guardando...</span>
                </span>
              ) : saveSuccess ? (
                <span className="flex items-center space-x-1 text-emerald-400 font-medium font-mono">
                  <Check className="w-3 h-3" />
                  <span className="hidden sm:inline text-[11px]">Guardado</span>
                </span>
              ) : saveFailed ? (
                <span
                  title="No se pudo guardar la receta en el servidor"
                  className="flex items-center space-x-1 text-rose-400 font-medium font-mono"
                >
                  <AlertCircle className="w-3 h-3" />
                  <span className="hidden sm:inline text-[11px]">Error al guardar</span>
                </span>
              ) : isDirty ? (
                <button
                  onClick={handleSaveInternal}
                  title="Guardar cambios (Ctrl+S)"
                  className="flex items-center space-x-1.5 px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-750 text-amber-400 border border-zinc-700/60 transition-colors text-[11px] font-mono"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span>Guardar</span>
                </button>
              ) : (
                <span className="text-[11px] text-zinc-500 font-mono hidden sm:inline">
                  Guardado
                </span>
              )}
            </div>

            {/* Alerta si hay errores de validación */}
            {validationErrors.length > 0 && (
              <div
                title={validationErrors.map((e) => formatValidationError(e, definition?.nodes)).join("\n")}
                className="flex items-center space-x-1 px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[11px] font-mono cursor-help shrink-0"
              >
                <AlertCircle className="w-3 h-3" />
                <span className="hidden md:inline">
                  {validationErrors.length} {validationErrors.length === 1 ? "error" : "errores"}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ============================================================== */}
        {/* ZONA 2 (CENTRO): Selector Limpio de Vistas (Lienzo / Código)   */}
        {/* ============================================================== */}
        <div className="flex items-center rounded-md bg-zinc-950 border border-zinc-800 p-0.5">
          <button
            onClick={() => setActiveView("canvas")}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs font-mono transition-colors ${
              activeView === "canvas" || activeView === "steps"
                ? "bg-zinc-800 text-zinc-100 font-medium"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Layout className="w-3.5 h-3.5" />
            <span>Lienzo</span>
          </button>
          <button
            onClick={() => setActiveView("code")}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs font-mono transition-colors ${
              activeView === "code"
                ? "bg-zinc-800 text-zinc-100 font-medium"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Código</span>
          </button>
        </div>

        {/* ============================================================== */}
        {/* ZONA 3 (DERECHA): Solo 4 Elementos (Web, Ejecutar, ⋯, Usuario) */}
        {/* ============================================================== */}
        <div className="flex items-center space-x-2">
          {/* 3.1 Botón Sitio Web */}
          <div className="relative">
            <div
              className={`flex items-center rounded-md border transition-colors ${
                liveOpen
                  ? "bg-zinc-800 border-zinc-700 text-zinc-100"
                  : "bg-zinc-900 hover:bg-zinc-850 border-zinc-800 text-zinc-300 hover:text-white"
              }`}
            >
              <button
                onClick={toggleLivePanel}
                className="flex items-center space-x-1.5 px-2.5 py-1 text-xs font-medium"
                title="Abrir o cerrar navegador interactivo (Ctrl+\)"
              >
                <Globe className={`w-3.5 h-3.5 ${liveOpen ? "text-zinc-200" : "text-zinc-400"}`} />
                <span>Sitio Web</span>
              </button>
              <button
                onClick={() => setIsLiveMenuOpen(!isLiveMenuOpen)}
                className="p-1 pr-1.5 text-zinc-400 hover:text-white transition-colors"
                title="Opciones de pantalla del sitio web (Ctrl+\)"
              >
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>

            {isLiveMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 shadow-xl z-50 text-xs">
                <div className="px-2.5 py-1 text-[10px] font-mono font-semibold text-zinc-400 uppercase tracking-wider">
                  Modo de Pantalla
                </div>
                <button
                  onClick={() => {
                    if (!liveOpen) useLiveStore.getState().open();
                    setLayoutMode("split");
                    setIsLiveMenuOpen(false);
                  }}
                  className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-md text-left transition-colors ${
                    layoutMode === "split" && liveOpen
                      ? "bg-zinc-800 text-zinc-100 font-medium"
                      : "text-zinc-300 hover:bg-zinc-800/60 hover:text-white"
                  }`}
                >
                  <Columns className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <div>
                    <div className="font-medium">Lado a Lado (Dividido)</div>
                    <div className="text-[10px] text-zinc-400">Lienzo y sitio web juntos</div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    if (!liveOpen) useLiveStore.getState().open();
                    setLayoutMode("full_site");
                    setIsLiveMenuOpen(false);
                  }}
                  className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-md text-left transition-colors ${
                    layoutMode === "full_site" && liveOpen
                      ? "bg-zinc-800 text-zinc-100 font-medium"
                      : "text-zinc-300 hover:bg-zinc-800/60 hover:text-white"
                  }`}
                >
                  <Maximize2 className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <div>
                    <div className="font-medium">Sitio Completo (Enfocado)</div>
                    <div className="text-[10px] text-zinc-400">Oculta los bloques del flujo</div>
                  </div>
                </button>

                {liveOpen && (
                  <>
                    <div className="h-px bg-zinc-800 my-1" />
                    <button
                      onClick={() => {
                        toggleLivePanel();
                        setIsLiveMenuOpen(false);
                      }}
                      className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-md text-left text-zinc-400 hover:bg-zinc-800 hover:text-rose-400 transition-colors"
                    >
                      <X className="w-3.5 h-3.5 shrink-0" />
                      <span>Ocultar Sitio Web</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* 3.2 Botón Primario: Ejecutar Flujo (Hero CTA) */}
          {runStatus === "running" ? (
            <div className="flex items-center space-x-1.5 bg-neutral-950 border border-neutral-800 rounded-lg p-1 shadow">
              <div className="flex items-center space-x-1 px-2 py-0.5 text-xs font-semibold">
                {runControlState === "paused" ? (
                  <span className="flex items-center space-x-1 text-amber-400">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    <span className="hidden sm:inline">Pausado</span>
                  </span>
                ) : (
                  <span className="flex items-center space-x-1 text-emerald-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block mr-0.5" />
                    <span className="hidden sm:inline">Ejecutando</span>
                  </span>
                )}
              </div>

              {runControlState === "paused" ? (
                <button
                  onClick={() => dispatchRunControl("resume", runId)}
                  className="flex items-center space-x-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition shadow"
                  title="Reanudar ejecución"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>Reanudar</span>
                </button>
              ) : (
                <button
                  onClick={() => dispatchRunControl("pause", runId)}
                  className="flex items-center space-x-1 px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition shadow"
                  title="Pausar ejecución"
                >
                  <Pause className="w-3 h-3 fill-current" />
                  <span>Pausar</span>
                </button>
              )}

              <button
                onClick={() => dispatchRunControl("stop", runId)}
                className="flex items-center space-x-1 px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition shadow"
                title="Detener ejecución inmediatamente"
              >
                <Square className="w-3 h-3 fill-current" />
                <span>Detener</span>
              </button>
            </div>
          ) : (
            <div className="relative flex items-center">
              <div className="flex items-center rounded-lg overflow-hidden shadow-md bg-emerald-600 hover:bg-emerald-500 transition-colors">
                <button
                  onClick={handleRun}
                  disabled={isExecuting || validationErrors.length > 0}
                  className="flex items-center space-x-1.5 px-3 py-1.5 text-white text-xs font-semibold disabled:opacity-40 transition-colors"
                >
                  {isExecuting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current" />
                  )}
                  <span>Ejecutar</span>
                </button>

                <button
                  onClick={() => setIsRunOptionsOpen(!isRunOptionsOpen)}
                  disabled={isExecuting}
                  className="p-1.5 px-2 bg-emerald-700/80 hover:bg-emerald-700 text-white border-l border-emerald-700/60 transition-colors"
                  title="Opciones de ejecución (Chromium, Panel, Headless, Velocidad)"
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>

              {/* Menú de opciones de ejecución */}
              {isRunOptionsOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-neutral-900 border border-neutral-800 rounded-xl p-3.5 shadow-2xl z-50 animate-in fade-in zoom-in-95 select-none text-xs">
                  <div className="flex items-center justify-between font-semibold text-neutral-200 border-b border-neutral-800 pb-2 mb-3">
                    <span>Opciones de Ejecución</span>
                    <span className="text-[10px] text-neutral-400 font-normal">Playwright & Runner</span>
                  </div>

                  <div className="space-y-1.5 mb-3">
                    <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                      Modo de Visualización
                    </label>
                    <div className="grid grid-cols-1 gap-1">
                      <button
                        onClick={() => setDisplayMode("headed")}
                        className={`flex items-start space-x-2.5 p-2 rounded-lg text-left transition-colors border ${
                          displayMode === "headed"
                            ? "bg-blue-600/15 border-blue-500 text-blue-300"
                            : "bg-neutral-950 border-neutral-800 hover:bg-neutral-800 text-neutral-300"
                        }`}
                      >
                        <Monitor className="w-4 h-4 mt-0.5 text-blue-400 shrink-0" />
                        <div>
                          <div className="font-semibold text-neutral-100 flex items-center space-x-1.5">
                            <span>Ventana Chromium (Headed)</span>
                            <span className="text-[9px] bg-blue-500/20 text-blue-300 px-1 rounded">Recomendado</span>
                          </div>
                          <div className="text-[10px] text-neutral-400 mt-0.5">
                            Abre una ventana real de Chromium para observar clics y tipeos.
                          </div>
                        </div>
                      </button>

                      <button
                        onClick={() => setDisplayMode("live")}
                        className={`flex items-start space-x-2.5 p-2 rounded-lg text-left transition-colors border ${
                          displayMode === "live"
                            ? "bg-blue-600/15 border-blue-500 text-blue-300"
                            : "bg-neutral-950 border-neutral-800 hover:bg-neutral-800 text-neutral-300"
                        }`}
                      >
                        <Globe className="w-4 h-4 mt-0.5 text-emerald-400 shrink-0" />
                        <div>
                          <div className="font-semibold text-neutral-100">En el Panel (Simulación)</div>
                          <div className="text-[10px] text-neutral-400 mt-0.5">
                            Ejecuta interactivamente dentro del panel embebido de RPA Studio.
                          </div>
                        </div>
                      </button>

                      <button
                        onClick={() => setDisplayMode("headless")}
                        className={`flex items-start space-x-2.5 p-2 rounded-lg text-left transition-colors border ${
                          displayMode === "headless"
                            ? "bg-blue-600/15 border-blue-500 text-blue-300"
                            : "bg-neutral-950 border-neutral-800 hover:bg-neutral-800 text-neutral-300"
                        }`}
                      >
                        <Zap className="w-4 h-4 mt-0.5 text-amber-400 shrink-0" />
                        <div>
                          <div className="font-semibold text-neutral-100">Segundo Plano (Headless)</div>
                          <div className="text-[10px] text-neutral-400 mt-0.5">
                            Ejecución rápida sin ventana gráfica.
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5 mb-3">
                    <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                      Velocidad (Pausa entre Pasos)
                    </label>
                    <div className="grid grid-cols-3 gap-1">
                      <button
                        onClick={() => setSlowMoMs(0)}
                        className={`py-1.5 px-2 rounded-md font-medium text-center border transition-colors ${
                          slowMoMs === 0
                            ? "bg-blue-600 text-white border-blue-500"
                            : "bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-white"
                        }`}
                      >
                        Rápida (0ms)
                      </button>
                      <button
                        onClick={() => setSlowMoMs(350)}
                        className={`py-1.5 px-2 rounded-md font-medium text-center border transition-colors ${
                          slowMoMs === 350
                            ? "bg-blue-600 text-white border-blue-500"
                            : "bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-white"
                        }`}
                      >
                        Normal (350ms)
                      </button>
                      <button
                        onClick={() => setSlowMoMs(800)}
                        className={`py-1.5 px-2 rounded-md font-medium text-center border transition-colors ${
                          slowMoMs === 800
                            ? "bg-blue-600 text-white border-blue-500"
                            : "bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-white"
                        }`}
                      >
                        Lenta (800ms)
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-neutral-800 flex justify-end">
                    <button
                      onClick={() => setIsRunOptionsOpen(false)}
                      className="px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-medium"
                    >
                      Listo
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 3.3 Menú Unificado de Herramientas `⋯` */}
          <div className="relative">
            <button
              onClick={() => setIsToolsMenuOpen(!isToolsMenuOpen)}
              className={`p-1.5 rounded-lg transition-colors border ${
                isToolsMenuOpen
                  ? "bg-neutral-800 border-neutral-700 text-white"
                  : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-800"
              }`}
              title="Más herramientas y opciones"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            {isToolsMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-neutral-900 border border-neutral-800 rounded-xl p-1.5 shadow-2xl z-50 animate-in fade-in zoom-in-95 text-xs">
                <div className="px-2.5 py-1.5 text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
                  Acciones y Automatización
                </div>

                {/* Opción Grabar acciones */}
                <button
                  onClick={() => {
                    setIsRecordPopoverOpen(true);
                    setIsToolsMenuOpen(false);
                  }}
                  className="w-full flex items-start space-x-2.5 px-2.5 py-2 rounded-lg text-left text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
                >
                  <CircleDot className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-medium text-neutral-100">Grabar Acciones en Vivo</div>
                    <div className="text-[10px] text-neutral-400">Capturar clics y tipeos con el navegador</div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setIsTriggersOpen(true);
                    setIsToolsMenuOpen(false);
                  }}
                  className="w-full flex items-start space-x-2.5 px-2.5 py-2 rounded-lg text-left text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
                >
                  <Clock className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-medium text-neutral-100">Programación (Triggers)</div>
                    <div className="text-[10px] text-neutral-400">Automatizar con Cron y Webhooks</div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setIsSecretsOpen(true);
                    setIsToolsMenuOpen(false);
                  }}
                  className="w-full flex items-start space-x-2.5 px-2.5 py-2 rounded-lg text-left text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
                >
                  <Lock className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-medium text-neutral-100">Secretos y Credenciales</div>
                    <div className="text-[10px] text-neutral-400">Contraseñas y variables cifradas</div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setIsExportOpen(true);
                    setIsToolsMenuOpen(false);
                  }}
                  className="w-full flex items-start space-x-2.5 px-2.5 py-2 rounded-lg text-left text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
                >
                  <Code2 className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-medium text-neutral-100">Exportar Playwright TS</div>
                    <div className="text-[10px] text-neutral-400">Descargar código autónomo</div>
                  </div>
                </button>

                <div className="h-px bg-neutral-800 my-1" />

                {/* Deshacer / Rehacer */}
                <div className="px-2.5 py-1.5 flex items-center justify-between text-neutral-400">
                  <span className="text-[11px]">Historial:</span>
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={undo}
                      title="Deshacer (Ctrl+Z)"
                      className="p-1 rounded hover:bg-neutral-800 hover:text-white transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={redo}
                      title="Rehacer (Ctrl+Y)"
                      className="p-1 rounded hover:bg-neutral-800 hover:text-white transition-colors"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="h-3.5 w-px bg-zinc-800 mx-0.5" />

          {/* 3.4 Menú de Usuario */}
          {user ? (
            <div className="relative">
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="w-6 h-6 rounded bg-zinc-800 border border-zinc-700/60 flex items-center justify-center text-[10px] font-mono font-medium text-zinc-200 hover:bg-zinc-750 transition-colors cursor-pointer"
                title={`${user.name} (${user.email})`}
              >
                {getInitials(user.name)}
              </button>

              {isUserMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 shadow-xl z-50 text-xs">
                  <div className="px-2.5 py-2 border-b border-zinc-800">
                    <div className="font-medium text-zinc-100 truncate">{user.name}</div>
                    <div className="text-[11px] font-mono text-zinc-400 truncate">{user.email}</div>
                  </div>

                  <button
                    onClick={() => logout()}
                    className="w-full flex items-center space-x-2 px-2.5 py-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-rose-400 rounded-md transition-colors mt-1"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Cerrar Sesión</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/login"
              className="flex items-center space-x-1 px-2.5 py-1 rounded bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-medium transition-colors shadow-sm"
            >
              <Key className="w-3 h-3" />
              <span className="hidden sm:inline">Acceder</span>
            </Link>
          )}
        </div>
      </header>

      {/* Modal para Iniciar Grabador de Acciones */}
      {isRecordPopoverOpen && !isRecording && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-xl p-4 shadow-2xl">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-neutral-100 flex items-center space-x-2">
                <CircleDot className="w-4 h-4 text-rose-500" />
                <span>Grabar Acciones en Vivo</span>
              </div>
              <button
                onClick={() => setIsRecordPopoverOpen(false)}
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-neutral-400 mb-3 leading-relaxed">
              Playwright abrirá la URL e insertará cada clic o texto directamente como nuevos bloques en el flujo.
            </p>
            <input
              type="url"
              value={recordUrl}
              onChange={(e) => setRecordUrl(e.target.value)}
              placeholder="http://localhost:8099/index.html"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-100 mb-4 outline-none focus:border-rose-500 font-mono"
            />
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setIsRecordPopoverOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-neutral-400 hover:text-white hover:bg-neutral-800"
              >
                Cancelar
              </button>
              <button
                onClick={handleStartRecording}
                disabled={isStartingRecording}
                className="flex items-center space-x-1 px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow transition-colors"
              >
                {isStartingRecording && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
                <span>Comenzar Grabación</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modales Desacoplados de Fase 4 */}
      <ExportModal
        recipeId={recipeId || ""}
        recipeName={recipeName}
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
      />

      <TriggersModal
        recipeId={recipeId || ""}
        isOpen={isTriggersOpen}
        onClose={() => setIsTriggersOpen(false)}
      />

      <SecretsModal
        isOpen={isSecretsOpen}
        onClose={() => setIsSecretsOpen(false)}
      />
    </>
  );
}
