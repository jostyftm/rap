"use client";

import React, { useState } from "react";
import {
  Globe,
  MousePointer,
  Keyboard,
  ListFilter,
  Clock,
  Camera,
  Download,
  Variable,
  GitBranch,
  Repeat,
  Search,
  Plus,
} from "lucide-react";
import type { RecipeNode } from "@rpa/dsl";
import { useRecipeStore } from "../../stores/use-recipe-store";

interface BlockDefinition {
  type: RecipeNode["type"];
  label: string;
  description: string;
  category: "interaction" | "waits" | "data" | "control";
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const BLOCK_DEFINITIONS: BlockDefinition[] = [
  // Interacción y Navegación
  {
    type: "navigate",
    label: "Navegar (goto)",
    description: "Cargar una dirección URL en el navegador",
    category: "interaction",
    icon: Globe,
    color: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  },
  {
    type: "click",
    label: "Clic",
    description: "Hacer clic en un botón, enlace o elemento",
    category: "interaction",
    icon: MousePointer,
    color: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
  },
  {
    type: "type",
    label: "Escribir (type)",
    description: "Rellenar un campo de texto o formulario",
    category: "interaction",
    icon: Keyboard,
    color: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
  },
  {
    type: "select",
    label: "Seleccionar (select)",
    description: "Elegir una opción en un menú desplegable",
    category: "interaction",
    icon: ListFilter,
    color: "bg-teal-500/10 text-teal-600 border-teal-500/20",
  },

  // Esperas
  {
    type: "waitFor",
    label: "Esperar (waitFor)",
    description: "Esperar elemento, red o URL con auto-wait",
    category: "waits",
    icon: Clock,
    color: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  },

  // Extracción y Capturas
  {
    type: "extract",
    label: "Extraer Datos",
    description: "Obtener texto, atributo o lista a variable",
    category: "data",
    icon: Download,
    color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  },
  {
    type: "screenshot",
    label: "Captura de Pantalla",
    description: "Tomar screenshot de la página o de un elemento",
    category: "data",
    icon: Camera,
    color: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  },
  {
    type: "setVariable",
    label: "Definir Variable",
    description: "Almacenar o transformar un valor con expresión",
    category: "data",
    icon: Variable,
    color: "bg-pink-500/10 text-pink-600 border-pink-500/20",
  },

  // Control de Flujo
  {
    type: "condition",
    label: "Condición (if / else)",
    description: "Bifurcación lógica basada en expresión",
    category: "control",
    icon: GitBranch,
    color: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  },
  {
    type: "loop",
    label: "Bucle (loop)",
    description: "Iterar sobre una colección de elementos",
    category: "control",
    icon: Repeat,
    color: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  },
];

export function NodePalette() {
  const [search, setSearch] = useState("");
  const addNode = useRecipeStore((state) => state.addNode);

  const filteredBlocks = BLOCK_DEFINITIONS.filter(
    (b) =>
      b.label.toLowerCase().includes(search.toLowerCase()) ||
      b.description.toLowerCase().includes(search.toLowerCase()) ||
      b.type.toLowerCase().includes(search.toLowerCase())
  );

  const categories = [
    { key: "interaction", label: "Navegación e Interacción" },
    { key: "waits", label: "Esperas y Sincronización" },
    { key: "data", label: "Datos y Artefactos" },
    { key: "control", label: "Control de Flujo" },
  ];

  return (
    <aside className="w-72 bg-neutral-900 border-r border-neutral-800 flex flex-col h-full select-none">
      <div className="p-3 border-b border-neutral-800">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">
          Bloques de Automatización
        </h3>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-neutral-500" />
          <input
            type="text"
            placeholder="Buscar bloque..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-md pl-8 pr-3 py-1.5 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {categories.map((cat) => {
          const blocks = filteredBlocks.filter((b) => b.category === cat.key);
          if (blocks.length === 0) return null;

          return (
            <div key={cat.key}>
              <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider px-1">
                {cat.label}
              </span>
              <div className="mt-1.5 space-y-1.5">
                {blocks.map((block) => {
                  const Icon = block.icon;
                  return (
                    <div
                      key={block.type}
                      onClick={() => addNode(block.type)}
                      className="group flex items-center justify-between p-2 rounded-lg bg-neutral-950/70 border border-neutral-800/80 hover:border-neutral-700 hover:bg-neutral-800/40 cursor-pointer transition-all"
                    >
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <div
                          className={`w-7 h-7 rounded-md flex items-center justify-center border ${block.color}`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="truncate">
                          <p className="text-xs font-medium text-neutral-200 group-hover:text-white transition-colors">
                            {block.label}
                          </p>
                          <p className="text-[10px] text-neutral-500 truncate">
                            {block.description}
                          </p>
                        </div>
                      </div>
                      <button
                        title="Añadir al flujo"
                        className="opacity-0 group-hover:opacity-100 p-1 text-neutral-400 hover:text-white transition-opacity"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
