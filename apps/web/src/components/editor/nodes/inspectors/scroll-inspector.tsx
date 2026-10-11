"use client";

import React from "react";
import { Crosshair, ArrowDown, ArrowUp, MoveVertical, Locate } from "lucide-react";
import type { ScrollNode, LocatorStrategy } from "@rpa/dsl";
import { calculateLocatorScore } from "@rpa/locator";
import type { NodeInspectorProps } from "../types";
import { useLiveStore } from "@/stores/use-live-store";
import { useLayoutStore } from "@/stores/use-layout-store";
import { useRecipeStore } from "@/stores/use-recipe-store";

export function ScrollInspectorForm({
  node,
  updateParam,
  updateNode,
}: NodeInspectorProps<ScrollNode>) {
  const isLiveOpen = useLiveStore((s) => s.isOpen);
  const liveStatus = useLiveStore((s) => s.status);
  const liveArmedNodeId = useLiveStore((s) => s.armedNodeId);
  const recipeId = useRecipeStore((s) => s.recipeId);

  const currentMode = node.params.mode || "element";
  const isArmed = liveArmedNodeId === node.id;

  const handleModeChange = (newMode: "element" | "coordinates" | "top" | "bottom") => {
    if (newMode === "element") {
      const existingLocator = node.locator;
      const initialLocator = existingLocator || {
        primary: { strategy: "css" as LocatorStrategy, value: "", score: 60 },
        fallbacks: [],
      };
      updateNode({
        params: {
          ...node.params,
          mode: newMode,
        },
        locator: initialLocator,
      });
    } else {
      updateNode({
        params: {
          ...node.params,
          mode: newMode,
          y: node.params.y ?? (newMode === "coordinates" ? 500 : undefined),
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

  return (
    <div className="space-y-3">
      {/* Selector de Modo de Desplazamiento */}
      <div>
        <label className="block text-[11px] font-medium text-neutral-400 mb-1">
          Modo de Desplazamiento
        </label>
        <select
          value={currentMode}
          onChange={(e) => handleModeChange(e.target.value as any)}
          className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-blue-500 font-medium"
        >
          <option value="element">Hacia un elemento de la vista 🎯</option>
          <option value="coordinates">Por píxeles (distancia vertical/horizontal)</option>
          <option value="bottom">Al final de la página (Bottom)</option>
          <option value="top">Al inicio de la página (Top)</option>
        </select>
      </div>

      {/* CASO 1: Hacia un elemento */}
      {currentMode === "element" && (
        <div className="space-y-2.5">
          {/* Botón interactivo de selección en vivo */}
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

          <div>
            <label className="block text-[11px] font-medium text-neutral-400 mb-1">
              Selector del elemento objetivo
            </label>
            <input
              type="text"
              value={node.locator?.primary?.value || ""}
              onChange={(e) => handleSelectorValueChange(e.target.value)}
              placeholder="#seccion-productos, footer, o selector CSS"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>
        </div>
      )}

      {/* CASO 2: Por coordenadas / píxeles */}
      {currentMode === "coordinates" && (
        <div className="space-y-2.5">
          <div>
            <label className="block text-[11px] font-medium text-neutral-400 mb-1">
              Desplazamiento Vertical Y (px)
            </label>
            <div className="relative">
              <input
                type="number"
                value={node.params.y ?? 500}
                onChange={(e) => updateParam("y", Number(e.target.value))}
                placeholder="500"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-blue-500 font-mono"
              />
              <span className="absolute right-2.5 top-1.5 text-[10px] text-neutral-500">
                {(node.params.y ?? 500) >= 0 ? "↓ Hacia abajo" : "↑ Hacia arriba"}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-neutral-400 mb-1">
              Desplazamiento Horizontal X (opcional px)
            </label>
            <input
              type="number"
              value={node.params.x ?? 0}
              onChange={(e) => updateParam("x", Number(e.target.value))}
              placeholder="0"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>
        </div>
      )}

      {/* CASO 3 y 4: Extremos */}
      {currentMode === "top" && (
        <div className="p-2.5 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-neutral-400 flex items-center space-x-2">
          <ArrowUp className="w-4 h-4 text-blue-400 shrink-0" />
          <span>Desplaza el scroll inmediatamente hasta la parte superior de la ventana.</span>
        </div>
      )}

      {currentMode === "bottom" && (
        <div className="p-2.5 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-neutral-400 flex items-center space-x-2">
          <ArrowDown className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Desplaza el scroll hasta el fondo completo de la página web (ideal para scroll infinito).</span>
        </div>
      )}

      {/* Comportamiento de animación */}
      <div>
        <label className="block text-[11px] font-medium text-neutral-400 mb-1">
          Animación del scroll
        </label>
        <select
          value={node.params.behavior || "smooth"}
          onChange={(e) => updateParam("behavior", e.target.value)}
          className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-blue-500"
        >
          <option value="smooth">Suave (smooth) - Recomendado</option>
          <option value="auto">Instantáneo (auto)</option>
        </select>
      </div>
    </div>
  );
}
