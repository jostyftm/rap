"use client";

import React, { useState } from "react";
import { Search, Plus, PanelLeftClose } from "lucide-react";
import { useRecipeStore } from "@/stores/use-recipe-store";
import { useLayoutStore } from "@/stores/use-layout-store";
import { nodeRegistry } from "@/app/recipes/[id]/edit/components/nodes";

export function NodePalette() {
  const [search, setSearch] = useState("");
  const addNode = useRecipeStore((state) => state.addNode);
  const togglePaletteCollapsed = useLayoutStore((state) => state.togglePaletteCollapsed);

  const blockDefinitions = nodeRegistry.getAll();

  const filteredBlocks = blockDefinitions.filter(
    (b) =>
      b.label.toLowerCase().includes(search.toLowerCase()) ||
      b.description.toLowerCase().includes(search.toLowerCase()) ||
      b.type.toLowerCase().includes(search.toLowerCase()) ||
      (b.keywords && b.keywords.some((k) => k.toLowerCase().includes(search.toLowerCase())))
  );

  const categories = [
    { key: "interaction", label: "Navegación e Interacción" },
    { key: "waits", label: "Esperas y Sincronización" },
    { key: "data", label: "Datos y Artefactos" },
    { key: "control", label: "Control de Flujo" },
  ];

  return (
    <aside className="w-72 bg-neutral-900 border-r border-neutral-800 flex flex-col h-full select-none shrink-0">
      <div className="p-3 border-b border-neutral-800">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Bloques
          </h3>
          <button
            onClick={togglePaletteCollapsed}
            title="Ocultar panel de bloques (Ctrl+B)"
            className="p-1 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>
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
