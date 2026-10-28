"use client";

import React, { useState } from "react";
import { X, SlidersHorizontal, Plus, Trash2, HelpCircle, Sparkles } from "lucide-react";
import type { RecipeVariable } from "@rpa/dsl";
import { useRecipeStore } from "../../stores/use-recipe-store";

interface VariablesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function VariablesModal({ isOpen, onClose }: VariablesModalProps) {
  const definition = useRecipeStore((s) => s.definition);
  const setRecipeVariables = useRecipeStore((s) => s.setRecipeVariables);

  const variables: RecipeVariable[] = definition?.variables || [];

  // Formulario nueva variable
  const [name, setName] = useState("");
  const [type, setType] = useState<"string" | "number" | "boolean" | "array" | "object">("string");
  const [defaultValue, setDefaultValue] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setError("El nombre de la variable es obligatorio.");
      return;
    }

    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(cleanName)) {
      setError("El nombre solo puede contener letras, números y guiones bajos (ej. mock_mac).");
      return;
    }

    if (variables.some((v) => v.name === cleanName)) {
      setError(`Ya existe una variable con el nombre '${cleanName}'.`);
      return;
    }

    let parsedValue: unknown = defaultValue;
    if (type === "number") {
      const num = Number(defaultValue);
      if (isNaN(num)) {
        setError("El valor debe ser un número válido.");
        return;
      }
      parsedValue = num;
    } else if (type === "boolean") {
      parsedValue = defaultValue.toLowerCase() === "true" || defaultValue === "1";
    } else if (type === "array" || type === "object") {
      if (defaultValue.trim()) {
        try {
          parsedValue = JSON.parse(defaultValue);
        } catch {
          setError(`El valor debe ser un JSON válido para el tipo ${type}.`);
          return;
        }
      } else {
        parsedValue = type === "array" ? [] : {};
      }
    }

    const newVar: RecipeVariable = {
      name: cleanName,
      type,
      defaultValue: defaultValue.trim() ? parsedValue : undefined,
      description: description.trim() || undefined,
    };

    setRecipeVariables([...variables, newVar]);
    setName("");
    setType("string");
    setDefaultValue("");
    setDescription("");
    setError(null);
  };

  const handleDelete = (varName: string) => {
    setRecipeVariables(variables.filter((v) => v.name !== varName));
  };

  const fillMockMacPreset = () => {
    setName("mock_mac");
    setType("string");
    setDefaultValue("00:1A:2B:3C:4D:5E");
    setDescription("Dirección MAC simulada para UAT Codesa Superflex (puerto 9494)");
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Cabecera */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950/60">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-neutral-100">Variables de Receta</h3>
              <p className="text-[11px] text-neutral-400">
                Parámetros iniciales y valores de prueba para la simulación y ejecución.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido con scroll */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Botón de preconfiguración rápida para Superflex */}
          {!variables.some((v) => v.name === "mock_mac") && (
            <div className="p-3 bg-purple-950/30 border border-purple-800/40 rounded-lg flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-purple-200">
                    ¿Automatizando Superflex (Codesa)?
                  </p>
                  <p className="text-[10px] text-purple-400/90">
                    Preconfigura el parámetro <code className="font-mono">mock_mac</code> para simular el Tray Icon en el puerto 9494.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={fillMockMacPreset}
                className="px-2.5 py-1 text-xs font-medium bg-purple-600 hover:bg-purple-500 text-white rounded-md transition-colors"
              >
                Cargar mock_mac
              </button>
            </div>
          )}

          {/* Formulario para agregar variable */}
          <form onSubmit={handleAdd} className="p-4 bg-neutral-950/60 border border-neutral-800 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-200 uppercase tracking-wider">
                Nueva Variable
              </span>
            </div>

            {error && (
              <div className="p-2 bg-rose-950/50 border border-rose-800 text-rose-300 text-xs rounded">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-neutral-400 mb-1">
                  Nombre de variable *
                </label>
                <input
                  type="text"
                  placeholder="ej. mock_mac, usuario"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-8 px-2.5 text-xs bg-neutral-900 border border-neutral-700 rounded text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-purple-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-neutral-400 mb-1">
                  Tipo
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as any)}
                  className="w-full h-8 px-2 text-xs bg-neutral-900 border border-neutral-700 rounded text-neutral-100 focus:outline-none focus:border-purple-500"
                >
                  <option value="string">Texto (string)</option>
                  <option value="number">Número (number)</option>
                  <option value="boolean">Booleano (boolean)</option>
                  <option value="array">Arreglo (array/json)</option>
                  <option value="object">Objeto (object/json)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-neutral-400 mb-1">
                  Valor por defecto
                </label>
                <input
                  type="text"
                  placeholder={type === "array" ? '["00:1A:..."]' : type === "boolean" ? "true" : "ej. 00:1A:2B:3C:4D:5E"}
                  value={defaultValue}
                  onChange={(e) => setDefaultValue(e.target.value)}
                  className="w-full h-8 px-2.5 text-xs bg-neutral-900 border border-neutral-700 rounded text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-purple-500 font-mono"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Descripción opcional (ej. Dirección MAC autorizada en UAT)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full h-8 px-2.5 text-xs bg-neutral-900 border border-neutral-700 rounded text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-purple-500"
                />
              </div>
              <button
                type="submit"
                className="h-8 px-4 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-medium flex items-center space-x-1.5 transition-colors shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar Variable</span>
              </button>
            </div>
          </form>

          {/* Listado de variables existentes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-neutral-300">
                Variables Declaradas ({variables.length})
              </span>
            </div>

            {variables.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-neutral-800 rounded-lg text-neutral-500 text-xs">
                No hay variables configuradas en esta receta.
              </div>
            ) : (
              <div className="border border-neutral-800 rounded-lg divide-y divide-neutral-800 bg-neutral-950/40">
                {variables.map((v) => (
                  <div key={v.name} className="p-3 flex items-start justify-between hover:bg-neutral-900/40 transition-colors">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-xs font-semibold text-purple-300">
                          {v.name}
                        </span>
                        <span className="px-1.5 py-0.5 text-[9px] font-mono rounded bg-neutral-800 text-neutral-400 border border-neutral-700">
                          {v.type}
                        </span>
                      </div>

                      {v.defaultValue !== undefined && (
                        <div className="text-[11px] text-neutral-300 font-mono flex items-center space-x-1">
                          <span className="text-neutral-500">por defecto:</span>
                          <span className="bg-neutral-900 px-1 rounded border border-neutral-800">
                            {typeof v.defaultValue === "object" ? JSON.stringify(v.defaultValue) : String(v.defaultValue)}
                          </span>
                        </div>
                      )}

                      {v.description && (
                        <p className="text-[11px] text-neutral-400 leading-snug">
                          {v.description}
                        </p>
                      )}
                    </div>

                    <button
                      onClick={() => handleDelete(v.name)}
                      title="Eliminar variable"
                      className="p-1.5 text-neutral-400 hover:text-rose-400 hover:bg-rose-950/30 rounded transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Pie */}
        <div className="px-6 py-3 border-t border-neutral-800 bg-neutral-950/60 flex items-center justify-between text-xs text-neutral-400">
          <div className="flex items-center space-x-1.5 text-[11px]">
            <HelpCircle className="w-3.5 h-3.5 text-neutral-500" />
            <span>Disponible como <code className="font-mono text-purple-300">{`{{variables.nombre}}`}</code> en los nodos.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-colors font-medium"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
