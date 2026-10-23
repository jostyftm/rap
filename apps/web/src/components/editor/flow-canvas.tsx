"use client";

import React, { useCallback, useEffect, useRef } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  Background,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type OnNodeDrag,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useRecipeStore } from "@/stores/use-recipe-store";
import { CustomFlowNode } from "./custom-flow-node";
import { CustomFlowEdge } from "./custom-flow-edge";
import type { RecipeDsl, RecipeNode, RecipeEdge, NodeValidationIssue } from "@rpa/dsl";
import { analyzeInitializerNodes } from "@rpa/dsl";
import { nodeRegistry } from "./nodes";

export function getSafeNodeIssues(
  issuesRecord: unknown,
  id: string | null | undefined
): NodeValidationIssue[] {
  if (!id || typeof id !== "string") return [];
  if (!issuesRecord || typeof issuesRecord !== "object" || Array.isArray(issuesRecord)) return [];
  const list = (issuesRecord as Record<string, unknown>)[id];
  return Array.isArray(list) ? (list as NodeValidationIssue[]) : [];
}

const nodeTypes = {
  customNode: CustomFlowNode as any,
};

const edgeTypes = {
  customEdge: CustomFlowEdge as any,
};

function buildCanvasNodes(
  definition: RecipeDsl | undefined,
  selectedNodeId: string | null,
  nodeIssues: unknown,
  nodeOutputs: Record<string, unknown>,
  existingNodesMap?: Map<string, { x: number; y: number }>,
  disabledNodeIds: string[] = []
): Node[] {
  const nodesMap = definition?.nodes ?? {};
  const nodeKeys = Object.keys(nodesMap);
  const result: Node[] = [];
  const visited = new Set<string>();

  const initAnalysis = definition
    ? analyzeInitializerNodes(definition)
    : { primaryRootId: null, initializers: [] };

  let currentY = 20;
  let currentX = 180;

  function getNodeHighlights(node: RecipeNode) {
    const highlightParam = nodeRegistry.getHighlight(node);
    const locator =
      "locator" in node && node.locator
        ? {
            strategy: node.locator.primary.strategy,
            value: node.locator.primary.value,
            score: node.locator.primary.score,
            fallbacksCount: node.locator.fallbacks?.length || 0,
          }
        : undefined;
    return { highlightParam, locator };
  }

  function resolvePosition(node: RecipeNode, defaultPos: { x: number; y: number }) {
    if (node.position) return { x: node.position.x, y: node.position.y };
    const existing = existingNodesMap?.get(node.id);
    if (existing) return existing;
    return defaultPos;
  }

  // 1. Recorrer la cadena principal desde entry
  let currId: string | undefined = definition?.entry;
  while (currId && nodesMap[currId] && !visited.has(currId)) {
    visited.add(currId);
    const node: RecipeNode = nodesMap[currId];
    const { highlightParam, locator } = getNodeHighlights(node);
    const issues = getSafeNodeIssues(nodeIssues, currId);
    const hasErrors = issues.length > 0;
    const firstErrorMessage = issues[0]?.message;
    const nodePos = resolvePosition(node, { x: currentX, y: currentY });

    const initInfo = initAnalysis.initializers.find((i) => i.id === currId);
    const isInit = !!initInfo || nodeRegistry.get(node.type)?.isInitializer === true;

    result.push({
      id: currId,
      type: "customNode",
      position: nodePos,
      selected: selectedNodeId === currId,
      data: {
        id: currId,
        type: node.type,
        strategy: (node as any).params?.strategy,
        description: node.description,
        isEntry: definition?.entry === currId,
        isInitializer: isInit,
        isRoot: initInfo ? initInfo.isRoot : false,
        isPrincipal: definition?.entry === currId,
        isDisabled: disabledNodeIds.includes(currId),
        locator,
        highlightParam,
        hasErrors,
        firstErrorMessage,
        issues,
        output: nodeOutputs[currId],
      },
    });

    currentY += 220;
    currId = node.next;
  }

  // 2. Nodos desconectados o ramas adicionales
  let unvisitedCol = 0;
  for (const key of nodeKeys) {
    if (!visited.has(key)) {
      visited.add(key);
      const node: RecipeNode = nodesMap[key];
      const posX = 60 + unvisitedCol * 280;
      const posY = 50 + (result.length % 5) * 180;
      unvisitedCol++;

      const { highlightParam, locator } = getNodeHighlights(node);
      const issues = getSafeNodeIssues(nodeIssues, key);
      const hasErrors = issues.length > 0;
      const firstErrorMessage = issues[0]?.message;
      const nodePos = resolvePosition(node, { x: posX, y: posY });

      const initInfo = initAnalysis.initializers.find((i) => i.id === key);
      const isInit = !!initInfo || nodeRegistry.get(node.type)?.isInitializer === true;

      result.push({
        id: key,
        type: "customNode",
        position: nodePos,
        selected: selectedNodeId === key,
        data: {
          id: key,
          type: node.type,
          strategy: (node as any).params?.strategy,
          description: node.description,
          isEntry: definition?.entry === key,
          isInitializer: isInit,
          isRoot: initInfo ? initInfo.isRoot : false,
          isPrincipal: definition?.entry === key,
          isDisabled: disabledNodeIds.includes(key),
          locator,
          highlightParam,
          hasErrors,
          firstErrorMessage,
          issues,
          output: nodeOutputs[key],
        },
      });
    }
  }

  return result;
}

function resolveEdgeHandle(
  edge: RecipeEdge,
  nodes?: Record<string, RecipeNode>
): string | undefined {
  if (edge.condition === "true") return "then";
  if (edge.condition === "false") return "else";
  if (
    edge.label === "try" ||
    edge.label === "catch" ||
    edge.label === "finally" ||
    edge.label === "body"
  ) {
    return edge.label;
  }

  const source = nodes?.[edge.from];
  if (source?.type === "condition") {
    if (source.params.thenNodeId === edge.to) return "then";
    if (source.params.elseNodeId === edge.to) return "else";
  }
  if (source?.type === "loop") {
    if (source.params.bodyEntryNodeId === edge.to) return "body";
  }
  if (source?.type === "tryCatch") {
    if (source.params.tryEntryNodeId === edge.to) return "try";
    if (source.params.catchEntryNodeId === edge.to) return "catch";
    if (source.params.finallyEntryNodeId === edge.to) return "finally";
  }

  return undefined;
}

function buildCanvasEdges(
  edgesList: RecipeEdge[] = [],
  nodes?: Record<string, RecipeNode>
): Edge[] {
  return edgesList.map((e) => {
    const handle = resolveEdgeHandle(e, nodes);
    return {
      id: `edge_${e.from}_${e.to}_${handle ?? "next"}`,
      source: e.from,
      target: e.to,
      sourceHandle: handle,
      type: "customEdge",
      animated: true,
      label: e.condition || e.label,
    };
  });
}

/**
 * Controlador de viewport inteligente:
 * Si el nodo seleccionado o recién creado se encuentra fuera del área visible,
 * centra suavemente la cámara para que el usuario no tenga que buscarlo.
 */
function CanvasViewportController() {
  const { setCenter, getNode, getViewport } = useReactFlow();
  const selectedNodeId = useRecipeStore((s) => s.selectedNodeId);
  const prevSelectedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedNodeId || selectedNodeId === prevSelectedRef.current) {
      prevSelectedRef.current = selectedNodeId;
      return;
    }
    prevSelectedRef.current = selectedNodeId;

    const timer = setTimeout(() => {
      const node = getNode(selectedNodeId);
      if (!node) return;

      const { x: vpX, y: vpY, zoom } = getViewport();
      const screenWidth = typeof window !== "undefined" ? window.innerWidth : 1200;
      const screenHeight = typeof window !== "undefined" ? window.innerHeight : 800;

      const nodeScreenX = node.position.x * zoom + vpX;
      const nodeScreenY = node.position.y * zoom + vpY;

      const isVisible =
        nodeScreenX > 80 &&
        nodeScreenX < screenWidth - 280 &&
        nodeScreenY > 60 &&
        nodeScreenY < screenHeight - 120;

      if (!isVisible) {
        setCenter(node.position.x + 128, node.position.y + 80, {
          zoom: Math.max(zoom, 0.75),
          duration: 400,
        });
      }
    }, 60);

    return () => clearTimeout(timer);
  }, [selectedNodeId, getNode, getViewport, setCenter]);

  return null;
}

function FlowCanvasInner() {
  const definition = useRecipeStore((s) => s.definition);
  const selectedNodeId = useRecipeStore((s) => s.selectedNodeId);
  const setSelectedNodeId = useRecipeStore((s) => s.setSelectedNodeId);
  const addEdge = useRecipeStore((s) => s.addEdge);
  const removeEdge = useRecipeStore((s) => s.removeEdge);
  const nodeIssues = useRecipeStore((s) => s.nodeIssues);
  const nodeOutputs = useRecipeStore((s) => s.nodeOutputs);
  const updateNodePosition = useRecipeStore((s) => s.updateNodePosition);
  const disabledNodeIds = useRecipeStore((s) => s.disabledNodeIds);
  const openNodeDetail = useRecipeStore((s) => s.openNodeDetail);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const isDraggingRef = useRef(false);

  // Sincronizar nodos con definition sin interrumpir arrastres activos
  useEffect(() => {
    if (isDraggingRef.current) return;
    setNodes((prevNodes) => {
      const existingMap = new Map<string, { x: number; y: number }>();
      for (const n of prevNodes) {
        existingMap.set(n.id, n.position);
      }
      return buildCanvasNodes(
        definition,
        selectedNodeId,
        nodeIssues,
        nodeOutputs,
        existingMap,
        disabledNodeIds
      );
    });
  }, [definition, selectedNodeId, nodeIssues, nodeOutputs, disabledNodeIds, setNodes]);

  // Sincronizar aristas cuando cambia la definición
  useEffect(() => {
    setEdges(buildCanvasEdges(definition?.edges || [], definition?.nodes));
  }, [definition?.edges, definition?.nodes, setEdges]);

  // Atajo de teclado: Enter o Espacio para abrir la vista detallada del nodo seleccionado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        activeEl?.getAttribute("contenteditable") === "true";

      if (isInput) return;

      if ((e.key === "Enter" || e.key === " ") && selectedNodeId) {
        e.preventDefault();
        openNodeDetail(selectedNodeId);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedNodeId, openNodeDetail]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;

      const handle = connection.sourceHandle;
      const edge: RecipeEdge = {
        from: connection.source,
        to: connection.target,
      };

      if (handle === "then") {
        edge.condition = "true";
      } else if (handle === "else") {
        edge.condition = "false";
      } else if (handle === "try" || handle === "catch" || handle === "finally") {
        edge.label = handle;
      } else if (handle === "body") {
        edge.label = "body";
      }

      addEdge(edge);
    },
    [addEdge]
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNodeId(node.id);
    },
    [setSelectedNodeId]
  );

  const onNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      openNodeDetail(node.id);
    },
    [openNodeDetail]
  );

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, [setSelectedNodeId]);

  const onNodeDragStart: OnNodeDrag = useCallback(() => {
    isDraggingRef.current = true;
  }, []);

  const onNodeDragStop: OnNodeDrag = useCallback(
    (_event, node) => {
      isDraggingRef.current = false;
      updateNodePosition(node.id, {
        x: Math.round(node.position.x),
        y: Math.round(node.position.y),
      });
    },
    [updateNodePosition]
  );

  const onEdgesDelete = useCallback(
    (deletedEdges: Edge[]) => {
      for (const edge of deletedEdges) {
        removeEdge(edge.source, edge.target);
      }
    },
    [removeEdge]
  );

  return (
    <div className="flex-1 h-full bg-neutral-950 relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={true}
        edgesFocusable={true}
        deleteKeyCode={["Backspace", "Delete"]}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onEdgesDelete={onEdgesDelete}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onPaneClick={onPaneClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={1.8}
        proOptions={{ hideAttribution: true }}
      >
        <CanvasViewportController />
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#262626" />
      </ReactFlow>
    </div>
  );
}

export function FlowCanvas() {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner />
    </ReactFlowProvider>
  );
}
