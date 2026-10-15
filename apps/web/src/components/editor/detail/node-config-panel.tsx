"use client";

import React, { useState } from "react";
import {
  Globe,
  SlidersHorizontal,
  BookOpen,
  Copy,
  Trash2,
  Power,
  Play,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Plus,
  X,
  FileCode,
  Sparkles,
} from "lucide-react";
import { useRecipeStore } from "@/stores/use-recipe-store";
import { nodeRegistry } from "../nodes";
import { ExpressionField } from "./expression-field";
import type { RecipeNode, LocatorStrategy, LocatorCandidate } from "@rpa/dsl";
import { calculateLocatorScore } from "@rpa/locator";

interface NodeConfigPanelProps {
  node: RecipeNode;
  onExecuteNode: () => Promise<void>;
  isExecuting: boolean;
  className?: string;
}

const STRATEGY_OPTIONS: LocatorStrategy[] = [
  "testid",
  "role",
  "label",
  "text",
  "css",
  "xpath",
];

export function NodeConfigPanel({
  node,
  onExecuteNode,
  isExecuting,
  className = "",
}: NodeConfigPanelProps) {
  const [activeTab, setActiveTab] = useState<"params" | "settings" | "docs">("params");
  const [newStrategy, setNewStrategy] = useState<LocatorStrategy>("css");
  const [newValue, setNewValue] = useState("");

  const definition = useRecipeStore((s) => s.definition);
  const updateNode = useRecipeStore((s) => s.updateNode);
  const deleteNode = useRecipeStore((s) => s.deleteNode);
  const duplicateNode = useRecipeStore((s) => s.duplicateNode);
  const toggleNodeDisabled = useRecipeStore((s) => s.toggleNodeDisabled);
  const disabledNodeIds = useRecipeStore((s) => s.disabledNodeIds);
  const setEntryNode = useRecipeStore((s) => s.setEntryNode);
  const nodeExecStatuses = useRecipeStore((s) => s.nodeExecStatuses);
  const nodeExecDurations = useRecipeStore((s) => s.nodeExecDurations);

  const isDisabled = disabledNodeIds.includes(node.id);
  const isEntry = definition.entry === node.id;
  const execStatus = nodeExecStatuses[node.id];
  const execDuration = nodeExecDurations[node.id];

  const nodeDef = nodeRegistry.get(node.type);
  const Icon = nodeDef?.icon || Globe;

  const handleParamChange = (key: string, val: any) => {
    updateNode(node.id, {
      params: {
        ...(node as any).params,
        [key]: val,
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
    <div className={`flex flex-col h-full bg-[#09090b] text-zinc-100 ${className}`}>
      {/* 1. Encabezado del Nodo: Icono, Nombre Editable, Badge y Acciones */}
      <div className="p-3.5 border-b border-zinc-800 bg-zinc-950/80 shrink-0 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5 min-w-0 flex-1 mr-3">
            <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-zinc-700/60 flex items-center justify-center text-zinc-200 shrink-0">
              <Icon className="w-4 h-4" />
            </div>

            <div className="min-w-0 flex-1">
              <input
                type="text"
                value={node.description || ""}
                onChange={(e) => updateNode(node.id, { description: e.target.value })}
                placeholder="Nombre o descripción del paso..."
                className="w-full bg-transparent border-none text-xs font-semibold text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-600 rounded px-1 py-0.5"
              />
              <div className="flex items-center space-x-2 mt-0.5 px-1">
                <span className="text-[10px] font-mono text-zinc-400 uppercase">
                  {node.type} ({node.id})
                </span>
                {nodeDef?.isInitializer && (
                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-400/10 text-amber-300 border border-amber-400/30">
                    {isEntry ? "★ Trigger Principal" : "Trigger Secundario"}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Menú de Acciones: Duplicar, Desactivar, Eliminar */}
          <div className="flex items-center space-x-1 shrink-0">
            <button
              type="button"
              onClick={() => duplicateNode(node.id)}
              title="Duplicar este paso"
              className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => toggleNodeDisabled(node.id)}
              title={isDisabled ? "Activar paso" : "Desactivar paso temporalmente"}
              className={`p-1.5 rounded transition-colors ${
                isDisabled
                  ? "bg-amber-400/20 text-amber-300 hover:bg-amber-400/30"
                  : "hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Power className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => deleteNode(node.id)}
              title="Eliminar este paso"
              className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-rose-400 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Pestañas: Parámetros | Ajustes | Documentación */}
        <div className="flex items-center space-x-1 border-t border-zinc-800/80 pt-2 text-xs font-mono">
          <button
            type="button"
            onClick={() => setActiveTab("params")}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center space-x-1.5 ${
              activeTab === "params"
                ? "bg-zinc-800 text-white font-medium"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <span>Parámetros</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("settings")}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center space-x-1.5 ${
              activeTab === "settings"
                ? "bg-zinc-800 text-white font-medium"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <SlidersHorizontal className="w-3 h-3" />
            <span>Ajustes</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("docs")}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center space-x-1.5 ${
              activeTab === "docs"
                ? "bg-zinc-800 text-white font-medium"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <BookOpen className="w-3 h-3" />
            <span>Documentación</span>
          </button>
        </div>
      </div>

      {/* 2. Cuerpo del Panel según Pestaña */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* PESTAÑA 1: PARÁMETROS */}
        {activeTab === "params" && (
          <div className="space-y-4">
            {/* Navegación a URL */}
            {node.type === "navigate" && (
              <ExpressionField
                label="URL de destino"
                value={(node.params as any).url || ""}
                onChange={(val) => handleParamChange("url", val)}
                placeholder="https://ejemplo.com o {{steps.login.output.redirectUrl}}"
                nodeId={node.id}
                description="La dirección web a la que navegará el navegador Playwright."
              />
            )}

            {/* Escritura de texto (Type) */}
            {node.type === "type" && (
              <ExpressionField
                label="Texto a escribir"
                value={(node.params as any).text || ""}
                onChange={(val) => handleParamChange("text", val)}
                placeholder="Texto o variable ej. {{webhook.body.email}}"
                nodeId={node.id}
                description="Texto que se escribirá en el campo de formulario seleccionado."
              />
            )}

            {/* Click, Select, WaitFor, etc. */}
            {node.type === "click" && (
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-medium text-zinc-300 block mb-1">
                    Botón del ratón
                  </label>
                  <select
                    value={(node.params as any).button || "left"}
                    onChange={(e) => handleParamChange("button", e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 font-mono"
                  >
                    <option value="left">Clic Izquierdo (left)</option>
                    <option value="right">Clic Derecho (right)</option>
                    <option value="middle">Clic Central (middle)</option>
                  </select>
                </div>
              </div>
            )}

            {node.type === "setVariable" && (
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-medium text-zinc-300 block mb-1">
                    Nombre de la variable
                  </label>
                  <input
                    type="text"
                    value={(node.params as any).name || ""}
                    onChange={(e) => handleParamChange("name", e.target.value)}
                    placeholder="ej. precio_final"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 font-mono"
                  />
                </div>
                <ExpressionField
                  label="Expresión o valor asignado"
                  value={(node.params as any).expression || ""}
                  onChange={(val) => handleParamChange("expression", val)}
                  placeholder="ej. {{steps.node_extract.output}} o $49.99"
                  nodeId={node.id}
                  description="Valor que tomará la variable en los nodos posteriores."
                />
              </div>
            )}

            {node.type === "webhook" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-medium text-zinc-300 block mb-1">
                      Método HTTP
                    </label>
                    <select
                      value={(node.params as any).httpMethod || "POST"}
                      onChange={(e) => handleParamChange("httpMethod", e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-200 font-mono"
                    >
                      <option value="ANY">ANY (Cualquiera)</option>
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                      <option value="PUT">PUT</option>
                      <option value="DELETE">DELETE</option>
                      <option value="PATCH">PATCH</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-zinc-300 block mb-1">
                      Código Respuesta HTTP
                    </label>
                    <input
                      type="number"
                      value={(node.params as any).responseCode || 200}
                      onChange={(e) => handleParamChange("responseCode", Number(e.target.value))}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-200 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-zinc-300 block mb-1">
                    Ruta del Webhook
                  </label>
                  <input
                    type="text"
                    value={(node.params as any).path || `/api/v1/webhooks/${node.id}`}
                    onChange={(e) => handleParamChange("path", e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 font-mono"
                  />
                </div>
              </div>
            )}

            {/* Renderizar formulario complementario del registro si existe */}
            {nodeDef?.InspectorForm && (
              <div className="pt-2 border-t border-zinc-800/80">
                <nodeDef.InspectorForm
                  node={node as any}
                  updateParam={handleParamChange}
                  updateNode={(updates) => updateNode(node.id, updates)}
                />
              </div>
            )}
          </div>
        )}

        {/* PESTAÑA 2: AJUSTES (Timeouts, Resiliencia, Entrada y Localizadores) */}
        {activeTab === "settings" && (
          <div className="space-y-4 text-xs font-mono">
            {/* Interruptor de Punto de Entrada Principal */}
            <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Play className={`w-3.5 h-3.5 ${isEntry ? "text-amber-400" : "text-zinc-500"}`} />
                  <span className="font-semibold text-zinc-200">
                    {nodeDef?.isInitializer ? "Trigger / Inicio del Flujo" : "Paso de Entrada"}
                  </span>
                </div>
                {isEntry ? (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-400/20 text-amber-300 font-semibold uppercase">
                    Activo como Principal
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEntryNode(node.id)}
                    className="text-[10px] px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                  >
                    Asignar como Principal
                  </button>
                )}
              </div>
              <p className="text-[11px] text-zinc-400 font-sans leading-relaxed">
                El nodo principal es el punto donde comienza la ejecución del flujo cuando se dispara la receta.
              </p>
            </div>

            {/* Parámetros de Resiliencia */}
            <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 space-y-3">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                Resiliencia & Fallos
              </span>

              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">
                  Timeout (milisegundos)
                </label>
                <input
                  type="number"
                  value={node.timeout ?? 10000}
                  onChange={(e) => updateNode(node.id, { timeout: Number(e.target.value) })}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200"
                />
              </div>

              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">
                  Acción en caso de error
                </label>
                <select
                  value={node.onError || "fail"}
                  onChange={(e) => updateNode(node.id, { onError: e.target.value as any })}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200"
                >
                  <option value="fail">Detener ejecución (fail)</option>
                  <option value="continue">Ignorar y continuar (continue)</option>
                  <option value="retry">Reintentar con auto-repair (retry)</option>
                </select>
              </div>
            </div>

            {/* Localizadores y Fallbacks si el nodo interactúa con elementos */}
            {"locator" in node && node.locator && (
              <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                    Localizador Principal
                  </span>
                  <div className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800">
                    <ShieldCheck
                      className={`w-3 h-3 ${
                        node.locator.primary.score >= 80
                          ? "text-emerald-400"
                          : node.locator.primary.score >= 60
                          ? "text-amber-400"
                          : "text-rose-400"
                      }`}
                    />
                    <span className="text-[10px] text-zinc-300">
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
                    className="bg-zinc-900 border border-zinc-800 rounded p-1.5 text-xs text-zinc-200"
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
                    className="col-span-2 bg-zinc-900 border border-zinc-800 rounded p-1.5 text-xs text-zinc-200 font-mono"
                  />
                </div>

                {/* Fallbacks */}
                {node.locator.fallbacks && node.locator.fallbacks.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-zinc-800/60">
                    <span className="text-[10px] text-zinc-500">
                      Fallbacks configurados ({node.locator.fallbacks.length})
                    </span>
                    {node.locator.fallbacks.map((fb, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-1.5 rounded bg-zinc-900/80 border border-zinc-800 text-[11px]"
                      >
                        <span className="text-zinc-400 truncate">
                          [{fb.strategy}] {fb.value}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveFallback(idx)}
                          className="text-zinc-500 hover:text-rose-400 p-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* PESTAÑA 3: DOCUMENTACIÓN DEL NODO */}
        {activeTab === "docs" && (
          <div className="space-y-3 text-xs leading-relaxed font-sans text-zinc-300">
            <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 space-y-1.5">
              <h4 className="font-semibold text-zinc-100 flex items-center space-x-1.5">
                <BookOpen className="w-3.5 h-3.5 text-amber-400" />
                <span>Acerca del nodo {nodeDef?.label || node.type}</span>
              </h4>
              <p className="text-zinc-400 text-[11px]">
                {nodeDef?.description || "Sin documentación disponible."}
              </p>
            </div>

            <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 space-y-2">
              <h5 className="font-semibold text-zinc-200 text-[11px] uppercase tracking-wider font-mono">
                Variables de salida retornadas
              </h5>
              <p className="text-[11px] text-zinc-400">
                Al ejecutarse, este nodo genera datos accesibles en nodos posteriores con:
              </p>
              <div className="p-2 rounded bg-zinc-900 border border-zinc-800 font-mono text-[11px] text-amber-300">
                {`{{steps.${node.id}.output}}`}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 space-y-2">
              <h5 className="font-semibold text-zinc-200 text-[11px] uppercase tracking-wider font-mono">
                Comportamiento en Playwright
              </h5>
              <p className="text-[11px] text-zinc-400">
                Este paso se compila de forma determinista sin depender de modelos de IA durante la ejecución en el motor runner.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 3. Botón Principal Inferior Fijo: "Ejecutar nodo" */}
      <div className="p-3 border-t border-zinc-800 bg-zinc-950/90 shrink-0 flex items-center justify-between">
        <div className="flex items-center space-x-2 text-xs font-mono text-zinc-400">
          {execStatus === "success" && (
            <span className="flex items-center space-x-1 text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Éxito ({execDuration || 0}ms)</span>
            </span>
          )}
          {execStatus === "error" && (
            <span className="flex items-center space-x-1 text-rose-400">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Falló</span>
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onExecuteNode}
          disabled={isExecuting}
          className="flex items-center space-x-2 px-4 py-2 rounded-md bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold transition-all shadow-md active:scale-95 disabled:opacity-50"
        >
          {isExecuting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Ejecutando...</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Ejecutar nodo</span>
              <kbd className="text-[10px] font-mono text-zinc-500 bg-zinc-200 px-1 py-0.5 rounded ml-1">
                Ctrl + Enter
              </kbd>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
