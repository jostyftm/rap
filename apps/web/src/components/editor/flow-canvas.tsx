"use client";

import React, { useMemo, useCallback } from "react";
import {
  ReactFlow,
  Background,
  type Node,
  type Edge,
  type Connection,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useRecipeStore } from "@/stores/use-recipe-store";
import { CustomFlowNode } from "./custom-flow-node";
import type { RecipeNode } from "@rpa/dsl";
import { nodeRegistry } from "./nodes";

const nodeTypes = {
  customNode: CustomFlowNode as any,
};

export function FlowCanvas() {
  const definition = useRecipeStore((s) => s.definition);
  const selectedNodeId = useRecipeStore((s) => s.selectedNodeId);
  const setSelectedNodeId = useRecipeStore((s) => s.setSelectedNodeId);
  const addEdge = useRecipeStore((s) => s.addEdge);
  const removeEdge = useRecipeStore((s) => s.removeEdge);
  const nodeIssues = useRecipeStore((s) => s.nodeIssues) ?? {};

  // Calcular disposición visual de los nodos (layout automático vertical)
  const nodes: Node[] = useMemo(() => {
    const nodeKeys = Object.keys(definition.nodes);
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

    // 1. Recorrer la cadena principal desde entry
    let currId: string | undefined = definition.entry;
    while (currId && definition.nodes[currId] && !visited.has(currId)) {
      visited.add(currId);
      const node: RecipeNode = definition.nodes[currId];
      const { highlightParam, locator } = getNodeHighlights(node);
      const issues = (currId && Array.isArray(nodeIssues?.[currId])) ? nodeIssues[currId] : [];
      const hasErrors = issues.length > 0;
      const firstErrorMessage = issues[0]?.message;

      result.push({
        id: currId,
        type: "customNode",
        position: { x: currentX, y: currentY },
        selected: selectedNodeId === currId,
        data: {
          id: currId,
          type: node.type,
          strategy: (node as any).params?.strategy,
          description: node.description,
          isEntry: definition.entry === currId,
          locator,
          highlightParam,
          hasErrors,
          firstErrorMessage,
          issues,
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
        const node: RecipeNode = definition.nodes[key];
        const posX = 60 + unvisitedCol * 280;
        const posY = 50 + (result.length % 5) * 180;
        unvisitedCol++;

        const { highlightParam, locator } = getNodeHighlights(node);
        const issues = (key && Array.isArray(nodeIssues?.[key])) ? nodeIssues[key] : [];
        const hasErrors = issues.length > 0;
        const firstErrorMessage = issues[0]?.message;

        result.push({
          id: key,
          type: "customNode",
          position: { x: posX, y: posY },
          selected: selectedNodeId === key,
          data: {
            id: key,
            type: node.type,
            strategy: (node as any).params?.strategy,
            description: node.description,
            isEntry: definition.entry === key,
            locator,
            highlightParam,
            hasErrors,
            firstErrorMessage,
            issues,
          },
        });
      }
    }

    return result;
  }, [definition, selectedNodeId, nodeIssues]);

  // Convertir aristas del DSL a aristas de React Flow
  const edges: Edge[] = useMemo(() => {
    return (definition.edges || []).map((e) => ({
      id: `edge_${e.from}_${e.to}`,
      source: e.from,
      target: e.to,
      animated: true,
      label: e.condition || e.label,
      style: { stroke: "#64748b", strokeWidth: 2 },
    }));
  }, [definition.edges]);

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

  return (
    <div className="flex-1 h-full bg-neutral-950 relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
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
