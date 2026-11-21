"use client";

import React from "react";
import { Plus, Trash2 } from "lucide-react";
import type { KeyValuePair } from "@rpa/dsl";
import { VariablePicker } from "../../variable-picker";

interface KeyValueListProps {
  items: KeyValuePair[];
  onChange: (next: KeyValuePair[]) => void;
  disabled?: boolean;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  addLabel?: string;
  emptyText?: string;
  showVariablePicker?: boolean;
}

export function KeyValueList({
  items,
  onChange,
  disabled = false,
  keyPlaceholder = "Clave",
  valuePlaceholder = "Valor",
  addLabel = "Añadir fila",
  emptyText = "Sin elementos configurados.",
  showVariablePicker = true,
}: KeyValueListProps) {
  const handleUpdate = (index: number, patch: Partial<KeyValuePair>) => {
    const next = items.map((item, idx) => (idx === index ? { ...item, ...patch } : item));
    onChange(next);
  };

  const handleRemove = (index: number) => {
    onChange(items.filter((_, idx) => idx !== index));
  };

  const handleAdd = () => {
    onChange([...items, { key: "", value: "", enabled: true }]);
  };

  return (
    <div className="space-y-2">
      {items.length === 0 ? (
        <p className="rounded-control border border-dashed border-line px-3 py-2 text-[11px] text-fg-subtle">
          {emptyText}
        </p>
      ) : (
        <div className="space-y-1.5">
          {items.map((item, idx) => {
            const isEnabled = item.enabled !== false;
            return (
              <div key={idx} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={isEnabled}
                  disabled={disabled}
                  aria-label={`Activar fila ${idx + 1}`}
                  onChange={(e) => handleUpdate(idx, { enabled: e.target.checked })}
                  className="h-3.5 w-3.5 shrink-0 accent-accent"
                />
                <input
                  type="text"
                  value={item.key}
                  disabled={disabled}
                  onChange={(e) => handleUpdate(idx, { key: e.target.value })}
                  placeholder={keyPlaceholder}
                  className="h-8 min-w-0 flex-1 rounded-control border border-line bg-input px-2.5 font-mono text-[11.5px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none disabled:opacity-50"
                />
                <div className="flex min-w-0 flex-[1.2] items-center gap-1">
                  <input
                    type="text"
                    value={item.value}
                    disabled={disabled}
                    onChange={(e) => handleUpdate(idx, { value: e.target.value })}
                    placeholder={valuePlaceholder}
                    className="h-8 min-w-0 flex-1 rounded-control border border-line bg-input px-2.5 font-mono text-[11.5px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none disabled:opacity-50"
                  />
                  {showVariablePicker && !disabled && (
                    <VariablePicker
                      title="Insertar variable en valor"
                      onSelect={(token) =>
                        handleUpdate(idx, { value: `${item.value || ""}${token}` })
                      }
                    />
                  )}
                </div>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => handleRemove(idx)}
                    aria-label={`Eliminar fila ${idx + 1}`}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-control border border-transparent text-fg-subtle hover:border-line hover:bg-hover hover:text-danger-text"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!disabled && (
        <button
          type="button"
          onClick={handleAdd}
          className="inline-flex items-center gap-1.5 rounded-control border border-line bg-card px-2.5 py-1 text-[11px] font-medium text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
        >
          <Plus className="h-3 w-3" />
          <span>{addLabel}</span>
        </button>
      )}
    </div>
  );
}
