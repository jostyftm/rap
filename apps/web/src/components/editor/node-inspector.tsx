"use client";

import React, { useState } from "react";
import {
  Trash2,
  ShieldCheck,
  Plus,
  Play,
  HelpCircle,
  X,
} from "lucide-react";
import type { RecipeNode, LocatorStrategy, LocatorCandidate } from "@rpa/dsl";
import { calculateLocatorScore } from "@rpa/locator";
import { useRecipeStore } from "../../stores/use-recipe-store";

const STRATEGY_OPTIONS: LocatorStrategy[] = [
  "testid",
  "role",
  "label",
  "text",
  "css",
  "xpath",
];

export function NodeInspector() {
  const selectedNodeId = useRecipeStore((s) => s.selectedNodeId);
  const definition = useRecipeStore((s) => s.definition);
  const updateNode = useRecipeStore((s) => s.updateNode);
  const deleteNode = useRecipeStore((s) => s.deleteNode);
  const setEntryNode = useRecipeStore((s) => s.setEntryNode);

  // Estado para nuevo fallback
  const [newStrategy, setNewStrategy] = useState<LocatorStrategy>("css");
  const [newValue, setNewValue] = useState("");

  if (!selectedNodeId || !definition.nodes[selectedNodeId]) {
    return (
      <aside className="w-80 bg-neutral-900 border-l border-neutral-800 p-6 flex flex-col items-center justify-center text-center select-none">
        <HelpCircle className="w-8 h-8 text-neutral-600 mb-2" />
        <p className="text-xs font-medium text-neutral-400">
          Ningún paso seleccionado
        </p>
        <p className="text-[11px] text-neutral-500 mt-1">
          Haz clic en un bloque del lienzo o de la lista para editar sus propiedades y selectores.
        </p>
      </aside>
    );
  }

  const node: RecipeNode = definition.nodes[selectedNodeId];
  const isEntry = definition.entry === selectedNodeId;

  const handleParamChange = (key: string, value: any) => {
    updateNode(node.id, {
      params: {
        ...node.params,
        [key]: value,
      },
    } as any);
  };

  const handlePrimaryLocatorChange = (strategy: LocatorStrategy, value: string) => {
    if (!("locator" in node) || !node.locator) return;
    const score = calculateLocatorScore(strategy, value);
    updateNode(node.id, {
      locator: {
        ...node.locator,
        primary: { strategy, value, score },
      },
    } as any);
  };

  const handleAddFallback = () => {
    if (!newValue.trim() || !("locator" in node) || !node.locator) return;
    const score = calculateLocatorScore(newStrategy, newValue.trim());
    const newCandidate: LocatorCandidate = {
      strategy: newStrategy,
      value: newValue.trim(),
      score,
    };

    updateNode(node.id, {
      locator: {
        ...node.locator,
        fallbacks: [...(node.locator.fallbacks || []), newCandidate],
      },
    } as any);

    setNewValue("");
  };

  const handleRemoveFallback = (index: number) => {
    if (!("locator" in node) || !node.locator) return;
    const fallbacks = [...(node.locator.fallbacks || [])];
    fallbacks.splice(index, 1);
    updateNode(node.id, {
      locator: {
        ...node.locator,
        fallbacks,
      },
    } as any);
  };

  return (
    <aside className="w-80 bg-neutral-900 border-l border-neutral-800 flex flex-col h-full select-none overflow-y-auto">
      {/* Header del Inspector */}
      <div className="p-3.5 border-b border-neutral-800 flex items-center justify-between">
        <div>
          <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
            Propiedades del Paso
          </span>
          <h4 className="text-xs font-semibold text-neutral-200 uppercase font-mono mt-0.5">
            {node.type} ({node.id})
          </h4>
        </div>
        <button
          onClick={() => deleteNode(node.id)}
          title="Eliminar este paso"
          className="p-1.5 rounded text-neutral-500 hover:text-rose-400 hover:bg-neutral-800 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="p-3.5 space-y-4 flex-1">
        {/* Toggle de Entrada Inicial */}
        <div className="flex items-center justify-between p-2 rounded-lg bg-neutral-950 border border-neutral-800 text-xs">
          <div className="flex items-center space-x-2">
            <Play className={`w-3.5 h-3.5 ${isEntry ? "text-emerald-400" : "text-neutral-500"}`} />
            <span className="text-neutral-300 font-medium">Paso Inicial (Entry)</span>
          </div>
          {!isEntry && (
            <button
              onClick={() => setEntryNode(node.id)}
              className="text-[10px] px-2 py-0.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded font-medium transition-colors"
            >
              Fijar como inicio
            </button>
          )}
          {isEntry && (
            <span className="text-[10px] text-emerald-400 font-semibold uppercase">Activo</span>
          )}
        </div>

        {/* Descripción */}
        <div>
          <label className="block text-[11px] font-medium text-neutral-400 mb-1">
            Descripción del paso
          </label>
          <textarea
            rows={2}
            value={node.description || ""}
            onChange={(e) => updateNode(node.id, { description: e.target.value })}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-md p-2 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        {/* Parámetros Específicos por Tipo */}
        <div className="border-t border-neutral-800/80 pt-3 space-y-3">
          <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
            Configuración de Acción
          </span>

          {node.type === "navigate" && (
            <>
              <div>
                <label className="block text-[11px] text-neutral-400 mb-1">URL de destino</label>
                <input
                  type="text"
                  value={node.params.url || ""}
                  onChange={(e) => handleParamChange("url", e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-md p-2 text-xs text-neutral-200 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-[11px] text-neutral-400 mb-1">Esperar hasta</label>
                <select
                  value={node.params.waitUntil || "domcontentloaded"}
                  onChange={(e) => handleParamChange("waitUntil", e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-md p-2 text-xs text-neutral-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="domcontentloaded">DOM Content Loaded</option>
                  <option value="load">Página Completa (load)</option>
                  <option value="networkidle">Red Inactiva (networkidle)</option>
                </select>
              </div>
            </>
          )}

          {node.type === "click" && (
            <div>
              <label className="block text-[11px] text-neutral-400 mb-1">Botón</label>
              <select
                value={node.params.button || "left"}
                onChange={(e) => handleParamChange("button", e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-md p-2 text-xs text-neutral-200 focus:outline-none focus:border-blue-500"
              >
                <option value="left">Izquierdo (Principal)</option>
                <option value="right">Derecho (Contextual)</option>
                <option value="middle">Central</option>
              </select>
            </div>
          )}

          {node.type === "type" && (
            <>
              <div>
                <label className="block text-[11px] text-neutral-400 mb-1">Texto a escribir</label>
                <input
                  type="text"
                  value={node.params.text || ""}
                  onChange={(e) => handleParamChange("text", e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-md p-2 text-xs text-neutral-200 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="clearInput"
                  checked={node.params.clear ?? true}
                  onChange={(e) => handleParamChange("clear", e.target.checked)}
                  className="rounded bg-neutral-950 border-neutral-800 text-blue-600 focus:ring-0"
                />
                <label htmlFor="clearInput" className="text-xs text-neutral-300">
                  Limpiar campo antes de escribir
                </label>
              </div>
            </>
          )}

          {node.type === "select" && (
            <div>
              <label className="block text-[11px] text-neutral-400 mb-1">Valor de la opción</label>
              <input
                type="text"
                value={node.params.value || ""}
                onChange={(e) => handleParamChange("value", e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-md p-2 text-xs text-neutral-200 focus:outline-none focus:border-blue-500"
              />
            </div>
          )}

          {node.type === "waitFor" && (
            <>
              <div>
                <label className="block text-[11px] text-neutral-400 mb-1">Estrategia de espera</label>
                <select
                  value={node.params.strategy || "networkIdle"}
                  onChange={(e) => handleParamChange("strategy", e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-md p-2 text-xs text-neutral-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="networkIdle">Red inactiva (networkidle)</option>
                  <option value="selector">Selector visible</option>
                  <option value="timeout">Tiempo fijo (ms)</option>
                  <option value="url">URL coincidente</option>
                </select>
              </div>
              {(node.params.strategy === "timeout" || node.params.strategy === "url") && (
                <div>
                  <label className="block text-[11px] text-neutral-400 mb-1">
                    {node.params.strategy === "timeout" ? "Milisegundos" : "Patrón URL"}
                  </label>
                  <input
                    type="text"
                    value={String(node.params.value || "")}
                    onChange={(e) => handleParamChange("value", e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-md p-2 text-xs text-neutral-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}
            </>
          )}

          {node.type === "extract" && (
            <>
              <div>
                <label className="block text-[11px] text-neutral-400 mb-1">Tipo de extracción</label>
                <select
                  value={node.params.extractType || "text"}
                  onChange={(e) => handleParamChange("extractType", e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-md p-2 text-xs text-neutral-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="text">Texto visible (innerText)</option>
                  <option value="attribute">Atributo HTML</option>
                  <option value="list">Lista de textos (múltiples elementos)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-neutral-400 mb-1">Guardar en Variable</label>
                <input
                  type="text"
                  value={node.params.variable || ""}
                  onChange={(e) => handleParamChange("variable", e.target.value)}
                  placeholder="ej. miVariable"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-md p-2 text-xs text-neutral-200 focus:outline-none focus:border-blue-500"
                />
              </div>
            </>
          )}

          {node.type === "screenshot" && (
            <>
              <div>
                <label className="block text-[11px] text-neutral-400 mb-1">Nombre del archivo</label>
                <input
                  type="text"
                  value={node.params.name || ""}
                  onChange={(e) => handleParamChange("name", e.target.value)}
                  placeholder="ej. resumen_final"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-md p-2 text-xs text-neutral-200 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="fullPageShot"
                  checked={node.params.fullPage ?? true}
                  onChange={(e) => handleParamChange("fullPage", e.target.checked)}
                  className="rounded bg-neutral-950 border-neutral-800 text-blue-600 focus:ring-0"
                />
                <label htmlFor="fullPageShot" className="text-xs text-neutral-300">
                  Captura de página completa (Full page)
                </label>
              </div>
            </>
          )}

          {node.type === "setVariable" && (
            <>
              <div>
                <label className="block text-[11px] text-neutral-400 mb-1">Nombre de variable</label>
                <input
                  type="text"
                  value={node.params.name || ""}
                  onChange={(e) => handleParamChange("name", e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-md p-2 text-xs text-neutral-200 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-[11px] text-neutral-400 mb-1">Expresión o valor</label>
                <input
                  type="text"
                  value={node.params.expression || ""}
                  onChange={(e) => handleParamChange("expression", e.target.value)}
                  placeholder="ej. 'admin' o variables.contador + 1"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-md p-2 text-xs text-neutral-200 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>
            </>
          )}
        </div>

        {/* Editor de Localizadores (para nodos con target) */}
        {"locator" in node && node.locator && (
          <div className="border-t border-neutral-800/80 pt-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                Localizadores y Robustez
              </span>
            </div>

            {/* Localizador Primario */}
            <div className="p-2.5 rounded-lg bg-neutral-950 border border-neutral-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-blue-400 uppercase">
                  Principal (Primary)
                </span>
                <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-neutral-900 border border-neutral-800">
                  <ShieldCheck
                    className={`w-3 h-3 ${
                      node.locator.primary.score >= 80
                        ? "text-emerald-400"
                        : node.locator.primary.score >= 60
                        ? "text-amber-400"
                        : "text-rose-400"
                    }`}
                  />
                  <span className="text-[10px] font-mono text-neutral-300">
                    Score: {node.locator.primary.score}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <select
                  value={node.locator.primary.strategy}
                  onChange={(e) =>
                    handlePrimaryLocatorChange(e.target.value as LocatorStrategy, node.locator!.primary.value)
                  }
                  className="bg-neutral-900 border border-neutral-800 rounded p-1.5 text-xs text-neutral-200"
                >
                  {STRATEGY_OPTIONS.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={node.locator.primary.value}
                  onChange={(e) =>
                    handlePrimaryLocatorChange(node.locator!.primary.strategy, e.target.value)
                  }
                  className="col-span-2 bg-neutral-900 border border-neutral-800 rounded p-1.5 text-xs text-neutral-200 font-mono"
                />
              </div>
            </div>

            {/* Fallbacks */}
            {node.locator.fallbacks && node.locator.fallbacks.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[10px] font-medium text-neutral-400">
                  Selectores de Respaldo ({node.locator.fallbacks.length})
                </span>
                {node.locator.fallbacks.map((fb, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded bg-neutral-950 border border-neutral-800 text-xs font-mono"
                  >
                    <div className="truncate mr-2">
                      <span className="text-neutral-500 font-semibold mr-1.5">[{fb.strategy}]</span>
                      <span className="text-neutral-300">{fb.value}</span>
                    </div>
                    <div className="flex items-center space-x-1.5 shrink-0">
                      <span className="text-[10px] text-neutral-400">({fb.score})</span>
                      <button
                        onClick={() => handleRemoveFallback(idx)}
                        className="text-neutral-500 hover:text-rose-400 p-0.5"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Agregar nuevo Fallback */}
            <div className="p-2.5 rounded-lg bg-neutral-950/60 border border-dashed border-neutral-800 space-y-2">
              <span className="text-[10px] font-semibold text-neutral-400 uppercase">
                Agregar Selector de Respaldo
              </span>
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={newStrategy}
                  onChange={(e) => setNewStrategy(e.target.value as LocatorStrategy)}
                  className="bg-neutral-900 border border-neutral-800 rounded p-1.5 text-xs text-neutral-200"
                >
                  {STRATEGY_OPTIONS.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Valor del selector..."
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  className="col-span-2 bg-neutral-900 border border-neutral-800 rounded p-1.5 text-xs text-neutral-200 font-mono"
                />
              </div>

              {newValue && (
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-neutral-400">
                    Puntuación estimada:{" "}
                    <strong className="text-neutral-200">
                      {calculateLocatorScore(newStrategy, newValue)}
                    </strong>
                  </span>
                  <button
                    onClick={handleAddFallback}
                    className="flex items-center space-x-1 px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-medium transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Añadir</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Políticas de Error y Timeout */}
        <div className="border-t border-neutral-800/80 pt-3 space-y-3">
          <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
            Resiliencia y Tiempo
          </span>
          <div>
            <label className="block text-[11px] text-neutral-400 mb-1">
              Timeout (milisegundos)
            </label>
            <input
              type="number"
              value={node.timeout ?? 10000}
              onChange={(e) => updateNode(node.id, { timeout: Number(e.target.value) })}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-md p-2 text-xs text-neutral-200 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-[11px] text-neutral-400 mb-1">
              En caso de error (onError)
            </label>
            <select
              value={node.onError || "fail"}
              onChange={(e) => updateNode(node.id, { onError: e.target.value as any })}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-md p-2 text-xs text-neutral-200 focus:outline-none focus:border-blue-500"
            >
              <option value="fail">Detener y fallar (fail)</option>
              <option value="continue">Ignorar y continuar (continue)</option>
              <option value="retry">Reintentar con auto-repair (retry)</option>
            </select>
          </div>
        </div>
      </div>
    </aside>
  );
}
