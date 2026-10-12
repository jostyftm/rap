"use client";

import React, { useState } from "react";
import { Search, Plus, PanelLeftClose } from "lucide-react";
import { useRecipeStore } from "@/stores/use-recipe-store";
import { useLayoutStore } from "@/stores/use-layout-store";
import { nodeRegistry, ALL_BLOCK_DEFINITIONS } from "./nodes";

export function NodePalette() {
  const [search, setSearch] = useState("");
  const addNode = useRecipeStore((state) => state.addNode);
  const togglePaletteCollapsed = useLayoutStore((state) => state.togglePaletteCollapsed);

  const registered = nodeRegistry.getAll();
  const blockDefinitions = registered.length > 0 ? registered : ALL_BLOCK_DEFINITIONS;

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
    { key: "data", label: "Datos y Variables" },
    { key: "control", label: "Control de Flujo" },
  ];

  return (
    <aside className="w-72 bg-[#0c0c0e] border-r border-zinc-800 flex flex-col h-full select-none shrink-0">
      <div className="p-3 border-b border-zinc-800">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
            Bloques
          </h3>
          <button
            onClick={togglePaletteCollapsed}
            title="Ocultar panel de bloques (Ctrl+B)"
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Buscar bloque..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-600 transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {categories.map((cat) => {
          const blocks = filteredBlocks.filter((b) => b.category === cat.key);
          if (blocks.length === 0) return null;

          return (
            <div key={cat.key}>
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider px-1">
                {cat.label}
              </span>
              <div className="mt-1.5 space-y-1">
                {blocks.map((block) => {
                  const Icon = block.icon;
                  return (
                    <div
                      key={block.type}
                      onClick={() => addNode(block.type)}
                      className="group flex items-center justify-between p-2 rounded-md bg-zinc-900/30 border border-zinc-800/70 hover:border-zinc-700 hover:bg-zinc-850/60 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <div className="w-6 h-6 rounded bg-zinc-800 flex items-center justify-center border border-zinc-700/60 text-zinc-300 shrink-0">
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <div className="truncate">
                          <p className="text-xs font-medium text-zinc-200 group-hover:text-white transition-colors truncate">
                            {block.label}
                          </p>
                          <p className="text-[10px] text-zinc-500 truncate">
                            {block.description}
                          </p>
                        </div>
                      </div>
                      <button
                        title="Añadir al flujo"
                        className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-white transition-opacity"
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
