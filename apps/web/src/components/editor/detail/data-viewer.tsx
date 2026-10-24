"use client";

import React, { useState } from "react";
import {
  ChevronDown,
  Copy,
  Check,
  Search,
  GripVertical,
  Plus,
  Braces,
  Table as TableIcon,
  Code2,
  X,
} from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/primitives";
import { JsonView } from "./json-view";
import { cn } from "@/lib/utils";

export type DataViewMode = "schema" | "table" | "json";

interface DataViewerProps {
  data: unknown;
  baseTokenPrefix?: string; // ej: "{{steps.node_1.output"
  onInsertToken?: (token: string) => void;
  emptyMessage?: string;
  className?: string;
}

function getTypeBadge(val: unknown): { label: string; tone: BadgeTone } {
  if (val === null) return { label: "null", tone: "neutral" };
  if (Array.isArray(val)) return { label: `array[${val.length}]`, tone: "violet" };
  const type = typeof val;
  if (type === "string") return { label: "string", tone: "success" };
  if (type === "number") return { label: "number", tone: "info" };
  if (type === "boolean") return { label: "boolean", tone: "accent" };
  if (type === "object") return { label: "object", tone: "neutral" };
  return { label: type, tone: "neutral" };
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

  const matchesSearch =
    !searchTerm ||
    keyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(value).toLowerCase().includes(searchTerm.toLowerCase());

  if (!matchesSearch && !isObject) {
    return null;
  }

  return (
    <div className="text-[12px] select-none">
      <div
        draggable
        onDragStart={handleDragStart}
        className="group flex items-center justify-between gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-hover focus-within:bg-hover"
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <GripVertical className="h-3 w-3 shrink-0 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100" />

          {isObject ? (
            <button
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              aria-label={isOpen ? `Contraer ${keyName}` : `Expandir ${keyName}`}
              className="shrink-0 rounded p-0.5 text-fg-subtle transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform duration-150",
                  !isOpen && "-rotate-90"
                )}
              />
            </button>
          ) : (
            <span className="w-3.5 shrink-0" />
          )}

          <span className="truncate font-mono text-fg">{keyName}:</span>

          <Badge tone={badge.tone} className="h-5 shrink-0 px-1.5 text-[9.5px]">
            {badge.label}
          </Badge>

          {!isObject && (
            <span className="max-w-[160px] truncate font-mono text-fg-muted">
              {typeof value === "string" ? `"${value}"` : String(value)}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
          {onInsertToken && (
            <button
              type="button"
              onClick={() => onInsertToken(token)}
              title="Insertar variable en el campo activo"
              aria-label={`Insertar ${token}`}
              className="rounded p-1 text-fg-muted transition-colors hover:bg-card hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <Plus className="h-3 w-3" />
            </button>
          )}

          <button
            type="button"
            onClick={handleCopy}
            title={`Copiar variable ${token}`}
            aria-label={`Copiar ${token}`}
            className={cn(
              "rounded p-1 text-fg-muted transition-colors hover:bg-card hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
              copied && "rpa-flash text-success-text"
            )}
          >
            {copied ? (
              <Check className="h-3 w-3 text-success-text" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </button>
        </div>
      </div>

      {isObject && isOpen && (
        <div className="mt-0.5 ml-2 space-y-0.5 border-l border-line pl-3">
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

const VIEW_OPTIONS: Array<{
  value: DataViewMode;
  label: string;
  icon: React.ReactNode;
}> = [
  { value: "schema", label: "Schema", icon: <Braces className="h-3.5 w-3.5" /> },
  { value: "table", label: "Table", icon: <TableIcon className="h-3.5 w-3.5" /> },
  { value: "json", label: "JSON", icon: <Code2 className="h-3.5 w-3.5" /> },
];

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
  let tableData: unknown[] | null = null;
  if (data) {
    if (Array.isArray(data)) {
      tableData = data;
    } else if (typeof data === "object") {
      const entries = Object.entries(data);
      for (const [, val] of entries) {
        if (Array.isArray(val) && val.length > 0 && typeof val[0] === "object") {
          tableData = val;
          break;
        }
      }
      if (!tableData) {
        tableData = [data];
      }
    } else {
      tableData = [{ valor: data }];
    }
  }

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 1500);
  };

  if (data === undefined || data === null) {
    return (
      <div className={cn("p-4 text-center text-xs text-fg-subtle", className)}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={cn("flex h-full flex-col overflow-hidden", className)}>
      {/* Barra de controles */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-2.5 py-2">
        <div
          role="tablist"
          aria-label="Formato de los datos"
          className="inline-flex items-center gap-0.5 rounded-control border border-line bg-panel p-0.5"
        >
          {VIEW_OPTIONS.map((option) => {
            const active = viewMode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setViewMode(option.value)}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-[6px] px-2 text-[11.5px] font-medium",
                  "transition-[background-color,color,box-shadow] duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                  active
                    ? "bg-raised text-fg shadow-[var(--shadow-card)]"
                    : "text-fg-muted hover:bg-hover hover:text-fg"
                )}
              >
                {option.icon}
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>

        <div className="relative min-w-[110px] flex-1 md:max-w-[210px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filtrar campos…"
            aria-label="Filtrar campos"
            className="h-8 w-full rounded-control border border-line bg-input pl-8 pr-7 text-[11.5px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              aria-label="Limpiar filtro"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-fg-subtle hover:text-fg"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={handleCopyJson}
          title="Copiar JSON completo"
          aria-label="Copiar JSON completo"
          className={cn(
            "ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-control border border-line bg-card text-fg-muted transition-colors hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/20",
            copiedAll && "rpa-flash text-success-text"
          )}
        >
          {copiedAll ? (
            <Check className="h-3.5 w-3.5 text-success-text" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Cuerpo del visualizador */}
      <div className="flex-1 overflow-auto p-2">
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

        {viewMode === "table" && tableData && (
          <div className="overflow-x-auto rounded-control border border-line">
            <table className="w-full text-left text-[12px] text-fg">
              <thead className="border-b border-line bg-card font-mono text-[10px] uppercase tracking-wide text-fg-subtle">
                <tr>
                  <th className="w-9 p-2 text-fg-subtle/70">#</th>
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
                        className="cursor-grab p-2 transition-colors hover:bg-hover active:cursor-grabbing"
                        title={`Arrastrar columna: ${colToken}`}
                      >
                        <div className="flex items-center gap-1">
                          <GripVertical className="h-3 w-3 text-fg-subtle" />
                          <span>{col}</span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-line font-mono text-[11px]">
                {tableData.map((row, idx) => (
                  <tr key={idx} className="transition-colors hover:bg-hover">
                    <td className="p-2 text-fg-subtle/70">{idx + 1}</td>
                    {Object.values(row as Record<string, unknown>).map(
                      (cell: unknown, cIdx) => (
                        <td key={cIdx} className="max-w-[200px] truncate p-2">
                          {typeof cell === "object" ? JSON.stringify(cell) : String(cell ?? "")}
                        </td>
                      )
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {viewMode === "json" && (
          <JsonView
            data={data}
            className="rounded-control border border-line bg-panel"
            ariaLabel="Salida JSON"
          />
        )}
      </div>
    </div>
  );
}
