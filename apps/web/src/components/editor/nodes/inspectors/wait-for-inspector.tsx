"use client";

import React from "react";
import { Crosshair, Info } from "lucide-react";
import type { WaitForNode, LocatorStrategy, RecipeNode } from "@rpa/dsl";
import { calculateLocatorScore } from "@rpa/locator";
import type { NodeInspectorProps } from "../types";
import { useLiveStore } from "@/stores/use-live-store";
import { useLayoutStore } from "@/stores/use-layout-store";
import { useRecipeStore } from "@/stores/use-recipe-store";
import { Button, Field, Select, TextInput } from "@/components/ui/primitives";

export function WaitForInspectorForm({
  node,
  updateParam,
  updateNode,
}: NodeInspectorProps<WaitForNode>) {
  const liveArmedNodeId = useLiveStore((s) => s.armedNodeId);
  const recipeId = useRecipeStore((s) => s.recipeId);

  const handleStrategyChange = (newStrategy: WaitForNode["params"]["strategy"]) => {
    if (newStrategy === "selector") {
      const existingLocator = node.locator;
      const initialLocator = existingLocator || {
        primary: { strategy: "css" as LocatorStrategy, value: "", score: 60 },
        fallbacks: [],
      };
      updateNode({
        params: {
          ...node.params,
          strategy: newStrategy,
        },
        locator: initialLocator,
      });
    } else {
      updateNode({
        params: {
          ...node.params,
          strategy: newStrategy,
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

  const isArmed = liveArmedNodeId === node.id;
  const currentStrategy = node.params.strategy || "selector";

  return (
    <div className="space-y-4">
      <Field
        label="Esperar por"
        htmlFor="wait-for-strategy"
        hint="Qué condición debe cumplirse para continuar con el siguiente paso."
      >
        <Select
          id="wait-for-strategy"
          value={currentStrategy}
          onChange={(e) =>
            handleStrategyChange(e.target.value as WaitForNode["params"]["strategy"])
          }
        >
          <option value="selector">Elemento visible (selector)</option>
          <option value="networkIdle">Red inactiva (networkidle)</option>
          <option value="timeout">Tiempo fijo (ms)</option>
          <option value="url">URL coincidente</option>
        </Select>
      </Field>

      {currentStrategy === "selector" && (
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
            label="Selector del elemento"
            htmlFor="wait-for-selector"
            hint="Puedes escribirlo o seleccionarlo directamente en el navegador en vivo."
          >
            <TextInput
              id="wait-for-selector"
              type="text"
              value={node.locator?.primary?.value || ""}
              onChange={(e) => handleSelectorValueChange(e.target.value)}
              placeholder="#boton-guardar, .alerta-exito…"
              className="font-mono"
            />
          </Field>

          <Field
            label="Tiempo máximo de espera"
            htmlFor="wait-for-timeout"
            hint="Opcional. Si se omite, se usa el timeout global del paso."
          >
            <div className="relative">
              <TextInput
                id="wait-for-timeout"
                type="number"
                value={node.params.value ?? ""}
                onChange={(e) =>
                  updateParam(
                    "value",
                    e.target.value === "" ? undefined : Number(e.target.value)
                  )
                }
                placeholder="10000"
                className="pr-10 font-mono"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-mono text-fg-subtle">
                ms
              </span>
            </div>
          </Field>
        </div>
      )}

      {(currentStrategy === "timeout" || currentStrategy === "url") && (
        <Field
          label={currentStrategy === "timeout" ? "Milisegundos de pausa" : "Patrón URL"}
          htmlFor="wait-for-value"
          hint={
            currentStrategy === "timeout"
              ? "Pausa explícita antes de continuar."
              : "Puede ser una URL completa o un patrón parcial."
          }
        >
          <TextInput
            id="wait-for-value"
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
            className="font-mono"
          />
        </Field>
      )}

      {currentStrategy === "networkIdle" && (
        <div className="flex items-start gap-2.5 rounded-card border border-line bg-card px-4 py-3 text-[11.5px] leading-relaxed text-fg-muted">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-info-text" />
          <p>
            Espera hasta que no existan más de 2 peticiones de red activas durante al menos
            500 ms.
          </p>
        </div>
      )}
    </div>
  );
}
