"use client";

import React, { useState, useMemo } from "react";
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronRight,
  ChevronDown,
  Camera,
  ExternalLink,
  Maximize2,
  Copy,
  Check,
  Terminal,
} from "lucide-react";
import type { RecipeDsl } from "@rpa/dsl";
import type {
  ExecutionScreenshot,
  ExecutionStepRecord,
} from "../../stores/use-recipe-store";
import { resolveArtifactUrl } from "../../lib/run-api";

interface RunResultPanelProps {
  runId: string;
  runStatus: "idle" | "running" | "success" | "failed";
  runControlState: "idle" | "running" | "paused" | "stopping" | "waiting";
  runTrigger: string | null;
  runVersion: number | null;
  runIsDraft: boolean;
  runDurationMs: number | null;
  runErrorMessage: string | null;
  runParameters: Record<string, unknown> | null;
  runResult: Record<string, unknown> | null;
  runSteps: ExecutionStepRecord[];
  screenshots: ExecutionScreenshot[];
  definition: RecipeDsl;
  onSelectStepNode: (nodeId: string) => void;
  onZoomImage: (url: string) => void;
  onOpenLogs: () => void;
}

function formatDuration(ms?: number | null): string {
  if (typeof ms !== "number" || Number.isNaN(ms)) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function triggerLabel(trigger?: string | null): string {
  if (trigger === "webhook") return "Webhook";
  if (trigger === "schedule") return "Programado";
  if (trigger === "api") return "API";
  return "Manual";
}

function formatPreviewJson(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function RunResultPanel({
  runId,
  runStatus,
  runControlState,
  runTrigger,
  runVersion,
  runIsDraft,
  runDurationMs,
  runErrorMessage,
  runParameters,
  runResult,
  runSteps,
  screenshots,
  definition,
  onSelectStepNode,
  onZoomImage,
  onOpenLogs,
}: RunResultPanelProps) {
  const [selectedStepNodeId, setSelectedStepNodeId] = useState<string | null>(null);
  const [expandedOutputs, setExpandedOutputs] = useState<Record<string, boolean>>({});
  const [showParameters, setShowParameters] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const finalUrl =
    typeof runResult?.final_url === "string" && runResult.final_url
      ? runResult.final_url
      : null;
  const finalTitle =
    typeof runResult?.final_title === "string" && runResult.final_title
      ? runResult.final_title
      : null;

  const activeScreenshot = useMemo(() => {
    if (selectedStepNodeId) {
      const stepMatch = screenshots.find((s) => s.nodeId === selectedStepNodeId);
      if (stepMatch) return stepMatch;

      const stepRec = runSteps.find((s) => s.nodeId === selectedStepNodeId);
      const fallbackUrl =
        stepRec?.screenshotUrl || resolveArtifactUrl(stepRec?.screenshotPath);
      if (fallbackUrl) {
        return {
          id: selectedStepNodeId,
          nodeId: selectedStepNodeId,
          timestamp: "",
          url: fallbackUrl,
        };
      }
    }

    return screenshots.length > 0 ? screenshots[screenshots.length - 1] : null;
  }, [selectedStepNodeId, screenshots, runSteps]);

  const handleCopyJson = (key: string, value: unknown) => {
    navigator.clipboard.writeText(formatPreviewJson(value));
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const toggleOutput = (nodeId: string) => {
    setExpandedOutputs((prev) => ({ ...prev, [nodeId]: !prev[nodeId] }));
  };

  return (
    <div className="space-y-3 text-xs font-mono">
      {/* Barra de resumen superior */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-neutral-900/70 border border-neutral-800">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className="text-[11px] font-semibold text-zinc-200">
            Run {runId.slice(0, 12)}
          </span>
          <span className="px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-[10px]">
            {triggerLabel(runTrigger)}
          </span>
          <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 text-[10px]">
            {runIsDraft
              ? "Borrador"
              : runVersion
              ? `v${runVersion}`
              : "Publicado"}
          </span>

          {runStatus === "running" && (
            <span className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px]">
              <Clock className="w-3 h-3 animate-spin" />
              <span>
                {runControlState === "waiting" ? "Esperando webhook" : "En progreso"}
              </span>
            </span>
          )}
          {runStatus === "success" && (
            <span className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px]">
              <CheckCircle2 className="w-3 h-3" />
              <span>Completado</span>
            </span>
          )}
          {runStatus === "failed" && (
            <span className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 text-[10px]">
              <AlertCircle className="w-3 h-3" />
              <span>Falló</span>
            </span>
          )}

          {typeof runDurationMs === "number" && (
            <span className="text-[10.5px] text-zinc-400">
              Duración: <strong className="text-zinc-200">{formatDuration(runDurationMs)}</strong>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {finalUrl && (
            <span
              className="flex items-center space-x-1 text-[10.5px] text-zinc-400 max-w-[260px] truncate"
              title={`${finalTitle ? `${finalTitle} — ` : ""}${finalUrl}`}
            >
              <ExternalLink className="w-3 h-3 shrink-0 text-zinc-500" />
              <span className="truncate">{finalTitle || finalUrl}</span>
            </span>
          )}
          <button
            type="button"
            onClick={onOpenLogs}
            className="flex items-center space-x-1 px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[10.5px] transition-colors"
          >
            <Terminal className="w-3 h-3" />
            <span>Ver logs completos</span>
          </button>
        </div>
      </div>

      {/* Banner de error si falló */}
      {runErrorMessage && (
        <div className="p-2.5 rounded-lg bg-rose-950/50 border border-rose-500/30 text-rose-200 flex items-start space-x-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="min-w-0 break-words">
            <div className="font-semibold text-[11px] text-rose-300">Error de ejecución</div>
            <div className="text-[11px] mt-0.5">{runErrorMessage}</div>
          </div>
        </div>
      )}

      {/* Cuerpo principal: Paso a paso + Vista previa visual */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Columna izquierda: Payload de entrada y Paso a paso */}
        <div className="lg:col-span-7 space-y-2.5">
          {runParameters && Object.keys(runParameters).length > 0 && (
            <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowParameters(!showParameters)}
                className="w-full px-3 py-1.5 flex items-center justify-between text-[11px] text-zinc-300 hover:bg-neutral-900 transition-colors"
              >
                <span className="flex items-center space-x-1.5 font-semibold">
                  {showParameters ? (
                    <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                  )}
                  <span>Payload de entrada (Webhook / Parámetros)</span>
                </span>
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopyJson("params", runParameters);
                  }}
                  className="flex items-center space-x-1 text-[10px] text-zinc-400 hover:text-white cursor-pointer"
                >
                  {copiedKey === "params" ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span>Copiar JSON</span>
                </span>
              </button>
              {showParameters && (
                <pre className="p-2.5 pt-1 text-[10.5px] text-zinc-300 bg-neutral-950/80 border-t border-neutral-800 overflow-x-auto max-h-44">
                  {formatPreviewJson(runParameters)}
                </pre>
              )}
            </div>
          )}

          {/* Lista paso a paso */}
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 overflow-hidden">
            <div className="px-3 py-1.5 border-b border-neutral-800 bg-neutral-900/70 flex items-center justify-between text-[11px] text-zinc-300 font-semibold">
              <span>Paso a paso ({runSteps.length})</span>
              <span className="text-[10px] font-normal text-zinc-500">
                Haz clic en un paso para ver su captura
              </span>
            </div>

            {runSteps.length === 0 ? (
              <div className="p-5 text-center text-[11px] text-zinc-500">
                {runStatus === "running"
                  ? "Esperando el inicio de los pasos en el runner..."
                  : "No hay pasos registrados para esta ejecución."}
              </div>
            ) : (
              <div className="divide-y divide-neutral-800/70 max-h-64 overflow-y-auto">
                {runSteps.map((step, index) => {
                  const defNode = definition?.nodes?.[step.nodeId];
                  const stepScreenshot =
                    step.screenshotUrl || resolveArtifactUrl(step.screenshotPath);
                  const isSelected = selectedStepNodeId === step.nodeId;
                  const hasOutput =
                    step.output !== undefined && step.output !== null;
                  const isExpanded = !!expandedOutputs[step.nodeId];

                  return (
                    <div
                      key={step.nodeId}
                      onClick={() => {
                        setSelectedStepNodeId(step.nodeId);
                        onSelectStepNode(step.nodeId);
                      }}
                      className={`p-2.5 cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-blue-950/30 border-l-2 border-l-blue-400"
                          : "hover:bg-neutral-900/70"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center space-x-2 min-w-0">
                          <span className="text-[10px] text-zinc-500 w-4 shrink-0">
                            {index + 1}.
                          </span>
                          {step.status === "success" ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          ) : step.status === "failed" ? (
                            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          ) : (
                            <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse shrink-0" />
                          )}
                          <span className="text-zinc-100 font-medium truncate">
                            {defNode?.description || step.nodeId}
                          </span>
                          {defNode?.type && (
                            <span className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[9px] uppercase shrink-0">
                              {defNode.type}
                            </span>
                          )}
                          <span className="text-[10px] text-zinc-500 truncate">
                            [{step.nodeId}]
                          </span>
                        </div>

                        <div className="flex items-center space-x-2 shrink-0 text-[10px]">
                          {stepScreenshot && (
                            <Camera
                              className="w-3 h-3 text-sky-400"
                              aria-label="Tiene captura"
                            />
                          )}
                          {typeof step.durationMs === "number" && (
                            <span className="text-zinc-400">
                              {formatDuration(step.durationMs)}
                            </span>
                          )}
                        </div>
                      </div>

                      {step.locatorStrategy && (
                        <div className="mt-1 pl-6 text-[10px] text-zinc-500 truncate">
                          Locator: {step.locatorStrategy}
                          {step.locatorValue ? ` (${step.locatorValue})` : ""}
                        </div>
                      )}

                      {step.errorMessage && (
                        <div className="mt-1 ml-6 p-1.5 rounded bg-rose-950/40 border border-rose-500/20 text-[10.5px] text-rose-300 break-words">
                          {step.errorMessage}
                        </div>
                      )}

                      {hasOutput && (
                        <div className="mt-1.5 ml-6">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleOutput(step.nodeId);
                            }}
                            className="flex items-center space-x-1 text-[10px] text-emerald-400 hover:text-emerald-300"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-3 h-3" />
                            ) : (
                              <ChevronRight className="w-3 h-3" />
                            )}
                            <span>Resultado del paso</span>
                          </button>
                          {isExpanded ? (
                            <pre className="mt-1 p-2 rounded bg-neutral-950 border border-neutral-800 text-[10px] text-emerald-200 overflow-x-auto max-h-36">
                              {formatPreviewJson(step.output)}
                            </pre>
                          ) : (
                            <div className="mt-0.5 text-[10px] text-zinc-400 truncate max-w-full">
                              {formatPreviewJson(step.output)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Columna derecha: Vista previa visual */}
        <div className="lg:col-span-5 space-y-2">
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 overflow-hidden flex flex-col">
            <div className="px-3 py-1.5 border-b border-neutral-800 bg-neutral-900/70 flex items-center justify-between text-[11px] text-zinc-300 font-semibold">
              <span>Vista previa visual</span>
              {activeScreenshot && (
                <button
                  type="button"
                  onClick={() => onZoomImage(activeScreenshot.url)}
                  className="flex items-center space-x-1 text-[10px] font-normal text-zinc-400 hover:text-white"
                >
                  <Maximize2 className="w-3 h-3" />
                  <span>Ampliar</span>
                </button>
              )}
            </div>

            {activeScreenshot ? (
              <div className="p-2.5 space-y-2">
                <div
                  onClick={() => onZoomImage(activeScreenshot.url)}
                  className="relative rounded-md overflow-hidden border border-neutral-800 bg-black cursor-pointer group"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={activeScreenshot.url}
                    alt={`Vista previa paso ${activeScreenshot.nodeId}`}
                    className="w-full h-44 object-contain group-hover:opacity-95 transition-opacity"
                  />
                  <div className="px-2 py-1 bg-neutral-950/90 border-t border-neutral-800 text-[10px] text-zinc-400 flex items-center justify-between">
                    <span>Paso: {activeScreenshot.nodeId}</span>
                    {activeScreenshot.timestamp && (
                      <span>{activeScreenshot.timestamp}</span>
                    )}
                  </div>
                </div>

                {screenshots.length > 1 && (
                  <div className="flex items-center space-x-2 overflow-x-auto pb-1">
                    {screenshots.map((shot) => {
                      const active = shot.url === activeScreenshot.url;
                      return (
                        <button
                          key={shot.id}
                          type="button"
                          onClick={() => setSelectedStepNodeId(shot.nodeId)}
                          className={`relative w-16 h-11 rounded overflow-hidden border shrink-0 transition-all ${
                            active
                              ? "border-blue-400 ring-1 ring-blue-400/40"
                              : "border-neutral-800 opacity-70 hover:opacity-100"
                          }`}
                          title={`Ver captura de ${shot.nodeId}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={shot.url}
                            alt={shot.nodeId}
                            className="w-full h-full object-cover"
                          />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="h-44 flex flex-col items-center justify-center text-center px-4 text-[11px] text-zinc-500">
                <Camera className="w-6 h-6 text-zinc-700 mb-1.5" />
                <span>
                  {runStatus === "running"
                    ? "Las capturas aparecerán automáticamente cuando Playwright navegue por el sitio."
                    : "No se capturaron imágenes visuales en esta ejecución."}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
