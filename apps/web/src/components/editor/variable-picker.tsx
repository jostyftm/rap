"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Braces,
  ChevronRight,
  Layers,
  Key,
  Webhook,
  FileText,
  Search,
} from "lucide-react";
import { useRecipeStore } from "@/stores/use-recipe-store";
import { cn } from "@/lib/utils";

interface VariablePickerProps {
  onSelect: (token: string) => void;
  title?: string;
  className?: string;
}

interface PickerItem {
  label: string;
  description?: string;
  token: string;
  preview?: string;
}

interface PickerGroup {
  id: string;
  label: string;
  icon: React.ReactNode;
  items: PickerItem[];
}

export function VariablePicker({
  onSelect,
  title = "Insertar variable o salida",
  className = "",
}: VariablePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const definition = useRecipeStore((s) => s.definition);
  const nodeOutputs = useRecipeStore((s) => s.nodeOutputs);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const globalVariables = definition?.variables || [];
  const secrets = definition?.secrets || [];
  const nodes = Object.values(definition?.nodes || {});
  const webhookNode = nodes.find((n) => n.type === "webhook");
  const webhookVar = (webhookNode as { params?: { outputVariable?: string } })?.params
    ?.outputVariable || "webhook";

  const groups: PickerGroup[] = [];

  if (nodes.length > 0) {
    groups.push({
      id: "steps",
      label: "Salidas de pasos",
      icon: <Layers className="h-3 w-3" />,
      items: nodes.map((node) => {
        const outputVal = nodeOutputs[node.id];
        return {
          label: `[${node.type}] ${node.id}`,
          description: node.description || "Sin descripción",
          token: `{{steps.${node.id}.output}}`,
          preview:
            outputVal !== undefined
              ? typeof outputVal === "object"
                ? JSON.stringify(outputVal)
                : String(outputVal)
              : undefined,
        };
      }),
    });
  }

  groups.push({
    id: "webhook",
    label: "Payload de webhook",
    icon: <Webhook className="h-3 w-3" />,
    items: [
      { label: `${webhookVar}.body`, description: "Cuerpo HTTP (JSON)", token: `{{${webhookVar}.body}}` },
      { label: `${webhookVar}.query`, description: "Parámetros query string", token: `{{${webhookVar}.query}}` },
      { label: `${webhookVar}.headers`, description: "Cabeceras HTTP", token: `{{${webhookVar}.headers}}` },
    ],
  });

  if (globalVariables.length > 0) {
    groups.push({
      id: "globals",
      label: "Variables globales",
      icon: <FileText className="h-3 w-3" />,
      items: globalVariables.map((v) => ({
        label: v.name,
        description: `(${v.type})`,
        token: `{{variables.${v.name}}}`,
      })),
    });
  }

  if (secrets.length > 0) {
    groups.push({
      id: "secrets",
      label: "Secretos guardados",
      icon: <Key className="h-3 w-3" />,
      items: secrets.map((sec) => ({
        label: sec,
        description: "Secreto",
        token: `{{secret.${sec}}}`,
      })),
    });
  }

  const normalizedQuery = query.trim().toLowerCase();
  const filteredGroups = groups
    .map((group) => ({
      ...group,
      items: normalizedQuery
        ? group.items.filter(
            (item) =>
              item.label.toLowerCase().includes(normalizedQuery) ||
              item.token.toLowerCase().includes(normalizedQuery) ||
              (item.description || "").toLowerCase().includes(normalizedQuery)
          )
        : group.items,
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className={cn("relative inline-block", className)} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        title={title}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className={cn(
          "inline-flex h-6 items-center gap-1 rounded-control border px-1.5 font-mono text-[11px]",
          "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
          isOpen
            ? "border-accent-line bg-accent-soft text-accent-text"
            : "border-line bg-card text-fg-muted hover:bg-hover hover:text-fg"
        )}
      >
        <Braces className="h-3.5 w-3.5" />
        <span className="text-[10px]">{"{x}"}</span>
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Selector de variables"
          className="absolute right-0 top-full z-50 mt-1 max-h-80 w-72 space-y-2 overflow-y-auto rounded-card border border-line bg-raised p-2 text-xs shadow-[var(--shadow-modal)]"
        >
          <div className="sticky -top-2 -mx-2 -mt-2 border-b border-line bg-raised px-2 pb-2 pt-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-fg-subtle" />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar variable…"
                aria-label="Buscar variable"
                className="h-7 w-full rounded-control border border-line bg-input pl-7 pr-2 text-[11px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
            </div>
          </div>

          {filteredGroups.length === 0 && (
            <p className="px-1.5 py-3 text-center text-[11px] text-fg-subtle">
              Sin coincidencias para “{query}”.
            </p>
          )}

          {filteredGroups.map((group) => (
            <div key={group.id}>
              <span className="mb-1 flex items-center gap-1 px-1 font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
                {group.icon}
                <span>{group.label}</span>
              </span>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <button
                    key={item.token}
                    type="button"
                    onClick={() => {
                      onSelect(item.token);
                      setIsOpen(false);
                    }}
                    className="group flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 font-mono text-[11px] text-fg">
                        <span className="truncate">{item.label}</span>
                      </span>
                      {item.description && (
                        <span className="block truncate text-[10px] text-fg-subtle">
                          {item.description}
                        </span>
                      )}
                      {item.preview !== undefined && (
                        <span className="mt-0.5 block truncate font-mono text-[9px] text-success-text">
                          {item.preview}
                        </span>
                      )}
                    </span>
                    <ChevronRight className="h-3 w-3 shrink-0 text-fg-subtle transition-colors group-hover:text-fg" />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
