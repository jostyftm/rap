"use client";

import React from "react";
import { Crosshair, Play, Search, CheckCircle2, XCircle, Globe, Info, Camera, Clock } from "lucide-react";
import type { RecipeNode } from "@rpa/dsl";
import { useLiveStore } from "../../stores/use-live-store";
import { useRecipeStore } from "../../stores/use-recipe-store";
import { useLayoutStore } from "../../stores/use-layout-store";

const TARGET_TYPES = ["click", "type", "select", "extract", "scroll"];

/**
 * Herramientas del nodo seleccionado sobre el sitio en vivo:
 * - Botón universal "Abrir sitio en vivo para este paso" para TODOS los nodos.
 * - Selección de elemento en vivo (🎯) para click, type, select, extract y waitFor (Elemento visible).
 * - Pruebas inmediatas de paso (▶) y localización (🔦).
 */
export function LiveNodeTools({ node }: { node: RecipeNode }) {
  const isOpen = useLiveStore((s) => s.isOpen);
  const status = useLiveStore((s) => s.status);
  const kind = useLiveStore((s) => s.kind);
  const armedNodeId = useLiveStore((s) => s.armedNodeId);
  const lastPick = useLiveStore((s) => s.lastPick);
  const execResult = useLiveStore((s) => s.execResults[node.id]);
  const arm = useLiveStore((s) => s.arm);
  const disarm = useLiveStore((s) => s.disarm);
  const exec = useLiveStore((s) => s.exec);
  const locate = useLiveStore((s) => s.locate);
  const startEmbedded = useLiveStore((s) => s.startEmbedded);
  const startExternal = useLiveStore((s) => s.startExternal);
  const applyCandidates = useLiveStore((s) => s.applyCandidates);
  const recipeId = useRecipeStore((s) => s.recipeId);

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

  // Apertura interactiva inteligente para cualquier paso
  const handleOpenLiveForStep = () => {
    useLiveStore.getState().open();
    useLayoutStore.getState().setMode("split");
    useLayoutStore.getState().setPaletteCollapsed(true);

    const recId = recipeId || "current";
    if (isNavigate && (node as any).params?.url) {
      if (kind === "external") startExternal(recId, (node as any).params.url);
      else startEmbedded(recId, (node as any).params.url);
    } else {
      const definition = useRecipeStore.getState().definition;
      const navNode = Object.values(definition.nodes).find(
        (n) => n.type === "navigate" && (n as any).params?.url
      );
      if (navNode && (navNode as any).params?.url) {
        if (kind === "external") startExternal(recId, (navNode as any).params.url);
        else startEmbedded(recId, (navNode as any).params.url);
      }
    }
  };

  // 1. SI EL SITIO ESTÁ CERRADO: Mostrar opción universal y botón de selección directa si aplica
  if (!isOpen) {
    return (
      <div className="border-t border-neutral-800/80 pt-3 space-y-2">
        <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
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
            className="w-full flex items-center justify-center space-x-1.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm transition-all"
            title="Abrir navegador interactivo y activar puntero para seleccionar el elemento"
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>🎯 Seleccionar en el sitio</span>
          </button>
        )}
        <button
          onClick={handleOpenLiveForStep}
          className={`w-full flex items-center justify-center space-x-1.5 py-2 rounded-lg text-xs font-semibold shadow-sm transition-all ${
            hasTarget
              ? "bg-neutral-850 hover:bg-neutral-800 text-neutral-300 border border-neutral-800"
              : "bg-blue-600 hover:bg-blue-500 text-white"
          }`}
          title="Abrir navegador interactivo al lado del lienzo y precargar la URL"
        >
          <Globe className="w-3.5 h-3.5" />
          <span>Abrir sitio en vivo para este paso</span>
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
    <div className="border-t border-neutral-800/80 pt-3 space-y-2">
      <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
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
            className={`w-full flex items-center justify-center space-x-1.5 py-2 rounded-md text-xs font-semibold transition-colors ${
              isArmed
                ? "bg-amber-500 text-black animate-pulse"
                : "bg-blue-600 hover:bg-blue-500 text-white"
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>{isArmed ? "Haz clic en el elemento… (cancelar)" : "🎯 Seleccionar en el sitio"}</span>
          </button>

          {node.type === "type" && (
            <p className="flex items-start space-x-1 text-[10px] text-neutral-500">
              <Info className="w-3 h-3 mt-0.5 shrink-0" />
              <span>1) Selecciona el input en el sitio · 2) escribe el texto en “Texto a escribir” · 3) ▶ Probar.</span>
            </p>
          )}
        </>
      )}

      {isWaitForSelector && (
        <p className="flex items-start space-x-1 text-[10px] text-neutral-500">
          <Info className="w-3 h-3 mt-0.5 shrink-0" />
          <span>1) Usa el botón “🎯 Seleccionar elemento en el sitio” arriba · 2) Haz clic en el elemento.</span>
        </p>
      )}

      {canTestStep && (
        <div className="grid grid-cols-2 gap-2">
          <button
            disabled={!ready}
            onClick={() => exec(node)}
            className="flex items-center justify-center space-x-1 py-1.5 rounded-md bg-emerald-600/90 hover:bg-emerald-500 text-white text-xs disabled:opacity-40"
          >
            <Play className="w-3 h-3" />
            <span>Probar paso</span>
          </button>
          <button
            disabled={!ready}
            onClick={() => locate(node)}
            className="flex items-center justify-center space-x-1 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs disabled:opacity-40"
          >
            <Search className="w-3 h-3" />
            <span>Localizar</span>
          </button>
        </div>
      )}

          {execResult && (
            <div
              className={`flex items-start space-x-1.5 text-[11px] p-2 rounded border ${
                execResult.ok
                  ? "bg-emerald-950/40 border-emerald-900 text-emerald-300"
                  : "bg-rose-950/40 border-rose-900 text-rose-300"
              }`}
            >
              {execResult.ok ? (
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <XCircle className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="break-all">
                {execResult.ok
                  ? `OK (${execResult.strategy})${
                      execResult.output !== undefined ? ` → ${String(execResult.output)}` : ""
                    }`
                  : execResult.error}
              </span>
            </div>
          )}

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
            disabled={!ready}
            onClick={() => exec(node)}
            className="w-full flex items-center justify-center space-x-1.5 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs disabled:opacity-40"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Probar espera en vivo</span>
          </button>
        </div>
      )}

      {isScreenshot && (
        <button
          disabled={!ready}
          onClick={() => exec(node)}
          className="w-full flex items-center justify-center space-x-1.5 py-2 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold disabled:opacity-40"
        >
          <Camera className="w-3.5 h-3.5" />
          <span>Tomar captura de prueba</span>
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
