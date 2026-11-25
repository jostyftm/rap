"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Terminal,
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
  RefreshCw,
  Radio,
  Copy,
  Check,
  Send,
  Loader2,
  Activity,
  Maximize2,
  Minimize2,
  Image as ImageIcon,
} from "lucide-react";
import type { WebhookNode } from "@rpa/dsl";
import {
  useRecipeStore,
  type ExecutionLog,
  type ExecutionScreenshot,
} from "../../stores/use-recipe-store";
import { getEcho } from "../../lib/echo";
import { dispatchRunControl } from "../../lib/execution-control";
import {
  buildProductionWebhookUrl,
  buildTestWebhookUrl,
} from "../../lib/webhook-url";
import { copyToClipboard } from "../../lib/clipboard";
import {
  fetchRecipeRuns,
  fetchRunDetail,
  fetchRunLogs,
  resolveArtifactUrl,
  type RunDetail,
  type RunSummary,
} from "../../lib/run-api";
import { RunResultPanel } from "./run-result-panel";

function mapRunStatus(
  status?: string | null
): "running" | "success" | "failed" {
  if (status === "completed" || status === "success") return "success";
  if (status === "failed" || status === "stopped") return "failed";
  return "running";
}

function mapControlState(
  status?: string | null
): "idle" | "running" | "paused" | "stopping" | "waiting" {
  if (status === "waiting") return "waiting";
  if (status === "paused") return "paused";
  if (status === "queued" || status === "running") return "running";
  return "idle";
}

export function ExecutionConsole() {
  const isOpen = useRecipeStore((s) => s.consoleOpen);
  const setIsOpen = useRecipeStore((s) => s.setConsoleOpen);
  const activeTab = useRecipeStore((s) => s.consoleTab);
  const setActiveTab = useRecipeStore((s) => s.setConsoleTab);

  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<string>("all");
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [isRefreshingRun, setIsRefreshingRun] = useState(false);

  // Estado del historial de ejecuciones de la receta
  const [runsList, setRunsList] = useState<RunSummary[]>([]);
  const [isLoadingRuns, setIsLoadingRuns] = useState(false);
  const [runsTriggerFilter, setRunsTriggerFilter] = useState<string>("all");

  const recipeId = useRecipeStore((s) => s.recipeId);
  const runId = useRecipeStore((s) => s.runId);
  const runStatus = useRecipeStore((s) => s.runStatus);
  const runControlState = useRecipeStore((s) => s.runControlState);
  const runTrigger = useRecipeStore((s) => s.runTrigger);
  const runVersion = useRecipeStore((s) => s.runVersion);
  const runIsDraft = useRecipeStore((s) => s.runIsDraft);
  const runParameters = useRecipeStore((s) => s.runParameters);
  const runResult = useRecipeStore((s) => s.runResult);
  const runDurationMs = useRecipeStore((s) => s.runDurationMs);
  const runErrorMessage = useRecipeStore((s) => s.runErrorMessage);
  const runSteps = useRecipeStore((s) => s.runSteps);
  const logs = useRecipeStore((s) => s.logs);
  const screenshots = useRecipeStore((s) => s.screenshots);

  const setRunningNodeId = useRecipeStore((s) => s.setRunningNodeId);
  const setRunControlState = useRecipeStore((s) => s.setRunControlState);
  const setSelectedNodeId = useRecipeStore((s) => s.setSelectedNodeId);
  const attachRun = useRecipeStore((s) => s.attachRun);
  const setRunMeta = useRecipeStore((s) => s.setRunMeta);
  const upsertRunStep = useRecipeStore((s) => s.upsertRunStep);
  const hydrateRunLogs = useRecipeStore((s) => s.hydrateRunLogs);
  const hydrateRunScreenshots = useRecipeStore((s) => s.hydrateRunScreenshots);
  const addLog = useRecipeStore((s) => s.addLog);
  const addScreenshot = useRecipeStore((s) => s.addScreenshot);
  const finishRun = useRecipeStore((s) => s.finishRun);
  const clearRunState = useRecipeStore((s) => s.clearRunState);

  const definition = useRecipeStore((s) => s.definition);
  const editorMode = useRecipeStore((s) => s.editorMode);
  const [isCopied, setIsCopied] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);

  const editorOpenedAtRef = useRef<number>(Date.now());
  const seenExternalRunIdsRef = useRef<Set<string>>(new Set());
  const initializedDiscoveryRef = useRef<boolean>(false);

  // Detectar información del webhook si el flujo inicia con él
  const entryNode = definition?.entry
    ? definition.nodes[definition.entry]
    : undefined;
  const webhookNode = (
    entryNode?.type === "webhook"
      ? entryNode
      : Object.values(definition?.nodes || {}).find((n) => n.type === "webhook")
  ) as WebhookNode | undefined;

  const webhookPath =
    webhookNode?.params?.path ||
    (webhookNode ? `/api/v1/webhooks/${webhookNode.id}` : "/webhook");
  const webhookUrl =
    editorMode === "published"
      ? buildProductionWebhookUrl(webhookPath, webhookNode?.id)
      : buildTestWebhookUrl(webhookPath, webhookNode?.id);
  const webhookMethod = webhookNode?.params?.httpMethod || "POST";

  const handleCopyWebhookUrl = async () => {
    if (await copyToClipboard(webhookUrl)) {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const handleSendTestPayload = async () => {
    setIsSendingTest(true);
    try {
      const samplePayload = {
        fecha: new Date().toISOString().slice(0, 10),
        timestamp: new Date().toISOString(),
        origen: "Consola RPA Studio",
      };
      await fetch(webhookUrl, {
        method: webhookMethod === "ANY" ? "POST" : webhookMethod,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(samplePayload),
      });
    } catch (err) {
      console.error("Error al enviar payload de prueba:", err);
    } finally {
      setIsSendingTest(false);
    }
  };

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Resetear contadores de descubrimiento al cambiar de receta
  useEffect(() => {
    editorOpenedAtRef.current = Date.now();
    seenExternalRunIdsRef.current = new Set();
    initializedDiscoveryRef.current = false;
    setRunsList([]);
  }, [recipeId]);

  // Hidrata detalle, pasos, capturas y logs de un run desde la API
  const hydrateRunFromServer = useCallback(
    async (targetRunId: string): Promise<RunDetail | null> => {
      if (!targetRunId || targetRunId.startsWith("run_mock_")) {
        return null;
      }

      try {
        const [detail, dbLogEntries] = await Promise.all([
          fetchRunDetail(targetRunId),
          fetchRunLogs(targetRunId, 500),
        ]);

        if (useRecipeStore.getState().runId !== targetRunId) {
          return detail;
        }

        if (detail) {
          setRunMeta({
            trigger: detail.trigger,
            version: detail.recipe_version ?? null,
            isDraft: !!detail.is_draft,
            parameters: detail.parameters ?? null,
            result: detail.result ?? null,
            durationMs: detail.duration_ms ?? null,
            errorMessage: detail.error_message ?? null,
            status: mapRunStatus(detail.status),
            controlState: mapControlState(detail.status),
          });

          const collectedShots: Array<
            Omit<ExecutionScreenshot, "id" | "timestamp"> & { timestamp?: string }
          > = [];

          if (Array.isArray(detail.steps)) {
            let activeRunningNode: string | null = null;
            for (const step of detail.steps) {
              const resolvedUrl =
                step.screenshot_url || resolveArtifactUrl(step.screenshot_path);
              upsertRunStep({
                nodeId: step.node_id,
                status: step.status,
                durationMs: step.duration_ms ?? null,
                locatorStrategy: step.locator_strategy ?? null,
                locatorValue: step.locator_value ?? null,
                output: step.output,
                screenshotPath: step.screenshot_path ?? null,
                screenshotUrl: resolvedUrl,
                errorMessage: step.error_message ?? null,
              });

              if (step.status === "running") {
                activeRunningNode = step.node_id;
              }

              if (resolvedUrl) {
                collectedShots.push({
                  nodeId: step.node_id,
                  url: resolvedUrl,
                  artifactKey: step.screenshot_path || resolvedUrl.split("?")[0],
                });
              }
            }
            if (detail.status === "running" || detail.status === "queued") {
              setRunningNodeId(activeRunningNode);
            } else {
              setRunningNodeId(null);
            }
          }

          if (Array.isArray(detail.artifacts)) {
            for (const artifact of detail.artifacts) {
              if (artifact.type !== "screenshot") continue;
              const shotUrl =
                artifact.url || resolveArtifactUrl(artifact.s3_key);
              if (!shotUrl) continue;
              const metaNode =
                typeof artifact.metadata?.node_id === "string"
                  ? artifact.metadata.node_id
                  : "final";
              collectedShots.push({
                nodeId: metaNode,
                url: shotUrl,
                artifactKey: artifact.s3_key || shotUrl.split("?")[0],
              });
            }
          }

          if (collectedShots.length > 0) {
            hydrateRunScreenshots(collectedShots);
          }
        }

        if (Array.isArray(dbLogEntries) && dbLogEntries.length > 0) {
          const normalizedLogs: ExecutionLog[] = dbLogEntries.map((entry) => ({
            id: `db_${entry.id}`,
            dbId: entry.id,
            timestamp: entry.logged_at
              ? new Date(entry.logged_at).toLocaleTimeString()
              : new Date().toLocaleTimeString(),
            level: entry.level || "info",
            source: entry.source || "runner",
            nodeId: entry.node_id ?? undefined,
            message: entry.message,
            context: entry.context ?? undefined,
          }));
          hydrateRunLogs(normalizedLogs);
        }

        return detail;
      } catch {
        return null;
      }
    },
    [
      setRunMeta,
      upsertRunStep,
      setRunningNodeId,
      hydrateRunScreenshots,
      hydrateRunLogs,
    ]
  );

  // Cargar historial reciente de ejecuciones de la receta
  const loadRecipeRuns = useCallback(
    async (autoAttachRecentWebhook = false) => {
      if (!recipeId || recipeId === "new") return;
      setIsLoadingRuns(true);
      try {
        const items = await fetchRecipeRuns(recipeId, {
          trigger: runsTriggerFilter,
          limit: 25,
        });
        setRunsList(items);

        if (!initializedDiscoveryRef.current) {
          initializedDiscoveryRef.current = true;
          for (const item of items) {
            const createdTs = item.created_at
              ? new Date(item.created_at).getTime()
              : 0;
            const isRecentActiveWebhook =
              item.trigger === "webhook" &&
              (item.status === "queued" ||
                item.status === "running" ||
                item.status === "waiting" ||
                createdTs >= editorOpenedAtRef.current - 5000);

            if (!isRecentActiveWebhook) {
              seenExternalRunIdsRef.current.add(item.id);
            }
          }
        }

        if (autoAttachRecentWebhook) {
          const currentRunId = useRecipeStore.getState().runId;
          const freshWebhook = items.find((item) => {
            if (item.trigger !== "webhook") return false;
            if (item.id === currentRunId) return false;
            if (seenExternalRunIdsRef.current.has(item.id)) return false;
            const createdTs = item.created_at
              ? new Date(item.created_at).getTime()
              : Date.now();
            return createdTs >= editorOpenedAtRef.current - 10_000;
          });

          if (freshWebhook) {
            seenExternalRunIdsRef.current.add(freshWebhook.id);
            const st = useRecipeStore.getState();
            attachRun(freshWebhook.id, {
              trigger: freshWebhook.trigger,
              version: freshWebhook.recipe_version ?? null,
              isDraft: !!freshWebhook.is_draft,
              status: mapRunStatus(freshWebhook.status),
              controlState: mapControlState(freshWebhook.status),
              openConsole: true,
              consoleTab:
                st.consoleOpen && st.consoleTab === "logs" ? "logs" : "result",
              initialMessage: `Ejecución webhook detectada (${freshWebhook.id.slice(0, 8)}...)`,
            });
            void hydrateRunFromServer(freshWebhook.id);
          }
        }
      } catch {
        // Ignorar fallos transitorios de consulta de runs
      } finally {
        setIsLoadingRuns(false);
      }
    },
    [recipeId, runsTriggerFilter, attachRun, hydrateRunFromServer]
  );

  // Abrir un run histórico concreto para inspeccionarlo en Resultado y Pasos / Logs / Capturas
  const handleSelectRun = async (run: RunSummary) => {
    seenExternalRunIdsRef.current.add(run.id);
    attachRun(run.id, {
      trigger: run.trigger,
      version: run.recipe_version ?? null,
      isDraft: !!run.is_draft,
      status: mapRunStatus(run.status),
      controlState: mapControlState(run.status),
      openConsole: true,
      consoleTab: "result",
      initialMessage: `Cargando detalle de ejecución ${run.id.slice(0, 8)} (${run.trigger})...`,
    });
    setIsRefreshingRun(true);
    try {
      await hydrateRunFromServer(run.id);
    } finally {
      setIsRefreshingRun(false);
    }
  };

  // Auto-abrir cuando empiece una ejecución
  useEffect(() => {
    if (runStatus === "running") {
      setIsOpen(true);
    }
  }, [runStatus, setIsOpen]);

  // Auto-scroll al final de los logs
  useEffect(() => {
    if (isOpen && activeTab === "logs") {
      logsEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
    }
  }, [logs, isOpen, activeTab]);

  // Suscripción en canal de receta (detecta webhooks publicados y runs externos al instante) + descubrimiento de respaldo
  useEffect(() => {
    if (!recipeId || recipeId === "new") return;

    void loadRecipeRuns(false);

    const echo = getEcho();
    const channel = echo ? echo.channel(`recipe.${recipeId}`) : null;

    if (channel) {
      channel.listen(
        ".run.updated",
        (e: {
          id: string;
          trigger?: string;
          recipe_version?: number | null;
          is_draft?: boolean;
          status:
            | "queued"
            | "running"
            | "waiting"
            | "paused"
            | "completed"
            | "failed"
            | "stopped";
          duration_ms?: number | null;
          error_message?: string | null;
          result?: Record<string, unknown> | null;
        }) => {
          if (!e?.id) return;
          seenExternalRunIdsRef.current.add(e.id);
          const state = useRecipeStore.getState();

          if (state.runId !== e.id) {
            const preferredTab =
              state.consoleOpen && state.consoleTab === "logs"
                ? "logs"
                : "result";
            attachRun(e.id, {
              trigger: e.trigger ?? "webhook",
              version: e.recipe_version ?? null,
              isDraft: !!e.is_draft,
              status: mapRunStatus(e.status),
              controlState: mapControlState(e.status),
              openConsole: true,
              consoleTab: preferredTab,
              initialMessage: `Ejecución ${e.trigger || "webhook"} recibida (${e.id.slice(0, 8)}...)`,
            });
            void hydrateRunFromServer(e.id);
          } else {
            setRunMeta({
              durationMs: e.duration_ms ?? undefined,
              result: e.result ?? undefined,
              errorMessage: e.error_message ?? undefined,
            });
            if (e.status === "completed" || e.status === "failed") {
              void hydrateRunFromServer(e.id);
            }
          }

          void loadRecipeRuns(false);
        }
      );
    }

    const shouldPollDiscovery =
      (isOpen && activeTab === "executions") ||
      (editorMode === "published" && !!webhookNode);

    const discoveryTimer = shouldPollDiscovery
      ? setInterval(() => {
          if (typeof document !== "undefined" && document.hidden) return;
          void loadRecipeRuns(true);
        }, 6000)
      : null;

    return () => {
      if (echo) {
        echo.leaveChannel(`recipe.${recipeId}`);
      }
      if (discoveryTimer) {
        clearInterval(discoveryTimer);
      }
    };
  }, [
    recipeId,
    isOpen,
    activeTab,
    editorMode,
    webhookNode,
    attachRun,
    setRunMeta,
    hydrateRunFromServer,
    loadRecipeRuns,
  ]);

  // Refrescar lista al abrir la pestaña Ejecuciones o cambiar filtro
  useEffect(() => {
    if (isOpen && activeTab === "executions") {
      void loadRecipeRuns(false);
    }
  }, [isOpen, activeTab, runsTriggerFilter, loadRecipeRuns]);

  // Suscripción a Reverb / WebSockets del run activo + sondeo de respaldo
  useEffect(() => {
    if (!runId || runId.startsWith("run_mock_")) return;

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
          locator_value?: string;
          duration_ms?: number;
          output?: unknown;
          screenshot_path?: string;
          screenshot_url?: string;
          error_message?: string;
        }) => {
          const shotUrl =
            e.screenshot_url || resolveArtifactUrl(e.screenshot_path);

          upsertRunStep({
            nodeId: e.node_id,
            status: e.status,
            durationMs: e.duration_ms ?? null,
            locatorStrategy: e.locator_strategy ?? null,
            locatorValue: e.locator_value ?? null,
            output: e.output,
            screenshotPath: e.screenshot_path ?? null,
            screenshotUrl: shotUrl,
            errorMessage: e.error_message ?? null,
          });

          const stepKey = `${e.node_id}-${e.status}-${shotUrl || ""}`;
          if (processedStepKeys.has(stepKey)) return;
          processedStepKeys.add(stepKey);

          if (e.status === "running") {
            setRunningNodeId(e.node_id);
          } else if (shotUrl) {
            addScreenshot({
              nodeId: e.node_id,
              url: shotUrl,
              artifactKey: e.screenshot_path || shotUrl.split("?")[0],
            });
          }
        }
      );

      // 3. Escuchar evento estándar de actualización / finalización del run
      channel.listen(
        ".run.updated",
        (e: {
          id: string;
          status:
            | "queued"
            | "running"
            | "waiting"
            | "paused"
            | "completed"
            | "failed";
          duration_ms?: number;
          error_message?: string;
          result?: Record<string, unknown> | null;
        }) => {
          setRunMeta({
            durationMs: e.duration_ms ?? undefined,
            result: e.result ?? undefined,
            errorMessage: e.error_message ?? undefined,
          });

          if (e.status === "paused") {
            setRunControlState("paused");
          } else if (e.status === "waiting") {
            setRunControlState("waiting");
          } else if (e.status === "running") {
            setRunControlState("running");
          } else if (e.status === "completed") {
            setRunningNodeId(null);
            if (useRecipeStore.getState().runStatus !== "success") {
              finishRun("success");
            }
            void hydrateRunFromServer(runId);
            void loadRecipeRuns(false);
          } else if (e.status === "failed") {
            setRunningNodeId(null);
            if (useRecipeStore.getState().runStatus !== "failed") {
              finishRun("failed", e.error_message);
            }
            void hydrateRunFromServer(runId);
            void loadRecipeRuns(false);
          }
        }
      );
    }

    // Sondeo de respaldo: hidrata detalle + pasos + capturas + logs desde BD
    const pollStatus = async () => {
      const detail = await hydrateRunFromServer(runId);
      if (!detail) return;

      if (detail.status === "completed") {
        setRunningNodeId(null);
        if (useRecipeStore.getState().runStatus !== "success") {
          finishRun("success");
        }
        if (pollingInterval) {
          clearInterval(pollingInterval);
          pollingInterval = null;
        }
        void loadRecipeRuns(false);
      } else if (detail.status === "failed" || detail.status === "stopped") {
        setRunningNodeId(null);
        if (useRecipeStore.getState().runStatus !== "failed") {
          finishRun("failed", detail.error_message || undefined);
        }
        if (pollingInterval) {
          clearInterval(pollingInterval);
          pollingInterval = null;
        }
        void loadRecipeRuns(false);
      }
    };

    if (runStatus === "running") {
      pollingInterval = setInterval(pollStatus, 2000);
      void pollStatus();
    }

    return () => {
      if (echo) {
        echo.leaveChannel(`run.${runId}`);
      }
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [
    runId,
    runStatus,
    setRunningNodeId,
    setRunControlState,
    setRunMeta,
    upsertRunStep,
    addLog,
    addScreenshot,
    finishRun,
    hydrateRunFromServer,
    loadRecipeRuns,
  ]);

  // Manejar comandos de control (Pausar / Reanudar / Detener)
  const handleControlAction = async (action: "pause" | "resume" | "stop") => {
    if (!runId) return;
    await dispatchRunControl(action, runId);
  };

  const handleRefreshActiveRun = async () => {
    if (!runId) return;
    setIsRefreshingRun(true);
    try {
      await hydrateRunFromServer(runId);
    } finally {
      setIsRefreshingRun(false);
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
    const counts: Record<string, number> = {
      all: logs.length,
      runner: 0,
      browser: 0,
      network: 0,
      live: 0,
    };
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
          isOpen ? (isExpanded ? "h-[62vh]" : "h-80") : "h-9"
        }`}
      >
        {/* Encabezado / Barra Minimizable */}
        <div className="h-9 px-4 border-b border-zinc-800 bg-zinc-900 flex items-center justify-between select-none shrink-0">
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
                      {runControlState === "waiting"
                        ? "Esperando petición webhook..."
                        : runControlState === "paused"
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
                    {runControlState !== "waiting" &&
                      (runControlState === "paused" ? (
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
                      ))}

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
                  type="button"
                  onClick={() => setActiveTab("executions")}
                  className={`flex items-center space-x-1 px-2 py-0.5 text-[11px] rounded font-medium transition-colors ${
                    activeTab === "executions"
                      ? "bg-neutral-800 text-indigo-300"
                      : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  <Activity className="w-3 h-3" />
                  <span>Ejecuciones ({runsList.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("result")}
                  className={`px-2 py-0.5 text-[11px] rounded font-medium transition-colors ${
                    activeTab === "result"
                      ? "bg-neutral-800 text-emerald-300"
                      : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  Resultado y Pasos ({runSteps.length})
                </button>
                <button
                  type="button"
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
                  type="button"
                  onClick={() => setActiveTab("screenshots")}
                  className={`flex items-center space-x-1 px-2 py-0.5 text-[11px] rounded font-medium transition-colors ${
                    activeTab === "screenshots"
                      ? "bg-neutral-800 text-neutral-200"
                      : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  <ImageIcon className="w-3 h-3" />
                  <span>Capturas ({screenshots.length})</span>
                </button>
              </div>

              {runId && (
                <button
                  type="button"
                  onClick={handleRefreshActiveRun}
                  disabled={isRefreshingRun}
                  title="Recargar datos de ejecución desde BD"
                  className="p-1 rounded text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 transition-colors disabled:opacity-40"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isRefreshingRun ? "animate-spin" : ""}`}
                  />
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                title={isExpanded ? "Restaurar altura" : "Expandir consola"}
                className="p-1 rounded text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
              >
                {isExpanded ? (
                  <Minimize2 className="w-3.5 h-3.5" />
                ) : (
                  <Maximize2 className="w-3.5 h-3.5" />
                )}
              </button>

              <button
                type="button"
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
            {/* Subbarra de origen de logs */}
            {activeTab === "logs" && (
              <div className="h-6 px-3 bg-neutral-900/40 border-b border-neutral-800 flex items-center justify-between text-[10px] select-none shrink-0">
                <div className="flex items-center space-x-3">
                  <span className="text-neutral-500 uppercase font-bold tracking-wider">
                    Origen:
                  </span>
                  <button
                    onClick={() => setSelectedSource("all")}
                    className={`hover:text-white transition-colors ${
                      selectedSource === "all"
                        ? "text-blue-400 font-bold"
                        : "text-neutral-400"
                    }`}
                  >
                    Todos ({sourceCounts.all})
                  </button>
                  <button
                    onClick={() => setSelectedSource("runner")}
                    className={`hover:text-white transition-colors ${
                      selectedSource === "runner"
                        ? "text-blue-400 font-bold"
                        : "text-neutral-400"
                    }`}
                  >
                    Runner ({sourceCounts.runner || 0})
                  </button>
                  <button
                    onClick={() => setSelectedSource("browser")}
                    className={`hover:text-white transition-colors ${
                      selectedSource === "browser"
                        ? "text-amber-400 font-bold"
                        : "text-neutral-400"
                    }`}
                  >
                    Navegador ({sourceCounts.browser || 0})
                  </button>
                  <button
                    onClick={() => setSelectedSource("network")}
                    className={`hover:text-white transition-colors ${
                      selectedSource === "network"
                        ? "text-rose-400 font-bold"
                        : "text-neutral-400"
                    }`}
                  >
                    Red ({sourceCounts.network || 0})
                  </button>
                  <button
                    onClick={() => setSelectedSource("live")}
                    className={`hover:text-white transition-colors ${
                      selectedSource === "live"
                        ? "text-emerald-400 font-bold"
                        : "text-neutral-400"
                    }`}
                  >
                    Live ({sourceCounts.live || 0})
                  </button>
                </div>

                {runId && (
                  <button
                    type="button"
                    onClick={handleRefreshActiveRun}
                    disabled={isRefreshingRun}
                    className="flex items-center space-x-1 text-neutral-400 hover:text-neutral-200 disabled:opacity-40"
                  >
                    <RefreshCw
                      className={`w-2.5 h-2.5 ${isRefreshingRun ? "animate-spin" : ""}`}
                    />
                    <span>Recargar BD</span>
                  </button>
                )}
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-3">
              {/* PESTAÑA 1: HISTORIAL DE EJECUCIONES */}
              {activeTab === "executions" && (
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-neutral-800">
                    <div className="flex items-center space-x-1.5 text-[11px]">
                      <span className="text-neutral-400 mr-1">Origen:</span>
                      {[
                        { key: "all", label: "Todos" },
                        { key: "webhook", label: "Webhook" },
                        { key: "manual", label: "Manual" },
                        { key: "schedule", label: "Programado" },
                      ].map((f) => (
                        <button
                          key={f.key}
                          type="button"
                          onClick={() => setRunsTriggerFilter(f.key)}
                          className={`px-2 py-0.5 rounded border text-[10.5px] transition-colors ${
                            runsTriggerFilter === f.key
                              ? "bg-indigo-600/20 border-indigo-500/50 text-indigo-300 font-semibold"
                              : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-neutral-200"
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => void loadRecipeRuns(false)}
                      disabled={isLoadingRuns}
                      className="flex items-center space-x-1 px-2 py-0.5 rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-[10.5px] text-neutral-300 disabled:opacity-50"
                    >
                      <RefreshCw
                        className={`w-3 h-3 ${isLoadingRuns ? "animate-spin" : ""}`}
                      />
                      <span>Actualizar</span>
                    </button>
                  </div>

                  {runsList.length === 0 ? (
                    <div className="py-8 text-center text-neutral-500 text-xs">
                      {isLoadingRuns
                        ? "Cargando historial de ejecuciones..."
                        : "Aún no hay ejecuciones registradas para esta receta."}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {runsList.map((run) => {
                        const isSelected = runId === run.id;
                        const previewSrc = resolveArtifactUrl(run.preview_url);
                        return (
                          <div
                            key={run.id}
                            onClick={() => void handleSelectRun(run)}
                            className={`p-2 rounded-lg border flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                              isSelected
                                ? "bg-indigo-950/30 border-indigo-500/50"
                                : "bg-neutral-900/40 border-neutral-800/80 hover:border-neutral-700 hover:bg-neutral-900/80"
                            }`}
                          >
                            <div className="flex items-center space-x-2.5 min-w-0">
                              {run.status === "completed" ? (
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              ) : run.status === "failed" || run.status === "stopped" ? (
                                <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                              ) : (
                                <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse shrink-0" />
                              )}

                              <span className="font-semibold text-zinc-200 shrink-0">
                                {run.id.slice(0, 10)}
                              </span>

                              <span className="px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-[10px] shrink-0">
                                {run.trigger === "webhook"
                                  ? "Webhook"
                                  : run.trigger === "schedule"
                                  ? "Programado"
                                  : "Manual"}
                              </span>

                              <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] shrink-0">
                                {run.is_draft
                                  ? "Borrador"
                                  : run.recipe_version
                                  ? `v${run.recipe_version}`
                                  : "Prod"}
                              </span>

                              <span className="text-[10.5px] text-zinc-400 shrink-0">
                                {typeof run.steps_count === "number"
                                  ? `${run.steps_count} paso(s)`
                                  : ""}
                              </span>

                              {run.error_message && (
                                <span className="text-[10.5px] text-rose-300 truncate">
                                  — {run.error_message}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center space-x-3 shrink-0">
                              {previewSrc && (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                  src={previewSrc}
                                  alt={`Miniatura ${run.id}`}
                                  className="w-10 h-6 rounded object-cover border border-neutral-700"
                                />
                              )}
                              <span className="text-[10.5px] text-zinc-400">
                                {typeof run.duration_ms === "number"
                                  ? run.duration_ms < 1000
                                    ? `${run.duration_ms}ms`
                                    : `${(run.duration_ms / 1000).toFixed(2)}s`
                                  : "—"}
                              </span>
                              <span className="text-[10px] text-zinc-500">
                                {run.created_at
                                  ? new Date(run.created_at).toLocaleTimeString()
                                  : ""}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* PESTAÑA 2: RESULTADO Y PASOS */}
              {activeTab === "result" && (
                runId ? (
                  <RunResultPanel
                    runId={runId}
                    runStatus={runStatus}
                    runControlState={runControlState}
                    runTrigger={runTrigger}
                    runVersion={runVersion}
                    runIsDraft={runIsDraft}
                    runDurationMs={runDurationMs}
                    runErrorMessage={runErrorMessage}
                    runParameters={runParameters}
                    runResult={runResult}
                    runSteps={runSteps}
                    screenshots={screenshots}
                    definition={definition}
                    onSelectStepNode={(nodeId) => setSelectedNodeId(nodeId)}
                    onZoomImage={(url) => setSelectedImage(url)}
                    onOpenLogs={() => setActiveTab("logs")}
                  />
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-neutral-500 text-xs space-y-2 py-8">
                    <span>Selecciona una ejecución o dispara el webhook para ver el resultado paso a paso.</span>
                    {runsList.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setActiveTab("executions")}
                        className="px-3 py-1 rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 text-[11px]"
                      >
                        Ver {runsList.length} ejecución(es) recientes
                      </button>
                    )}
                  </div>
                )
              )}

              {/* PESTAÑA 3: LOGS UNIFICADOS */}
              {activeTab === "logs" && (
                <>
                  {runControlState === "waiting" && (
                    <div className="mb-3 p-3 bg-amber-950/40 border border-amber-800/50 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 select-none">
                      <div className="flex items-start sm:items-center space-x-2.5 min-w-0">
                        <div className="p-1.5 bg-amber-500/20 text-amber-400 rounded-md shrink-0 animate-pulse mt-0.5 sm:mt-0">
                          <Radio className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold text-amber-200 flex items-center space-x-2">
                            <span>Esperando petición Webhook para iniciar</span>
                            <span className="text-[9px] font-mono bg-amber-500/20 text-amber-300 px-1 rounded border border-amber-500/30">
                              {webhookMethod}
                            </span>
                            <span className="text-[9px] font-mono bg-zinc-800 text-zinc-300 px-1 rounded border border-zinc-700">
                              {editorMode === "published" ? "Producción" : "Modo prueba"}
                            </span>
                          </div>
                          <div className="text-[10.5px] text-zinc-400 font-mono mt-0.5 flex items-center space-x-1.5 truncate">
                            <span className="truncate">{webhookUrl}</span>
                            <button
                              onClick={handleCopyWebhookUrl}
                              className="p-1 hover:text-white text-zinc-400 transition-colors shrink-0"
                              title="Copiar URL completa"
                            >
                              {isCopied ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0 self-end sm:self-auto">
                        <button
                          onClick={handleSendTestPayload}
                          disabled={isSendingTest}
                          className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white text-[10.5px] font-medium transition-colors disabled:opacity-50"
                        >
                          {isSendingTest ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Send className="w-3 h-3" />
                          )}
                          <span>Enviar payload simulado</span>
                        </button>
                        <button
                          onClick={() => handleControlAction("stop")}
                          className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[10.5px] font-medium transition-colors"
                        >
                          Detener
                        </button>
                      </div>
                    </div>
                  )}

                  {filteredLogs.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-neutral-600 text-xs">
                      {searchFilter
                        ? "No se encontraron logs con ese filtro."
                        : "Sin eventos de ejecución en vivo."}
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
                  )}
                </>
              )}

              {/* PESTAÑA 4: CAPTURAS */}
              {activeTab === "screenshots" &&
                (screenshots.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-neutral-600 text-xs">
                    No hay capturas registradas en esta ejecución.
                  </div>
                ) : (
                  <div className="flex items-center space-x-4 overflow-x-auto py-2">
                    {screenshots.map((s) => (
                      <div
                        key={s.id}
                        onClick={() => setSelectedImage(s.url)}
                        className="group relative w-44 h-28 rounded-lg bg-neutral-900 border border-neutral-800 hover:border-neutral-600 overflow-hidden cursor-pointer shrink-0 transition-all shadow-md"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={s.url}
                          alt={`Captura ${s.nodeId}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                        <div className="absolute inset-x-0 bottom-0 p-1 bg-neutral-950/80 backdrop-blur-sm text-[9px] text-neutral-300 truncate">
                          {s.nodeId} {s.timestamp ? `(${s.timestamp})` : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
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
