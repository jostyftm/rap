"use client";

import React from "react";
import { Crosshair, Play, Search, CheckCircle2, XCircle, Info, Camera, Clock, ShieldAlert } from "lucide-react";
import type { RecipeDsl, RecipeNode, TryCatchNode } from "@rpa/dsl";
import { useLiveStore } from "../../stores/use-live-store";
import { useRecipeStore } from "../../stores/use-recipe-store";
import { useLayoutStore } from "../../stores/use-layout-store";

import { testRecipeNode } from "@/lib/node-tester";

const TARGET_TYPES = ["click", "type", "select", "extract", "scroll"];
const LOGIC_TYPES = [
  "webhook",
  "respond",
  "httpRequest",
  "setVariable",
  "javascript",
  "condition",
  "loop",
  "tryCatch",
];

function findEnclosingTryCatch(
  definition: RecipeDsl,
  nodeId: string
): TryCatchNode | undefined {
  const nodes = definition?.nodes || {};
  for (const candidate of Object.values(nodes)) {
    if (candidate.type !== "tryCatch") continue;
    let curr: string | undefined = candidate.params.tryEntryNodeId;
    const seen = new Set<string>();
    while (curr && curr !== candidate.next && !seen.has(curr)) {
      if (curr === nodeId) return candidate;
      seen.add(curr);
      curr = nodes[curr]?.next;
    }
  }
  return undefined;
}

/**
 * Herramientas del nodo seleccionado sobre el sitio en vivo o en memoria:
 * - Pruebas inmediatas de paso (▶ Probar paso).
 * - Selección de elemento en vivo para click, type, select, extract y waitFor.
 * - Inspección de la salida generada y contexto de variables.
 */
export function LiveNodeTools({ node }: { node: RecipeNode }) {
  const [testingLogic, setTestingLogic] = React.useState(false);
  const [testingStep, setTestingStep] = React.useState(false);
  const [testingTryCatch, setTestingTryCatch] = React.useState(false);
  const isOpen = useLiveStore((s) => s.isOpen);
  const status = useLiveStore((s) => s.status);
  const kind = useLiveStore((s) => s.kind);
  const armedNodeId = useLiveStore((s) => s.armedNodeId);
  const lastPick = useLiveStore((s) => s.lastPick);
  const execResult = useLiveStore((s) => s.execResults[node.id]);
  const arm = useLiveStore((s) => s.arm);
  const disarm = useLiveStore((s) => s.disarm);
  const locate = useLiveStore((s) => s.locate);
  const startEmbedded = useLiveStore((s) => s.startEmbedded);
  const startScreencast = useLiveStore((s) => s.startScreencast);
  const startExternal = useLiveStore((s) => s.startExternal);
  const applyCandidates = useLiveStore((s) => s.applyCandidates);
  const recipeId = useRecipeStore((s) => s.recipeId);
  const definition = useRecipeStore((s) => s.definition);
  const nodeOutput = useRecipeStore((s) => s.nodeOutputs[node.id]);
  const execStatus = useRecipeStore((s) => s.nodeExecStatuses[node.id]);
  const execError = useRecipeStore((s) => s.nodeExecErrors[node.id]);

  const enclosingTryCatch = React.useMemo(
    () => (node.type === "tryCatch" ? undefined : findEnclosingTryCatch(definition, node.id)),
    [definition, node.id, node.type]
  );

  const isLogicNode = LOGIC_TYPES.includes(node.type);

  // Detección de capacidades del nodo
  const isWaitForSelector = node.type === "waitFor" && (node as any).params?.strategy === "selector";
  const hasTarget = TARGET_TYPES.includes(node.type);
  const canTestStep = hasTarget || isWaitForSelector;
  const isNavigate = node.type === "navigate";
  const isScreenshot = node.type === "screenshot";
  const isWaitForTimeout = node.type === "waitFor" && (node as any).params?.strategy === "timeout";
  const isWaitForNetwork = node.type === "waitFor" && (node as any).params?.strategy === "networkIdle";

  const ready = isOpen && status === "ready";
  const isArmed = armedNodeId === node.id;
  const pick = lastPick && lastPick.nodeId === node.id ? lastPick : null;

  const handleTestLogicStep = async () => {
    setTestingLogic(true);
    try {
      await testRecipeNode(node);
    } finally {
      setTestingLogic(false);
    }
  };

  const handleTestBrowserStep = async () => {
    setTestingStep(true);
    try {
      await testRecipeNode(node);
    } finally {
      setTestingStep(false);
    }
  };

  const handleTestEnclosingTryCatch = async () => {
    if (!enclosingTryCatch) return;
    setTestingTryCatch(true);
    try {
      await testRecipeNode(enclosingTryCatch);
    } finally {
      setTestingTryCatch(false);
    }
  };

  // Apertura interactiva para pasos de navegador
  const handleOpenLiveForStep = () => {
    useLiveStore.getState().open();
    useLayoutStore.getState().setMode("split");
    useLayoutStore.getState().setPaletteCollapsed(true);

    const recId = recipeId || "current";
    if (isNavigate && (node as any).params?.url) {
      const targetUrl = (node as any).params.url;
      if (kind === "external") startExternal(recId, targetUrl);
      else if (kind === "screencast") startScreencast(recId, targetUrl);
      else startEmbedded(recId, targetUrl);
    } else {
      const definition = useRecipeStore.getState().definition;
      const navNode = Object.values(definition.nodes).find(
        (n) => n.type === "navigate" && (n as any).params?.url
      );
      if (navNode && (navNode as any).params?.url) {
        const targetUrl = (navNode as any).params.url;
        if (kind === "external") startExternal(recId, targetUrl);
        else if (kind === "screencast") startScreencast(recId, targetUrl);
        else startEmbedded(recId, targetUrl);
      }
    }
  };

  // SI ES NODO DE LÓGICA / TRIGGER: Probar directamente en memoria o contra el sitio
  if (isLogicNode) {
    return (
      <div className="border-t border-zinc-800/80 pt-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono font-medium text-zinc-500 uppercase tracking-wider">
            Prueba de Paso
          </span>
          {execStatus === "error" ? (
            <span className="text-[10px] font-mono text-rose-400 font-medium">
              ✗ Error
            </span>
          ) : nodeOutput !== undefined ? (
            <span className="text-[10px] font-mono text-emerald-400 font-medium">
              ✓ Salida disponible
            </span>
          ) : null}
        </div>

        <button
          type="button"
          disabled={testingLogic}
          onClick={handleTestLogicStep}
          className="w-full flex items-center justify-center space-x-1.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700/60 text-xs font-medium transition-colors disabled:opacity-50"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>{testingLogic ? "Probando..." : "Probar este paso"}</span>
        </button>

        {execStatus === "error" && execError && (
          <div className="flex items-start space-x-1.5 text-[11px] p-2 rounded border bg-rose-950/40 border-rose-900 text-rose-300">
            <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span className="break-all">{execError}</span>
          </div>
        )}

        {nodeOutput !== undefined && (
          <div className="p-2 rounded bg-zinc-950 border border-zinc-800/80 space-y-1">
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wide block">
              Resultado generado:
            </span>
            <pre className="text-[10px] font-mono text-zinc-300 max-h-36 overflow-y-auto whitespace-pre-wrap break-all bg-zinc-900/60 p-1.5 rounded">
              {typeof nodeOutput === "object" ? JSON.stringify(nodeOutput, null, 2) : String(nodeOutput)}
            </pre>
          </div>
        )}
      </div>
    );
  }

  // SI EL SITIO EN VIVO ESTÁ CERRADO Y ES NODO DE NAVEGADOR
  if (!isOpen) {
    return (
      <div className="border-t border-zinc-800/80 pt-3 space-y-2">
        <span className="text-[10px] font-mono font-medium text-zinc-500 uppercase tracking-wider">
          Sitio en vivo
        </span>
        {hasTarget && (
          <button
            onClick={() => {
              handleOpenLiveForStep();
              const live = useLiveStore.getState();
              if (typeof live.openAndArm === "function") {
                live.openAndArm(node.id);
              } else {
                useLiveStore.setState({ isOpen: true, pendingArmNodeId: node.id });
                if (live.status === "ready" && typeof live.arm === "function") {
                  live.arm(node.id);
                }
              }
            }}
            className="w-full flex items-center justify-center space-x-1.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/60 text-xs font-medium transition-colors"
            title="Abrir navegador interactivo y activar puntero para seleccionar el elemento"
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>Inspeccionar elemento</span>
          </button>
        )}
        <button
          onClick={handleOpenLiveForStep}
          className="w-full flex items-center justify-center space-x-1.5 py-1.5 rounded text-xs font-medium transition-colors bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700/60"
          title="Abrir navegador interactivo al lado del lienzo y probar este paso"
        >
          <Play className="w-3.5 h-3.5" />
          <span>Abrir sitio en vivo y probar paso</span>
        </button>
      </div>
    );
  }

  const runNavigate = () => {
    const url = (node as any).params?.url as string;
    if (!recipeId || !url) return;
    if (kind === "external") startExternal(recipeId, url);
    else startEmbedded(recipeId, url);
  };

  return (
    <div className="border-t border-zinc-800/80 pt-3 space-y-2">
      <span className="text-[10px] font-mono font-medium text-zinc-500 uppercase tracking-wider">
        Sitio en vivo
      </span>

      {hasTarget && (
        <>
          <button
            onClick={() => {
              if (isArmed) {
                disarm();
              } else if (ready) {
                arm(node.id);
              } else {
                const live = useLiveStore.getState();
                if (typeof live.openAndArm === "function") {
                  live.openAndArm(node.id);
                } else {
                  useLiveStore.setState({ isOpen: true, pendingArmNodeId: node.id });
                  if (live.status === "ready" && typeof live.arm === "function") {
                    live.arm(node.id);
                  }
                }
              }
            }}
            className={`w-full flex items-center justify-center space-x-1.5 py-1.5 rounded text-xs font-medium transition-colors ${
              isArmed
                ? "bg-amber-400 text-zinc-950 font-semibold"
                : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/60"
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>{isArmed ? "Haz clic en el elemento… (cancelar)" : "Inspeccionar elemento"}</span>
          </button>

          {node.type === "type" && (
            <p className="flex items-start space-x-1 text-[10px] text-zinc-500">
              <Info className="w-3 h-3 mt-0.5 shrink-0" />
              <span>1) Selecciona el input en el sitio · 2) escribe el texto en “Texto a escribir” · 3) Probar.</span>
            </p>
          )}
        </>
      )}

      {isWaitForSelector && (
        <p className="flex items-start space-x-1 text-[10px] text-zinc-500">
          <Info className="w-3 h-3 mt-0.5 shrink-0" />
          <span>1) Usa el botón “Inspeccionar elemento” arriba · 2) Haz clic en el elemento.</span>
        </p>
      )}

      {canTestStep && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={!ready || testingStep}
            onClick={handleTestBrowserStep}
            className="flex items-center justify-center space-x-1 py-1.5 rounded-md bg-emerald-600/90 hover:bg-emerald-500 text-white text-xs disabled:opacity-40"
          >
            <Play className="w-3 h-3" />
            <span>{testingStep ? "Probando..." : "Probar paso"}</span>
          </button>
          <button
            type="button"
            disabled={!ready}
            onClick={() => locate(node)}
            className="flex items-center justify-center space-x-1 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs disabled:opacity-40"
          >
            <Search className="w-3 h-3" />
            <span>Localizar</span>
          </button>
        </div>
      )}

      {enclosingTryCatch && (
        <button
          type="button"
          disabled={!ready || testingTryCatch}
          onClick={handleTestEnclosingTryCatch}
          className="w-full flex items-center justify-center space-x-1.5 py-1.5 rounded-md bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-medium transition-colors disabled:opacity-40"
          title={`Ejecuta ${enclosingTryCatch.description || enclosingTryCatch.id} (try → catch → finally)`}
        >
          <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
          <span>{testingTryCatch ? "Probando TryCatch..." : "Probar bloque TryCatch"}</span>
        </button>
      )}

          {(execStatus === "error" || execStatus === "success" || execResult) && (() => {
            const isOk =
              execStatus === "success" || (execStatus !== "error" && Boolean(execResult?.ok));
            const errorText =
              execError || execResult?.error || "Fallo en ejecución del sitio en vivo";
            const outputText =
              nodeOutput !== undefined
                ? typeof nodeOutput === "object"
                  ? JSON.stringify(nodeOutput)
                  : String(nodeOutput)
                : execResult?.output !== undefined
                ? String(execResult.output)
                : "";
            const strategyLabel = execResult?.strategy ? ` (${execResult.strategy})` : "";
            return (
              <div
                className={`flex items-start space-x-1.5 text-[11px] p-2 rounded border ${
                  isOk
                    ? "bg-emerald-950/40 border-emerald-900 text-emerald-300"
                    : "bg-rose-950/40 border-rose-900 text-rose-300"
                }`}
              >
                {isOk ? (
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                )}
                <span className="break-all">
                  {isOk
                    ? `OK${strategyLabel}${outputText ? ` → ${outputText}` : ""}`
                    : errorText}
                </span>
              </div>
            );
          })()}

          {pick && (
            <div className="space-y-1">
              <p className="text-[10px] text-neutral-400">
                Elemento: <code className="text-blue-300">&lt;{pick.element.tag}&gt;</code>{" "}
                {pick.element.text && <span className="text-neutral-500">“{pick.element.text}”</span>}
              </p>
              <p className="text-[10px] text-neutral-500">Alternativas (clic para usar como principal):</p>
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {pick.candidates.map((c, i) => (
                  <button
                    key={`${c.strategy}-${c.value}-${i}`}
                    onClick={() =>
                      applyCandidates(
                        node.id,
                        c,
                        pick.candidates.filter((x) => x !== c)
                      )
                    }
                    className="w-full text-left flex items-center justify-between gap-2 px-2 py-1 rounded bg-neutral-950 border border-neutral-800 hover:border-blue-500"
                  >
                    <span className="truncate text-[10px] font-mono text-neutral-300">
                      <b className="text-blue-400">{c.strategy}</b> {c.value}
                    </span>
                    <span className="text-[10px] text-neutral-500 shrink-0">{c.score}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

      {node.type === "waitFor" && !isWaitForSelector && (
        <div className="space-y-1.5 pt-1">
          <p className="text-[10px] text-neutral-400">
            {isWaitForTimeout
              ? `Espera de pausa fija (${(node as any).params?.value || 1000} ms).`
              : isWaitForNetwork
              ? "Espera hasta que la red esté inactiva."
              : `Espera de URL coincidente (${(node as any).params?.value || ""}).`}
          </p>
          <button
            type="button"
            disabled={!ready || testingStep}
            onClick={handleTestBrowserStep}
            className="w-full flex items-center justify-center space-x-1.5 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs disabled:opacity-40"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{testingStep ? "Probando espera..." : "Probar espera en vivo"}</span>
          </button>
        </div>
      )}

      {isScreenshot && (
        <button
          type="button"
          disabled={!ready || testingStep}
          onClick={handleTestBrowserStep}
          className="w-full flex items-center justify-center space-x-1.5 py-2 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold disabled:opacity-40"
        >
          <Camera className="w-3.5 h-3.5" />
          <span>{testingStep ? "Capturando..." : "Tomar captura de prueba"}</span>
        </button>
      )}

      {isNavigate && (
        <button
          disabled={status === "starting"}
          onClick={runNavigate}
          className="w-full flex items-center justify-center space-x-1.5 py-2 rounded-md bg-emerald-600/90 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-40"
        >
          <Play className="w-3.5 h-3.5" />
          <span>Ir a esta URL en el sitio</span>
        </button>
      )}

      {!hasTarget && !isNavigate && !isScreenshot && node.type !== "waitFor" && (
        <p className="text-[10px] text-neutral-500 py-1">
          Sitio en vivo activo. Este paso opera sobre variables y lógica del flujo.
        </p>
      )}
    </div>
  );
}
