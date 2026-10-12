"use client";

import React, { useCallback, useEffect, useRef } from "react";
import {
  ReactFlow,
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
  existingNodesMap?: Map<string, { x: number; y: number }>
): Node[] {
  const nodesMap = definition?.nodes ?? {};
  const nodeKeys = Object.keys(nodesMap);
  const result: Node[] = [];
  const visited = new Set<string>();

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

function buildCanvasEdges(edgesList: RecipeEdge[] = []): Edge[] {
  return edgesList.map((e) => ({
    id: `edge_${e.from}_${e.to}`,
    source: e.from,
    target: e.to,
    type: "customEdge",
    animated: true,
    label: e.condition || e.label,
  }));
}

export function FlowCanvas() {
  const definition = useRecipeStore((s) => s.definition);
  const selectedNodeId = useRecipeStore((s) => s.selectedNodeId);
  const setSelectedNodeId = useRecipeStore((s) => s.setSelectedNodeId);
  const addEdge = useRecipeStore((s) => s.addEdge);
  const removeEdge = useRecipeStore((s) => s.removeEdge);
  const nodeIssues = useRecipeStore((s) => s.nodeIssues);
  const nodeOutputs = useRecipeStore((s) => s.nodeOutputs);
  const updateNodePosition = useRecipeStore((s) => s.updateNodePosition);

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
      return buildCanvasNodes(definition, selectedNodeId, nodeIssues, nodeOutputs, existingMap);
    });
  }, [definition, selectedNodeId, nodeIssues, nodeOutputs, setNodes]);

  // Sincronizar aristas cuando cambia la definición
  useEffect(() => {
    setEdges(buildCanvasEdges(definition?.edges || []));
  }, [definition?.edges, setEdges]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) {
        addEdge({
          from: connection.source,
          to: connection.target,
          condition: connection.sourceHandle === "else" ? "false" : undefined,
        });
      }
    },
    [addEdge]
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNodeId(node.id);
    },
    [setSelectedNodeId]
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
        onPaneClick={onPaneClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={1.8}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#262626" />
      </ReactFlow>
    </div>
  );
}
