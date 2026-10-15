"use client";

import React, { useState, useMemo } from "react";
import {
  ChevronRight,
  ChevronDown,
  Copy,
  Check,
  Search,
  GripVertical,
  Plus,
  Braces,
  Table as TableIcon,
  Code2,
} from "lucide-react";

export type DataViewMode = "schema" | "table" | "json";

interface DataViewerProps {
  data: unknown;
  baseTokenPrefix?: string; // ej: "{{steps.node_1.output"
  onInsertToken?: (token: string) => void;
  emptyMessage?: string;
  className?: string;
}

function getTypeBadge(val: unknown): { label: string; color: string } {
  if (val === null) return { label: "null", color: "bg-zinc-800 text-zinc-400" };
  if (Array.isArray(val)) return { label: `array[${val.length}]`, color: "bg-purple-950/80 text-purple-300 border-purple-800/60" };
  const type = typeof val;
  if (type === "string") return { label: "string", color: "bg-emerald-950/80 text-emerald-300 border-emerald-800/60" };
  if (type === "number") return { label: "number", color: "bg-blue-950/80 text-blue-300 border-blue-800/60" };
  if (type === "boolean") return { label: "boolean", color: "bg-amber-950/80 text-amber-300 border-amber-800/60" };
  if (type === "object") return { label: "object", color: "bg-cyan-950/80 text-cyan-300 border-cyan-800/60" };
  return { label: type, color: "bg-zinc-800 text-zinc-400" };
}

interface TreeNodeProps {
  keyName: string;
  value: unknown;
  currentPath: string;
  baseTokenPrefix: string;
  onInsertToken?: (token: string) => void;
  searchTerm: string;
}

function SchemaTreeNode({
  keyName,
  value,
  currentPath,
  baseTokenPrefix,
  onInsertToken,
  searchTerm,
}: TreeNodeProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  const isObject = value !== null && typeof value === "object";
  const isArray = Array.isArray(value);
  const badge = getTypeBadge(value);

  const token = currentPath
    ? `${baseTokenPrefix}.${currentPath}}}`
    : `${baseTokenPrefix}}}`;

  const handleDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    e.dataTransfer.setData("application/json", JSON.stringify({ token, path: currentPath, value }));
    e.dataTransfer.setData("text/plain", token);
    e.dataTransfer.effectAllowed = "copy";
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Filtrado por búsqueda
  const matchesSearch =
    !searchTerm ||
    keyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(value).toLowerCase().includes(searchTerm.toLowerCase());

  if (!matchesSearch && !isObject) {
    return null;
  }

  return (
    <div className="text-xs select-none">
      <div
        draggable
        onDragStart={handleDragStart}
        className="flex items-center justify-between py-1 px-1.5 rounded hover:bg-zinc-900 group cursor-grab active:cursor-grabbing transition-colors"
      >
        <div className="flex items-center space-x-1.5 min-w-0 flex-1">
          <GripVertical className="w-3 h-3 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />

          {isObject ? (
            <button
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              className="p-0.5 text-zinc-400 hover:text-white"
            >
              {isOpen ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}

          <span className="font-mono text-zinc-200 truncate">{keyName}:</span>

          <span
            className={`text-[9px] font-mono px-1.5 py-0.2 rounded border ${badge.color} shrink-0`}
          >
            {badge.label}
          </span>

          {!isObject && (
            <span className="font-mono text-zinc-400 truncate max-w-[150px]">
              {typeof value === "string" ? `"${value}"` : String(value)}
            </span>
          )}
        </div>

        {/* Acciones flotantes en hover */}
        <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {onInsertToken && (
            <button
              type="button"
              onClick={() => onInsertToken(token)}
              title="Insertar variable en el campo activo"
              className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-[10px] flex items-center space-x-0.5"
            >
              <Plus className="w-3 h-3" />
              <span className="text-[9px]">Insertar</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleCopy}
            title={`Copiar variable ${token}`}
            className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {isObject && isOpen && (
        <div className="pl-4 border-l border-zinc-800/80 ml-2 space-y-0.5 mt-0.5">
          {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
            <SchemaTreeNode
              key={k}
              keyName={k}
              value={v}
              currentPath={currentPath ? `${currentPath}.${k}` : k}
              baseTokenPrefix={baseTokenPrefix}
              onInsertToken={onInsertToken}
              searchTerm={searchTerm}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function DataViewer({
  data,
  baseTokenPrefix = "{{steps.node_1.output",
  onInsertToken,
  emptyMessage = "Sin datos disponibles.",
  className = "",
}: DataViewerProps) {
  const [viewMode, setViewMode] = useState<DataViewMode>("schema");
  const [searchTerm, setSearchTerm] = useState("");
  const [copiedAll, setCopiedAll] = useState(false);

  const cleanPrefix = baseTokenPrefix.endsWith("}}")
    ? baseTokenPrefix.slice(0, -2)
    : baseTokenPrefix;

  // Detectar si los datos son un arreglo o convertible a tabla
  const tableData = useMemo(() => {
    if (!data) return null;
    if (Array.isArray(data)) return data;
    if (typeof data === "object") {
      // Buscar si alguna propiedad es un arreglo de objetos
      const entries = Object.entries(data);
      for (const [_, val] of entries) {
        if (Array.isArray(val) && val.length > 0 && typeof val[0] === "object") {
          return val;
        }
      }
      return [data];
    }
    return [{ valor: data }];
  }, [data]);

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 1500);
  };

  if (data === undefined || data === null) {
    return (
      <div className={`p-4 text-center text-xs text-zinc-500 font-mono ${className}`}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full overflow-hidden ${className}`}>
      {/* Barra de Controles: Selector de Modo (Schema / Table / JSON) y Buscador */}
      <div className="flex items-center justify-between p-2 border-b border-zinc-800 gap-2 shrink-0">
        <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded p-0.5 text-xs font-mono">
          <button
            type="button"
            onClick={() => setViewMode("schema")}
            className={`flex items-center space-x-1 px-2 py-1 rounded transition-colors ${
              viewMode === "schema"
                ? "bg-zinc-800 text-white font-medium"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Braces className="w-3 h-3" />
            <span>Schema</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("table")}
            className={`flex items-center space-x-1 px-2 py-1 rounded transition-colors ${
              viewMode === "table"
                ? "bg-zinc-800 text-white font-medium"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <TableIcon className="w-3 h-3" />
            <span>Table</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("json")}
            className={`flex items-center space-x-1 px-2 py-1 rounded transition-colors ${
              viewMode === "json"
                ? "bg-zinc-800 text-white font-medium"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Code2 className="w-3 h-3" />
            <span>JSON</span>
          </button>
        </div>

        {/* Buscador */}
        <div className="relative flex-1 max-w-[200px]">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2 top-2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filtrar campos..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded pl-7 pr-2 py-1 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
          />
        </div>

        <button
          type="button"
          onClick={handleCopyJson}
          title="Copiar JSON completo"
          className="p-1.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white transition-colors shrink-0"
        >
          {copiedAll ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Cuerpo del Visualizador según Modo */}
      <div className="flex-1 overflow-auto p-2 text-xs font-mono">
        {/* 1. MODO SCHEMA (Árbol Expandible con Arrastre) */}
        {viewMode === "schema" && (
          <div className="space-y-0.5">
            {typeof data === "object" && data !== null ? (
              Object.entries(data as Record<string, unknown>).map(([k, v]) => (
                <SchemaTreeNode
                  key={k}
                  keyName={k}
                  value={v}
                  currentPath={k}
                  baseTokenPrefix={cleanPrefix}
                  onInsertToken={onInsertToken}
                  searchTerm={searchTerm}
                />
              ))
            ) : (
              <SchemaTreeNode
                keyName="output"
                value={data}
                currentPath=""
                baseTokenPrefix={cleanPrefix}
                onInsertToken={onInsertToken}
                searchTerm={searchTerm}
              />
            )}
          </div>
        )}

        {/* 2. MODO TABLE (Filas y Columnas con Encabezados Arrastrables) */}
        {viewMode === "table" && tableData && (
          <div className="overflow-x-auto border border-zinc-800 rounded">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-zinc-900/90 border-b border-zinc-800 text-zinc-400 uppercase font-mono text-[10px]">
                <tr>
                  <th className="p-2 w-8 text-zinc-600">#</th>
                  {Object.keys(tableData[0] || {}).map((col) => {
                    const colToken = `${cleanPrefix}.${col}}}`;
                    return (
                      <th
                        key={col}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData(
                            "application/json",
                            JSON.stringify({ token: colToken, path: col })
                          );
                          e.dataTransfer.setData("text/plain", colToken);
                        }}
                        className="p-2 cursor-grab active:cursor-grabbing hover:bg-zinc-800/80 transition-colors"
                        title={`Arrastrar columna: ${colToken}`}
                      >
                        <div className="flex items-center space-x-1">
                          <GripVertical className="w-3 h-3 text-zinc-500" />
                          <span>{col}</span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-mono text-[11px]">
                {tableData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-zinc-900/40">
                    <td className="p-2 text-zinc-600">{idx + 1}</td>
                    {Object.values(row).map((cell: any, cIdx) => (
                      <td key={cIdx} className="p-2 truncate max-w-[200px]">
                        {typeof cell === "object" ? JSON.stringify(cell) : String(cell ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 3. MODO JSON (Solo Lectura con Resaltado y Copia) */}
        {viewMode === "json" && (
          <pre className="p-2 bg-zinc-950 border border-zinc-900 rounded text-[11px] text-zinc-300 overflow-x-auto leading-relaxed select-text">
            {JSON.stringify(data, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
