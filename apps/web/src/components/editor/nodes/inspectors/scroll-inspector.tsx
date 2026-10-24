"use client";

import React from "react";
import { Crosshair, ArrowDown, ArrowUp } from "lucide-react";
import type { ScrollNode, LocatorStrategy, RecipeNode } from "@rpa/dsl";
import { calculateLocatorScore } from "@rpa/locator";
import type { NodeInspectorProps } from "../types";
import { useLiveStore } from "@/stores/use-live-store";
import { useLayoutStore } from "@/stores/use-layout-store";
import { useRecipeStore } from "@/stores/use-recipe-store";
import { Button, Field, Select, TextInput } from "@/components/ui/primitives";

export function ScrollInspectorForm({
  node,
  updateParam,
  updateNode,
}: NodeInspectorProps<ScrollNode>) {
  const liveArmedNodeId = useLiveStore((s) => s.armedNodeId);
  const recipeId = useRecipeStore((s) => s.recipeId);

  const currentMode = node.params.mode || "element";
  const isArmed = liveArmedNodeId === node.id;

  const handleModeChange = (newMode: ScrollNode["params"]["mode"]) => {
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
        locator: undefined,
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
        (n): n is Extract<RecipeNode, { type: "navigate" }> =>
          n.type === "navigate" && Boolean(n.params.url)
      );
      if (navNode?.params.url) {
        live.startEmbedded?.(recId, navNode.params.url);
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

  const selectorMissing = !node.locator?.primary?.value?.trim();

  return (
    <div className="space-y-4">
      <Field
        label="Modo de desplazamiento"
        htmlFor="scroll-mode"
        hint="Hacia un elemento, por píxeles o a un extremo de la página."
      >
        <Select
          id="scroll-mode"
          value={currentMode}
          onChange={(e) =>
            handleModeChange(e.target.value as ScrollNode["params"]["mode"])
          }
        >
          <option value="element">Hacia un elemento de la vista</option>
          <option value="coordinates">Por píxeles (distancia vertical/horizontal)</option>
          <option value="bottom">Al final de la página</option>
          <option value="top">Al inicio de la página</option>
        </Select>
      </Field>

      {currentMode === "element" && (
        <div className="space-y-4">
          <Button
            variant={isArmed ? "primary" : "secondary"}
            onClick={handleSelectElementOnSite}
            className="w-full"
          >
            <Crosshair className="h-4 w-4" />
            {isArmed
              ? "Haz clic en el elemento del sitio… (cancelar)"
              : "Inspeccionar elemento en el sitio"}
          </Button>

          <Field
            label="Selector del elemento objetivo"
            htmlFor="scroll-selector"
            error={selectorMissing ? "Escribe un selector o selecciónalo en el sitio." : undefined}
            hint={
              selectorMissing
                ? undefined
                : "El navegador desplazará el elemento hasta el centro de la vista."
            }
          >
            <TextInput
              id="scroll-selector"
              type="text"
              value={node.locator?.primary?.value || ""}
              onChange={(e) => handleSelectorValueChange(e.target.value)}
              placeholder="#seccion-productos, footer…"
              aria-invalid={selectorMissing}
              className="font-mono"
            />
          </Field>
        </div>
      )}

      {currentMode === "coordinates" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Desplazamiento Y" htmlFor="scroll-y" hint="Negativo sube; positivo baja.">
            <div className="relative">
              <TextInput
                id="scroll-y"
                type="number"
                value={node.params.y ?? 500}
                onChange={(e) => updateParam("y", Number(e.target.value))}
                placeholder="500"
                className="pr-8 font-mono"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-fg-subtle">
                {(node.params.y ?? 500) >= 0 ? "↓" : "↑"}
              </span>
            </div>
          </Field>

          <Field label="Desplazamiento X" htmlFor="scroll-x" hint="Opcional. 0 mantiene el horizontal.">
            <TextInput
              id="scroll-x"
              type="number"
              value={node.params.x ?? 0}
              onChange={(e) => updateParam("x", Number(e.target.value))}
              placeholder="0"
              className="font-mono"
            />
          </Field>
        </div>
      )}

      {currentMode === "top" && (
        <div className="flex items-start gap-2.5 rounded-card border border-line bg-card px-4 py-3 text-[11.5px] leading-relaxed text-fg-muted">
          <ArrowUp className="mt-0.5 h-4 w-4 shrink-0 text-info-text" />
          <p>Desplaza el scroll inmediatamente hasta la parte superior de la ventana.</p>
        </div>
      )}

      {currentMode === "bottom" && (
        <div className="flex items-start gap-2.5 rounded-card border border-line bg-card px-4 py-3 text-[11.5px] leading-relaxed text-fg-muted">
          <ArrowDown className="mt-0.5 h-4 w-4 shrink-0 text-success-text" />
          <p>
            Desplaza el scroll hasta el fondo completo de la página (ideal para scroll
            infinito).
          </p>
        </div>
      )}

      <Field
        label="Animación del scroll"
        htmlFor="scroll-behavior"
        hint="La animación suave facilita ver el movimiento en el navegador en vivo."
      >
        <Select
          id="scroll-behavior"
          value={node.params.behavior || "smooth"}
          onChange={(e) => updateParam("behavior", e.target.value)}
        >
          <option value="smooth">Suave (recomendado)</option>
          <option value="auto">Instantáneo</option>
        </Select>
      </Field>
    </div>
  );
}
