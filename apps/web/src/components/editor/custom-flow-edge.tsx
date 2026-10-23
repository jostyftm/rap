"use client";

import React from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import { X } from "lucide-react";
import { useRecipeStore } from "@/stores/use-recipe-store";

export function CustomFlowEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  label,
  selected,
  sourceHandleId,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const removeEdge = useRecipeStore((s) => s.removeEdge);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    removeEdge(
      source,
      target,
      sourceHandleId && sourceHandleId !== "next" ? sourceHandleId : undefined
    );
  };

  const isElse = label === "false";
  const isThen = label === "true";
  const isTry = label === "try";
  const isCatch = label === "catch";
  const isFinally = label === "finally";

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: selected
            ? "#fbbf24"
            : isElse
            ? "#f43f5e"
            : isThen
            ? "#10b981"
            : isTry
            ? "#f59e0b"
            : isCatch
            ? "#f43f5e"
            : isFinally
            ? "#8b5cf6"
            : "#52525b",
          strokeWidth: selected ? 2.5 : 1.75,
          transition: "stroke 0.15s ease, stroke-width 0.15s ease",
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: "all",
          }}
          className="nodrag nopan group flex items-center space-x-1 select-none"
        >
          {label && (
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                isElse || isCatch
                  ? "bg-rose-950/90 text-rose-300 border-rose-800/80"
                  : isThen
                  ? "bg-emerald-950/90 text-emerald-300 border-emerald-800/80"
                  : isTry
                  ? "bg-amber-950/90 text-amber-300 border-amber-800/80"
                  : isFinally
                  ? "bg-violet-950/90 text-violet-300 border-violet-800/80"
                  : "bg-zinc-900/90 text-zinc-300 border-zinc-800"
              }`}
            >
              {isElse ? "else" : isThen ? "then" : label}
            </span>
          )}

          {/* Botón interactivo de eliminación de arista */}
          <button
            type="button"
            onClick={handleDelete}
            title="Eliminar conexión (arista)"
            className={`w-4 h-4 rounded-full flex items-center justify-center transition-all bg-zinc-900 hover:bg-rose-950 text-zinc-400 hover:text-rose-400 border border-zinc-800 hover:border-rose-500/60 shadow-sm ${
              selected
                ? "opacity-100 scale-100"
                : "opacity-0 group-hover:opacity-100 scale-90 hover:scale-100"
            }`}
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
