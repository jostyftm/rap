"use client";

import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Globe,
} from "lucide-react";
import { useRecipeStore } from "@/stores/use-recipe-store";
import { useLiveStore } from "@/stores/use-live-store";
import { ThreePanelLayout } from "./three-panel-layout";
import { InputDataPanel } from "./input-data-panel";
import { NodeConfigPanel } from "./node-config-panel";
import { OutputLivePanel } from "./output-live-panel";
import { testRecipeNode } from "@/lib/node-tester";
import { nodeRegistry } from "../nodes";
import { useWebhookTestStore } from "@/stores/use-webhook-test-store";
import { Badge, IconButton } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import type { RecipeNode } from "@rpa/dsl";

export function NodeDetailModal() {
  const activeDetailNodeId = useRecipeStore((s) => s.activeDetailNodeId);
  const closeNodeDetail = useRecipeStore((s) => s.closeNodeDetail);
  const openNodeDetail = useRecipeStore((s) => s.openNodeDetail);
  const definition = useRecipeStore((s) => s.definition);
  const setNodeOutput = useRecipeStore((s) => s.setNodeOutput);
  const setNodeExecState = useRecipeStore((s) => s.setNodeExecState);

  const [isExecuting, setIsExecuting] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const nodes = useMemo(() => definition.nodes || {}, [definition.nodes]);

  const currentNode: RecipeNode | undefined = activeDetailNodeId
    ? nodes[activeDetailNodeId]
    : undefined;

  // Secuencia lineal de los nodos para cálculo de índices y vecinos
  const orderedNodes = useMemo(() => {
    const list: RecipeNode[] = [];
    const visited = new Set<string>();

    let currId: string | undefined = definition.entry;
    while (currId && nodes[currId] && !visited.has(currId)) {
      visited.add(currId);
      list.push(nodes[currId]);
      currId = nodes[currId].next;
    }

    for (const [id, node] of Object.entries(nodes)) {
      if (!visited.has(id)) {
        visited.add(id);
        list.push(node);
      }
    }
    return list;
  }, [definition.entry, nodes]);

  const currentIndex = orderedNodes.findIndex((n) => n.id === activeDetailNodeId);
  const totalNodes = orderedNodes.length;

  // Nodo previo y siguiente
  const prevNode = currentIndex > 0 ? orderedNodes[currentIndex - 1] : undefined;
  const nextNode =
    currentIndex !== -1 && currentIndex < orderedNodes.length - 1
      ? orderedNodes[currentIndex + 1]
      : undefined;

  // Ejecución individual del nodo activo
  const handleExecuteCurrentNode = useCallback(async () => {
    if (!currentNode) return;
    setIsExecuting(true);
    setNodeExecState(currentNode.id, "running");
    try {
      const result = await testRecipeNode(currentNode);
      if (result.ok) {
        setNodeExecState(currentNode.id, "success", result.durationMs);
        if (result.output !== undefined) {
          setNodeOutput(currentNode.id, result.output);
        }
      } else {
        setNodeExecState(currentNode.id, "error", result.durationMs, result.error);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setNodeExecState(currentNode.id, "error", undefined, message);
    } finally {
      setIsExecuting(false);
    }
  }, [currentNode, setNodeExecState, setNodeOutput]);

  // Atajos de teclado del modal (Escape, Alt+Left, Alt+Right, Ctrl+Enter)
  useEffect(() => {
    if (!activeDetailNodeId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeNodeDetail();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleExecuteCurrentNode();
        return;
      }

      if (e.altKey && e.key === "ArrowLeft") {
        e.preventDefault();
        if (prevNode) openNodeDetail(prevNode.id);
        return;
      }

      if (e.altKey && e.key === "ArrowRight") {
        e.preventDefault();
        if (nextNode) openNodeDetail(nextNode.id);
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    activeDetailNodeId,
    closeNodeDetail,
    handleExecuteCurrentNode,
    prevNode,
    nextNode,
    openNodeDetail,
  ]);

  // Focus trap, bloqueo de scroll y devolución del foco al cerrar
  const isOpen = Boolean(activeDetailNodeId && currentNode);
  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => dialogRef.current?.focus(), 0);

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleTab);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleTab);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus?.();
    };
  }, [isOpen]);

  // Asegurar que el estado live esté abierto cuando se abre el modal
  useEffect(() => {
    if (activeDetailNodeId && !useLiveStore.getState().isOpen) {
      useLiveStore.getState().open();
    }
  }, [activeDetailNodeId]);

  // Al cambiar de nodo o cerrar el modal, limpiar cualquier escucha activa de webhook
  const recipeId = useRecipeStore((s) => s.recipeId);
  useEffect(() => {
    return () => {
      if (currentNode?.type === "webhook" && recipeId) {
        useWebhookTestStore.getState().stopListening(recipeId, currentNode.id);
      }
    };
  }, [currentNode?.id, currentNode?.type, recipeId]);

  if (!activeDetailNodeId || !currentNode) {
    return null;
  }

  const nodeDef = nodeRegistry.get(currentNode.type);
  const Icon = nodeDef?.icon || Globe;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-3 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeNodeDetail();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="node-detail-dialog-title"
        tabIndex={-1}
        className={cn(
          "relative flex h-[92vh] w-[96vw] max-w-[1720px] flex-col overflow-hidden rounded-shell",
          "border border-line bg-raised text-fg shadow-[var(--shadow-modal)] outline-none",
          "transition-colors"
        )}
      >
        <h2 id="node-detail-dialog-title" className="sr-only">
          Configuración del nodo {currentNode.description || currentNode.type}
        </h2>

        {/* Barra superior */}
        <div className="flex h-12 shrink-0 items-center justify-between gap-3 rounded-t-shell border-b border-line bg-panel px-4">
          <div className="flex min-w-0 items-center gap-2 text-[11.5px]">
            <span className="hidden text-fg-subtle sm:inline">Flujo</span>
            <span className="hidden text-fg-subtle/60 sm:inline">/</span>
            <div className="flex min-w-0 items-center gap-1.5 font-medium text-fg">
              <Icon className="h-3.5 w-3.5 shrink-0 text-accent-text" />
              <span className="max-w-[220px] truncate">
                {currentNode.description || currentNode.type}
              </span>
            </div>
            {currentIndex !== -1 && (
              <Badge tone="neutral" className="ml-1 hidden h-6 sm:inline-flex">
                Paso {currentIndex + 1} de {totalNodes}
              </Badge>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            <IconButton
              label={prevNode ? `Nodo previo: ${prevNode.description || prevNode.type} (Alt + ←)` : "No hay nodo previo"}
              onClick={() => prevNode && openNodeDetail(prevNode.id)}
              disabled={!prevNode}
            >
              <ChevronLeft className="h-4 w-4" />
            </IconButton>
            <IconButton
              label={nextNode ? `Nodo siguiente: ${nextNode.description || nextNode.type} (Alt + →)` : "No hay nodo siguiente"}
              onClick={() => nextNode && openNodeDetail(nextNode.id)}
              disabled={!nextNode}
            >
              <ChevronRight className="h-4 w-4" />
            </IconButton>
            <span className="mx-1 h-4 w-px bg-line" />
            <IconButton label="Cerrar vista (Esc)" onClick={closeNodeDetail}>
              <X className="h-4 w-4" />
            </IconButton>
          </div>
        </div>

        {/* Cuerpo: tres paneles */}
        <div className="flex flex-1 overflow-hidden">
          <ThreePanelLayout
            left={<InputDataPanel currentNodeId={currentNode.id} />}
            center={
              <NodeConfigPanel
                node={currentNode}
                onExecuteNode={handleExecuteCurrentNode}
                isExecuting={isExecuting}
              />
            }
            right={
              <OutputLivePanel
                node={currentNode}
                onExecuteNode={handleExecuteCurrentNode}
                isExecuting={isExecuting}
              />
            }
          />
        </div>
      </div>
    </div>
  );
}
