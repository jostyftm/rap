"use client";

import React from "react";
import { Crosshair } from "lucide-react";
import type { WaitForNode, LocatorStrategy } from "@rpa/dsl";
import { calculateLocatorScore } from "@rpa/locator";
import type { NodeInspectorProps } from "../types";
import { useLiveStore } from "@/stores/use-live-store";
import { useLayoutStore } from "@/stores/use-layout-store";
import { useRecipeStore } from "@/stores/use-recipe-store";

export function WaitForInspectorForm({
  node,
  updateParam,
  updateNode,
}: NodeInspectorProps<WaitForNode>) {
  const isLiveOpen = useLiveStore((s) => s.isOpen);
  const liveStatus = useLiveStore((s) => s.status);
  const liveArmedNodeId = useLiveStore((s) => s.armedNodeId);
  const liveArm = useLiveStore((s) => s.arm);
  const liveDisarm = useLiveStore((s) => s.disarm);
  const openAndArm = useLiveStore((s) => s.openAndArm);
  const startEmbedded = useLiveStore((s) => s.startEmbedded);
  const recipeId = useRecipeStore((s) => s.recipeId);

  const handleStrategyChange = (newStrategy: string) => {
    if (newStrategy === "selector") {
      const existingLocator = node.locator;
      const initialLocator = existingLocator || {
        primary: { strategy: "css" as LocatorStrategy, value: "", score: 60 },
        fallbacks: [],
      };
      updateNode({
        params: {
          ...node.params,
          strategy: newStrategy as any,
        },
        locator: initialLocator,
      });
    } else {
      updateNode({
        params: {
          ...node.params,
          strategy: newStrategy as any,
        },
      });
    }
  };

  const handleSelectElementOnSite = () => {
    const live = useLiveStore.getState();
    if (live.isOpen && live.status === "ready") {
      if (live.armedNodeId === node.id) {
        live.disarm?.();
      } else {
        live.arm?.(node.id);
      }
    } else {
      useLayoutStore.getState().setMode("split");
      useLayoutStore.getState().setPaletteCollapsed(true);
      if (typeof live.openAndArm === "function") {
        live.openAndArm(node.id);
      } else {
        useLiveStore.setState({ isOpen: true, pendingArmNodeId: node.id });
        if (live.status === "ready" && typeof live.arm === "function") {
          live.arm(node.id);
        }
      }
      const recId = recipeId || "current";
      const currentDef = useRecipeStore.getState().definition;
      const navNode = Object.values(currentDef.nodes).find(
        (n) => n.type === "navigate" && (n as any).params?.url
      );
      if (navNode && (navNode as any).params?.url) {
        live.startEmbedded?.(recId, (navNode as any).params.url);
      }
    }
  };

  const handleSelectorValueChange = (value: string) => {
    const existingLocator = node.locator;
    const strategy: LocatorStrategy = existingLocator?.primary?.strategy || "css";
    const score = calculateLocatorScore(strategy, value);
    updateNode({
      locator: {
        primary: { strategy, value, score },
        fallbacks: existingLocator?.fallbacks || [],
      },
    });
  };

  const isArmed = liveArmedNodeId === node.id;
  const currentStrategy = node.params.strategy || "selector";

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-[11px] font-medium text-neutral-400 mb-1">
          Esperar por
        </label>
        <select
          value={currentStrategy}
          onChange={(e) => handleStrategyChange(e.target.value)}
          className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-blue-500 font-medium"
        >
          <option value="selector">Elemento visible (selector) 🎯</option>
          <option value="networkIdle">Red inactiva (networkidle)</option>
          <option value="timeout">Tiempo fijo (ms)</option>
          <option value="url">URL coincidente</option>
        </select>
      </div>

      {/* Botón interactivo para seleccionar elemento en vivo cuando la estrategia es selector */}
      {currentStrategy === "selector" && (
        <button
          type="button"
          onClick={handleSelectElementOnSite}
          className={`w-full flex items-center justify-center space-x-1.5 py-2.5 px-3 rounded-lg text-xs font-bold shadow-md transition-all ${
            isArmed
              ? "bg-amber-500 text-black ring-2 ring-amber-400 animate-pulse"
              : "bg-blue-600 hover:bg-blue-500 text-white"
          }`}
        >
          <Crosshair className="w-4 h-4" />
          <span>
            {isArmed
              ? "Haz clic en el elemento en el sitio… (cancelar)"
              : "🎯 Seleccionar elemento en el sitio"}
          </span>
        </button>
      )}

      {currentStrategy === "selector" && (
        <div className="space-y-2.5 pt-1">
          <div>
            <label className="block text-[11px] font-medium text-neutral-400 mb-1">
              Selector del elemento a esperar
            </label>
            <input
              type="text"
              value={node.locator?.primary?.value || ""}
              onChange={(e) => handleSelectorValueChange(e.target.value)}
              placeholder="#boton-guardar, .alerta-exito, o selector CSS"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-neutral-400 mb-1">
              Tiempo máximo de espera (ms opcional)
            </label>
            <input
              type="number"
              value={node.params.value ?? ""}
              onChange={(e) =>
                updateParam(
                  "value",
                  e.target.value === "" ? undefined : Number(e.target.value)
                )
              }
              placeholder="10000"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>
        </div>
      )}

      {(currentStrategy === "timeout" || currentStrategy === "url") && (
        <div>
          <label className="block text-[11px] font-medium text-neutral-400 mb-1">
            {currentStrategy === "timeout" ? "Milisegundos de pausa" : "Patrón URL"}
          </label>
          <input
            type="text"
            value={String(node.params.value || "")}
            onChange={(e) =>
              updateParam(
                "value",
                currentStrategy === "timeout"
                  ? Number(e.target.value) || 0
                  : e.target.value
              )
            }
            placeholder={currentStrategy === "timeout" ? "ej. 2000" : "ej. /dashboard"}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-blue-500 font-mono"
          />
        </div>
      )}

      {currentStrategy === "networkIdle" && (
        <div className="p-2.5 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-neutral-400">
          <p>
            Espera hasta que no existan más de 2 peticiones de red activas durante al menos 500 ms.
          </p>
        </div>
      )}
    </div>
  );
}
