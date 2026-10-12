"use client";

import React, { useState, useRef, useEffect } from "react";
import { Braces, ChevronRight, Hash, Type, CheckSquare, Layers, Key, Webhook, FileText } from "lucide-react";
import { useRecipeStore } from "@/stores/use-recipe-store";

interface VariablePickerProps {
  onSelect: (token: string) => void;
  title?: string;
  className?: string;
}

export function VariablePicker({ onSelect, title = "Insertar variable o salida", className = "" }: VariablePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const definition = useRecipeStore((s) => s.definition);
  const nodeOutputs = useRecipeStore((s) => s.nodeOutputs);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const globalVariables = definition?.variables || [];
  const secrets = definition?.secrets || [];
  const nodes = Object.values(definition?.nodes || {});

  // Identificar si existe algún nodo webhook
  const webhookNode = nodes.find((n) => n.type === "webhook");
  const webhookVar = (webhookNode as any)?.params?.outputVariable || "webhook";

  return (
    <div className={`relative inline-block ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title={title}
        className="flex items-center space-x-1 px-1.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 text-[11px] font-mono transition-colors"
      >
        <Braces className="w-3.5 h-3.5 text-zinc-400" />
        <span className="text-[10px]">{"{x}"}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-72 max-h-80 overflow-y-auto bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl z-50 p-2 space-y-2 text-xs">
          <div className="px-1.5 py-1 border-b border-zinc-800 text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
            Contexto de Variables & Salidas
          </div>

          {/* 1. Salidas de Pasos Previos */}
          {nodes.length > 0 && (
            <div>
              <span className="flex items-center space-x-1 text-[10px] font-mono text-zinc-500 uppercase px-1 mb-1">
                <Layers className="w-3 h-3" />
                <span>Salidas de Pasos (Steps)</span>
              </span>
              <div className="space-y-0.5">
                {nodes.map((node) => {
                  const outputVal = nodeOutputs[node.id];
                  const token = `{{steps.${node.id}.output}}`;
                  return (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => {
                        onSelect(token);
                        setIsOpen(false);
                      }}
                      className="w-full text-left px-2 py-1.5 rounded hover:bg-zinc-800/80 transition-colors flex items-center justify-between group"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center space-x-1.5 font-mono text-[11px] text-zinc-200 group-hover:text-white">
                          <span className="text-zinc-400">[{node.type}]</span>
                          <span className="truncate">{node.id}</span>
                        </div>
                        <p className="text-[10px] text-zinc-500 truncate">
                          {node.description || "Sin descripción"}
                        </p>
                        {outputVal !== undefined && (
                          <p className="text-[9px] font-mono text-emerald-400 truncate mt-0.5">
                            Salida: {typeof outputVal === "object" ? JSON.stringify(outputVal) : String(outputVal)}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="w-3 h-3 text-zinc-600 group-hover:text-zinc-300 shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. Webhook Payloads */}
          <div>
            <span className="flex items-center space-x-1 text-[10px] font-mono text-zinc-500 uppercase px-1 mb-1">
              <Webhook className="w-3 h-3" />
              <span>Payload de Webhook</span>
            </span>
            <div className="space-y-0.5 font-mono text-[11px]">
              {[
                { label: `${webhookVar}.body`, desc: "Cuerpo HTTP (JSON)", token: `{{${webhookVar}.body}}` },
                { label: `${webhookVar}.query`, desc: "Parámetros query string", token: `{{${webhookVar}.query}}` },
                { label: `${webhookVar}.headers`, desc: "Cabeceras HTTP", token: `{{${webhookVar}.headers}}` },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    onSelect(item.token);
                    setIsOpen(false);
                  }}
                  className="w-full text-left px-2 py-1 rounded hover:bg-zinc-800/80 transition-colors flex items-center justify-between group"
                >
                  <div>
                    <span className="text-zinc-300 group-hover:text-white">{item.label}</span>
                    <p className="text-[10px] text-zinc-500 font-sans">{item.desc}</p>
                  </div>
                  <ChevronRight className="w-3 h-3 text-zinc-600 group-hover:text-zinc-300 shrink-0" />
                </button>
              ))}
            </div>
          </div>

          {/* 3. Variables Globales de la Receta */}
          {globalVariables.length > 0 && (
            <div>
              <span className="flex items-center space-x-1 text-[10px] font-mono text-zinc-500 uppercase px-1 mb-1">
                <FileText className="w-3 h-3" />
                <span>Variables Globales</span>
              </span>
              <div className="space-y-0.5 font-mono text-[11px]">
                {globalVariables.map((v) => {
                  const token = `{{variables.${v.name}}}`;
                  return (
                    <button
                      key={v.name}
                      type="button"
                      onClick={() => {
                        onSelect(token);
                        setIsOpen(false);
                      }}
                      className="w-full text-left px-2 py-1 rounded hover:bg-zinc-800/80 transition-colors flex items-center justify-between group"
                    >
                      <div className="min-w-0 pr-2">
                        <span className="text-zinc-300 group-hover:text-white">{v.name}</span>
                        <span className="text-[10px] text-zinc-500 ml-1">({v.type})</span>
                      </div>
                      <ChevronRight className="w-3 h-3 text-zinc-600 group-hover:text-zinc-300 shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. Secretos */}
          {secrets.length > 0 && (
            <div>
              <span className="flex items-center space-x-1 text-[10px] font-mono text-zinc-500 uppercase px-1 mb-1">
                <Key className="w-3 h-3" />
                <span>Secretos Guardados</span>
              </span>
              <div className="space-y-0.5 font-mono text-[11px]">
                {secrets.map((sec) => {
                  const token = `{{secret.${sec}}}`;
                  return (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => {
                        onSelect(token);
                        setIsOpen(false);
                      }}
                      className="w-full text-left px-2 py-1 rounded hover:bg-zinc-800/80 transition-colors flex items-center justify-between group"
                    >
                      <span className="text-zinc-300 group-hover:text-white">{sec}</span>
                      <ChevronRight className="w-3 h-3 text-zinc-600 group-hover:text-zinc-300 shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
