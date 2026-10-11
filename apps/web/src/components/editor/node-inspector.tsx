"use client";

import React, { useState } from "react";
import {
  Trash2,
  ShieldCheck,
  Plus,
  Play,
  X,
  ChevronDown,
  SlidersHorizontal,
  AlertTriangle,
} from "lucide-react";
import type { RecipeNode, LocatorStrategy, LocatorCandidate } from "@rpa/dsl";
import { calculateLocatorScore } from "@rpa/locator";
import { useRecipeStore } from "@/stores/use-recipe-store";
import { LiveNodeTools } from "./live-node-tools";
import { nodeRegistry } from "./nodes";
import { getFieldLabel } from "./nodes/field-labels";

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
  const setSelectedNodeId = useRecipeStore((s) => s.setSelectedNodeId);
  const definition = useRecipeStore((s) => s.definition);
  const updateNode = useRecipeStore((s) => s.updateNode);
  const deleteNode = useRecipeStore((s) => s.deleteNode);
  const setEntryNode = useRecipeStore((s) => s.setEntryNode);
  const nodeIssues = useRecipeStore((s) => s.nodeIssues) ?? {};

  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [newStrategy, setNewStrategy] = useState<LocatorStrategy>("css");
  const [newValue, setNewValue] = useState("");

  if (!selectedNodeId || !definition.nodes[selectedNodeId]) {
    return null;
  }

  const issues = (selectedNodeId && nodeIssues?.[selectedNodeId]) ? nodeIssues[selectedNodeId] : [];

  const node: RecipeNode = definition.nodes[selectedNodeId];
  const isEntry = definition.entry === selectedNodeId;
  const nodeDef = nodeRegistry.get(node.type);
  const InspectorForm = nodeDef?.InspectorForm;
  const AdvancedForm = nodeDef?.AdvancedOptionsForm;

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
    <aside className="w-80 bg-neutral-900 border-l border-neutral-800 flex flex-col h-full select-none overflow-y-auto shrink-0 shadow-2xl">
      {/* Header del Inspector */}
      <div className="p-3.5 border-b border-neutral-800 flex items-center justify-between">
        <div className="min-w-0 pr-2">
          <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
            Propiedades del Paso
          </span>
          <h4 className="text-xs font-semibold text-neutral-200 uppercase font-mono mt-0.5 truncate">
            {nodeDef?.label || node.type} ({node.id})
          </h4>
        </div>
        <div className="flex items-center space-x-1 shrink-0">
          <button
            onClick={() => deleteNode(node.id)}
            title="Eliminar este paso"
            className="p-1.5 rounded-lg text-neutral-500 hover:text-rose-400 hover:bg-neutral-800 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setSelectedNodeId(null)}
            title="Cerrar panel"
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-3.5 space-y-4 flex-1">
        {/* Banner de parámetros incompletos con detalles específicos */}
        {issues.length > 0 && (
          <div className="bg-rose-950/40 border border-rose-500/30 rounded-lg p-3 space-y-1.5 text-xs text-rose-300">
            <div className="flex items-center space-x-1.5 font-semibold text-rose-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Parámetros pendientes de configurar:</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-[11px] text-rose-300/90 pl-1">
              {issues.map((iss, idx) => (
                <li key={idx}>
                  <strong className="text-rose-200">{getFieldLabel(iss.field)}:</strong>{" "}
                  {iss.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Descripción Básica */}
        <div>
          <label className="block text-[11px] font-medium text-neutral-400 mb-1">
            Descripción
          </label>
          <input
            type="text"
            value={node.description || ""}
            onChange={(e) => updateNode(node.id, { description: e.target.value })}
            placeholder="¿Qué hace este paso?"
            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        {/* Configuración Primaria Polimórfica según Tipo (SOLID / Factory) */}
        {InspectorForm ? (
          <InspectorForm
            node={node as any}
            updateParam={handleParamChange}
            updateNode={(updates) => updateNode(node.id, updates)}
          />
        ) : (
          <div className="text-xs text-neutral-500 italic p-2 border border-neutral-800 rounded">
            Sin propiedades específicas para este bloque.
          </div>
        )}

        {/* Herramientas Rápidas del Sitio en Vivo (Seleccionar elemento / Probar paso) */}
        <LiveNodeTools node={node} />

        {/* ============================================================== */}
        {/* REVELACIÓN PROGRESIVA: Acordeón de Opciones Avanzadas */}
        {/* ============================================================== */}
        <div className="border-t border-neutral-800/80 pt-3">
          <button
            onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
            className="w-full flex items-center justify-between p-2 rounded-lg bg-neutral-950/80 hover:bg-neutral-950 border border-neutral-800 hover:border-neutral-700 text-xs text-neutral-300 transition-colors"
          >
            <span className="flex items-center space-x-2 font-medium">
              <SlidersHorizontal className="w-3.5 h-3.5 text-blue-400" />
              <span>Opciones Avanzadas</span>
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-neutral-400 transition-transform ${
                isAdvancedOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {isAdvancedOpen && (
            <div className="mt-3 space-y-4 animate-in fade-in duration-150">
              {/* Toggle de Entrada Inicial */}
              <div className="flex items-center justify-between p-2 rounded-lg bg-neutral-950 border border-neutral-800 text-xs">
                <div className="flex items-center space-x-2">
                  <Play
                    className={`w-3.5 h-3.5 ${
                      isEntry ? "text-emerald-400" : "text-neutral-500"
                    }`}
                  />
                  <span className="text-neutral-300 font-medium">Paso Inicial (Entry)</span>
                </div>
                {!isEntry ? (
                  <button
                    onClick={() => setEntryNode(node.id)}
                    className="text-[10px] px-2 py-0.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded font-medium transition-colors"
                  >
                    Fijar como inicio
                  </button>
                ) : (
                  <span className="text-[10px] text-emerald-400 font-semibold uppercase">
                    Activo
                  </span>
                )}
              </div>

              {/* Opciones Específicas Secundarias Polimórficas */}
              {AdvancedForm && (
                <AdvancedForm
                  node={node as any}
                  updateParam={handleParamChange}
                  updateNode={(updates) => updateNode(node.id, updates)}
                />
              )}

              {/* Localizador Primario y Fallbacks */}
              {"locator" in node && node.locator && (
                <div className="space-y-3 pt-1 border-t border-neutral-800/80">
                  <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                    Localizadores y Robustez
                  </span>

                  <div className="p-2.5 rounded-lg bg-neutral-950 border border-neutral-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-blue-400 uppercase">
                        Principal
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
                          handlePrimaryLocatorChange(
                            e.target.value as LocatorStrategy,
                            node.locator!.primary.value
                          )
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
                          handlePrimaryLocatorChange(
                            node.locator!.primary.strategy,
                            e.target.value
                          )
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
                            <span className="text-neutral-500 font-semibold mr-1.5">
                              [{fb.strategy}]
                            </span>
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

                  {/* Formulario nuevo Fallback */}
                  <div className="p-2.5 rounded-lg bg-neutral-950/60 border border-dashed border-neutral-800 space-y-2">
                    <span className="text-[10px] font-semibold text-neutral-400 uppercase">
                      Añadir Selector de Respaldo
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
                          Score: {calculateLocatorScore(newStrategy, newValue)}
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

              {/* Resiliencia y Tiempo */}
              <div className="border-t border-neutral-800/80 pt-3 space-y-2">
                <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                  Resiliencia
                </span>
                <div>
                  <label className="block text-[11px] text-neutral-400 mb-1">Timeout (ms)</label>
                  <input
                    type="number"
                    value={node.timeout ?? 10000}
                    onChange={(e) => updateNode(node.id, { timeout: Number(e.target.value) })}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-1.5 text-xs text-neutral-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-neutral-400 mb-1">
                    En caso de fallo
                  </label>
                  <select
                    value={node.onError || "fail"}
                    onChange={(e) => updateNode(node.id, { onError: e.target.value as any })}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-1.5 text-xs text-neutral-200 focus:outline-none focus:border-blue-500"
                  >
                    <option value="fail">Detener ejecución (fail)</option>
                    <option value="continue">Ignorar y continuar (continue)</option>
                    <option value="retry">Reintentar con auto-repair (retry)</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
