"use client";

import React, { useState, useMemo } from "react";
import {
  Layers,
  Play,
  Clock,
  Loader2,
  Copy,
  Check,
  ChevronDown,
  Webhook as WebhookIcon,
  Sparkles,
} from "lucide-react";
import { Badge, Button } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { useRecipeStore } from "@/stores/use-recipe-store";
import { useWebhookTestStore } from "@/stores/use-webhook-test-store";
import { DataViewer } from "./data-viewer";
import { testRecipeNode } from "@/lib/node-tester";
import type { RecipeNode, RecipeDsl } from "@rpa/dsl";

interface InputDataPanelProps {
  currentNodeId: string;
  onInsertToken?: (token: string) => void;
  className?: string;
}

/**
 * Resuelve todos los nodos previos/ancestros que preceden a currentNodeId en el grafo de la receta.
 * Sigue el flujo hacia atrás (edges + punteros de branching) y los ordena topológicamente
 * desde la entrada (entry point) hasta el predecesor inmediato.
 */
function resolveAncestorNodes(definition: RecipeDsl, currentNodeId: string): RecipeNode[] {
  const nodes = definition.nodes || {};
  const edges = definition.edges || [];

  if (!nodes[currentNodeId]) return [];

  // 1. Grafo de adyacencia directa e inversa
  const incomingMap = new Map<string, Set<string>>();
  const outgoingMap = new Map<string, Set<string>>();

  for (const id of Object.keys(nodes)) {
    incomingMap.set(id, new Set());
    outgoingMap.set(id, new Set());
  }

  // Registrar aristas explícitas de edges
  for (const edge of edges) {
    if (nodes[edge.from] && nodes[edge.to]) {
      incomingMap.get(edge.to)?.add(edge.from);
      outgoingMap.get(edge.from)?.add(edge.to);
    }
  }

  // Registrar conexiones implícitas mediante propiedades de punteros de los nodos
  for (const [id, node] of Object.entries(nodes)) {
    const addConn = (targetId?: string) => {
      if (targetId && nodes[targetId]) {
        incomingMap.get(targetId)?.add(id);
        outgoingMap.get(id)?.add(targetId);
      }
    };

    if (node.next) addConn(node.next);
    if (node.type === "condition") {
      addConn(node.params?.thenNodeId);
      addConn(node.params?.elseNodeId);
    } else if (node.type === "loop") {
      addConn(node.params?.bodyEntryNodeId);
    } else if (node.type === "tryCatch") {
      addConn(node.params?.tryEntryNodeId);
      addConn(node.params?.catchEntryNodeId);
      addConn(node.params?.finallyEntryNodeId);
    }
  }

  // 2. Travesía hacia atrás (BFS) desde currentNodeId para encontrar TODOS los ancestros
  const ancestorIds = new Set<string>();
  const queue: string[] = [];
  const visited = new Set<string>([currentNodeId]);

  const directParents = incomingMap.get(currentNodeId) || new Set();
  for (const parentId of directParents) {
    ancestorIds.add(parentId);
    visited.add(parentId);
    queue.push(parentId);
  }

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const parents = incomingMap.get(curr) || new Set();
    for (const parentId of parents) {
      if (!visited.has(parentId)) {
        visited.add(parentId);
        ancestorIds.add(parentId);
        queue.push(parentId);
      }
    }
  }

  // 3. Fallback: si no se encontraron ancestros por aristas y el nodo no es el entry,
  // considerar nodos anteriores según el orden del arreglo
  if (ancestorIds.size === 0 && currentNodeId !== definition.entry) {
    const allList = Object.values(nodes);
    const currIndex = allList.findIndex((n) => n.id === currentNodeId);
    if (currIndex > 0) {
      for (let i = 0; i < currIndex; i++) {
        ancestorIds.add(allList[i].id);
      }
    } else {
      for (const n of allList) {
        if (n.id !== currentNodeId && (n.type === "webhook" || n.isInitializer)) {
          ancestorIds.add(n.id);
        }
      }
    }
  }

  // Asegurar que si hay un nodo webhook o initializer en la receta y no es el actual,
  // esté siempre disponible para consultar sus variables en pasos posteriores
  for (const n of Object.values(nodes)) {
    if (n.id !== currentNodeId && (n.type === "webhook" || n.isInitializer || n.id === definition.entry)) {
      ancestorIds.add(n.id);
    }
  }

  // 4. Ordenar los ancestros topológicamente desde definition.entry
  const orderedAncestors: RecipeNode[] = [];
  const forwardVisited = new Set<string>();
  const forwardQueue: string[] = [];

  if (definition.entry && nodes[definition.entry]) {
    forwardQueue.push(definition.entry);
    forwardVisited.add(definition.entry);
  }

  while (forwardQueue.length > 0) {
    const currId = forwardQueue.shift()!;
    if (currId !== currentNodeId && ancestorIds.has(currId) && !orderedAncestors.some((n) => n.id === currId)) {
      orderedAncestors.push(nodes[currId]);
    }
    const children = outgoingMap.get(currId) || new Set();
    for (const childId of children) {
      if (!forwardVisited.has(childId)) {
        forwardVisited.add(childId);
        forwardQueue.push(childId);
      }
    }
  }

  // Añadir cualquier ancestro restante que no fuera alcanzado desde entry
  for (const ancestorId of ancestorIds) {
    if (!orderedAncestors.some((n) => n.id === ancestorId) && nodes[ancestorId]) {
      orderedAncestors.push(nodes[ancestorId]);
    }
  }

  return orderedAncestors;
}

export function InputDataPanel({
  currentNodeId,
  onInsertToken,
  className = "",
}: InputDataPanelProps) {
  const definition = useRecipeStore((s) => s.definition);
  const nodeOutputs = useRecipeStore((s) => s.nodeOutputs);
  const setNodeOutput = useRecipeStore((s) => s.setNodeOutput);
  const setNodeExecState = useRecipeStore((s) => s.setNodeExecState);
  const webhookStore = useWebhookTestStore();

  const [isRunningPrevious, setIsRunningPrevious] = useState(false);
  const [copiedWebhookShortcut, setCopiedWebhookShortcut] = useState(false);

  // 1. Calcular todos los nodos previos / ancestros al nodo actual en el flujo
  const precedingNodes = useMemo(() => {
    return resolveAncestorNodes(definition, currentNodeId);
  }, [definition, currentNodeId]);

  // Helper para obtener datos de un nodo (incluyendo fallback a webhook test store)
  const getNodeData = useMemo(() => {
    return (nodeId: string): unknown => {
      if (nodeOutputs[nodeId] !== undefined) {
        return nodeOutputs[nodeId];
      }
      const webhookEntry = webhookStore.getEntry(nodeId);
      if (webhookEntry.payload) {
        return webhookEntry.payload;
      }
      return undefined;
    };
  }, [nodeOutputs, webhookStore]);

  const [selectedPrevId, setSelectedPrevId] = useState<string>(() => {
    return precedingNodes.length > 1 ? "all" : precedingNodes[0]?.id || "all";
  });

  // Asegurar que selectedPrevId sea válido si cambian los nodos previos
  const activeNodeId =
    selectedPrevId === "all" || precedingNodes.some((n) => n.id === selectedPrevId)
      ? selectedPrevId
      : precedingNodes.length > 1
      ? "all"
      : precedingNodes[0]?.id || "all";

  // Obtener los datos a mostrar
  const displayData = useMemo(() => {
    if (activeNodeId === "all") {
      const combined: Record<string, unknown> = {};
      for (const node of precedingNodes) {
        const out = getNodeData(node.id);
        if (out !== undefined) {
          combined[node.id] = out;
        }
      }
      return Object.keys(combined).length > 0 ? combined : null;
    }
    return getNodeData(activeNodeId);
  }, [activeNodeId, precedingNodes, getNodeData]);

  const activePrevNode =
    activeNodeId !== "all"
      ? definition.nodes[activeNodeId]
      : precedingNodes.find((n) => getNodeData(n.id) !== undefined) || precedingNodes[0];

  const isExecuted =
    activeNodeId === "all"
      ? precedingNodes.some((n) => getNodeData(n.id) !== undefined)
      : getNodeData(activeNodeId) !== undefined;

  const handleRunPrevious = async () => {
    if (!activePrevNode) return;
    setIsRunningPrevious(true);
    setNodeExecState(activePrevNode.id, "running");
    try {
      const result = await testRecipeNode(activePrevNode);
      if (result.ok) {
        setNodeExecState(activePrevNode.id, "success", result.durationMs);
        if (result.output !== undefined) {
          setNodeOutput(activePrevNode.id, result.output);
        }
      } else {
        setNodeExecState(activePrevNode.id, "error", result.durationMs);
      }
    } catch {
      setNodeExecState(activePrevNode.id, "error");
    } finally {
      setIsRunningPrevious(false);
    }
  };

  const copyWebhookShortcut = (token: string) => {
    navigator.clipboard.writeText(token);
    setCopiedWebhookShortcut(true);
    setTimeout(() => setCopiedWebhookShortcut(false), 1500);
  };

  return (
    <div className={cn("flex h-full flex-col bg-panel transition-colors", className)}>
      {/* Encabezado del Panel de Entrada */}
      <div className="shrink-0 border-b border-line px-3.5 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5 text-fg">
            <Layers className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
            <span className="text-[12.5px] font-semibold">Entrada</span>
            <Badge tone="neutral" className="h-5 px-1.5 text-[9.5px]">
              {precedingNodes.length}
            </Badge>
          </div>
          <span className="text-[10.5px] text-fg-subtle">
            {precedingNodes.length === 1 ? "nodo previo" : "nodos previos"}
          </span>
        </div>

        {precedingNodes.length > 0 && (
          <div className="mt-2.5 space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <select
                  value={activeNodeId}
                  onChange={(e) => setSelectedPrevId(e.target.value)}
                  aria-label="Nodo de origen de los datos"
                  className="h-9 w-full cursor-pointer appearance-none truncate rounded-control border border-line bg-input pl-3 pr-8 text-[11.5px] text-fg transition-colors hover:border-line-strong focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15"
                >
                  {precedingNodes.length > 1 && (
                    <option value="all">
                      ★ Todas las variables ({precedingNodes.length} pasos)
                    </option>
                  )}
                  {precedingNodes.map((n, idx) => {
                    const hasOut = getNodeData(n.id) !== undefined;
                    const label = n.description || n.type;
                    return (
                      <option key={n.id} value={n.id}>
                        {`Paso ${idx + 1}: ${label} (${n.id}) ${hasOut ? "✓" : "○"}`}
                      </option>
                    );
                  })}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" />
              </div>

              {activeNodeId !== "all" && (
                <div className="shrink-0">
                  {isExecuted ? (
                    <Badge tone="success" dot className="h-7">
                      Con datos
                    </Badge>
                  ) : (
                    <Badge tone="neutral" dot className="h-7">
                      Sin ejecutar
                    </Badge>
                  )}
                </div>
              )}
            </div>

            {/* Chips de selección rápida */}
            {precedingNodes.length > 1 && (
              <div className="scrollbar-thin flex items-center gap-1.5 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => setSelectedPrevId("all")}
                  className={cn(
                    "shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[10.5px] font-medium transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                    activeNodeId === "all"
                      ? "border-accent-line bg-accent-soft text-accent-text"
                      : "border-line bg-card text-fg-muted hover:bg-hover hover:text-fg"
                  )}
                >
                  Todas
                </button>
                {precedingNodes.map((n, idx) => {
                  const hasOut = getNodeData(n.id) !== undefined;
                  const isSelected = activeNodeId === n.id;
                  const isWebhook = n.type === "webhook";
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => setSelectedPrevId(n.id)}
                      title={`${n.description || n.type} (${n.id})`}
                      className={cn(
                        "flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-[10.5px] transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                        isSelected
                          ? "border-accent-line bg-accent-soft font-medium text-accent-text"
                          : "border-line bg-card text-fg-muted hover:bg-hover hover:text-fg"
                      )}
                    >
                      {isWebhook && <WebhookIcon className="h-2.5 w-2.5 shrink-0 text-info-text" />}
                      <span>
                        {idx + 1}. {n.description || n.type}
                      </span>
                      {hasOut && <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Banner de ayuda contextual para nodos Webhook */}
      {activePrevNode?.type === "webhook" && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-info/20 bg-info-soft px-3.5 py-2 text-[11px] text-info-text">
          <div className="flex min-w-0 items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              Atajo global: <code className="font-mono font-medium">{"{{webhook.body}}"}</code>
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() => copyWebhookShortcut("{{webhook.body}}")}
              title="Copiar token {{webhook.body}}"
              aria-label="Copiar token webhook.body"
              className="rounded p-1 transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              {copiedWebhookShortcut ? (
                <Check className="h-3 w-3 text-success-text" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </button>
            {onInsertToken && (
              <button
                type="button"
                onClick={() => onInsertToken("{{webhook.body}}")}
                className="rounded-full bg-info px-2 py-0.5 text-[10px] font-medium text-white transition-opacity hover:opacity-90"
              >
                Insertar
              </button>
            )}
          </div>
        </div>
      )}

      {/* Contenido principal */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {precedingNodes.length === 0 ? (
          <div className="m-auto max-w-[260px] space-y-2 px-6 text-center">
            <div className="mx-auto grid h-10 w-10 place-items-center rounded-full border border-line bg-card text-fg-subtle">
              <Layers className="h-5 w-5" />
            </div>
            <p className="text-[12px] font-medium text-fg">Este es el nodo inicial del flujo.</p>
            <p className="text-[11.5px] leading-relaxed text-fg-subtle">
              No recibe entradas de nodos anteriores.
            </p>
          </div>
        ) : !isExecuted ? (
          <div className="m-auto flex max-w-[280px] flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="grid h-10 w-10 place-items-center rounded-full border border-line bg-card text-fg-subtle">
              <Clock className="h-5 w-5" />
            </div>

            <div className="space-y-1">
              <h4 className="text-[12px] font-medium text-fg">Sin datos de entrada aún</h4>
              <p className="text-[11.5px] leading-relaxed text-fg-muted">
                {activeNodeId === "all" ? (
                  <span>
                    Ninguno de los nodos previos ha generado datos en esta sesión. Ejecuta un
                    nodo previo para inspeccionar variables.
                  </span>
                ) : (
                  <span>
                    El nodo previo{" "}
                    <span className="font-mono font-medium text-fg">
                      {activePrevNode?.id || "seleccionado"}
                    </span>{" "}
                    no se ha ejecutado en esta sesión. Ejecútalo para ver su esquema y arrastrar
                    variables.
                  </span>
                )}
              </p>
            </div>

            {activePrevNode && (
              <Button
                variant="secondary"
                onClick={handleRunPrevious}
                disabled={isRunningPrevious}
                className="w-full"
              >
                {isRunningPrevious ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Ejecutando nodo previo…</span>
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 fill-current text-accent-text" />
                    <span>Ejecutar {activePrevNode.id}</span>
                  </>
                )}
              </Button>
            )}
          </div>
        ) : (
          <DataViewer
            key={`${activeNodeId}-${isExecuted}`}
            data={displayData}
            className="rpa-tab-panel"
            baseTokenPrefix={
              activeNodeId === "all" ? "{{steps" : `{{steps.${activeNodeId}.output`
            }
            onInsertToken={onInsertToken}
          />
        )}
      </div>
    </div>
  );
}
