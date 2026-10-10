"use client";

import React, { useMemo, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type Connection,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useRecipeStore } from "../../stores/use-recipe-store";
import { CustomFlowNode } from "./custom-flow-node";
import type { RecipeNode } from "@rpa/dsl";

const nodeTypes = {
  customNode: CustomFlowNode as any,
};

export function FlowCanvas() {
  const definition = useRecipeStore((s) => s.definition);
  const selectedNodeId = useRecipeStore((s) => s.selectedNodeId);
  const setSelectedNodeId = useRecipeStore((s) => s.setSelectedNodeId);
  const addEdge = useRecipeStore((s) => s.addEdge);
  const removeEdge = useRecipeStore((s) => s.removeEdge);
  const validationErrors = useRecipeStore((s) => s.validationErrors);

  // Calcular disposición visual de los nodos (layout automático vertical)
  const nodes: Node[] = useMemo(() => {
    const nodeKeys = Object.keys(definition.nodes);
    const result: Node[] = [];
    const visited = new Set<string>();

    let currentY = 50;
    let currentX = 300;

    // 1. Recorrer la cadena principal desde entry
    let currId: string | undefined = definition.entry;
    while (currId && definition.nodes[currId] && !visited.has(currId)) {
      visited.add(currId);
      const node: RecipeNode = definition.nodes[currId];

      let highlightParam: string | undefined;
      if (node.type === "navigate") highlightParam = node.params.url;
      if (node.type === "type") highlightParam = `"${node.params.text}"`;
      if (node.type === "select") highlightParam = `Opción: ${node.params.value}`;
      if (node.type === "extract") highlightParam = `-> ${node.params.variable}`;
      if (node.type === "setVariable") highlightParam = `${node.params.name} = ${node.params.expression}`;
      if (node.type === "condition") highlightParam = node.params.expression;
      if (node.type === "loop") highlightParam = `in ${node.params.collectionExpression}`;

      const locator = "locator" in node && node.locator ? {
        strategy: node.locator.primary.strategy,
        value: node.locator.primary.value,
        score: node.locator.primary.score,
        fallbacksCount: node.locator.fallbacks?.length || 0,
      } : undefined;

      const hasErrors = validationErrors.some((e) => e.includes(currId!));

      result.push({
        id: currId,
        type: "customNode",
        position: { x: currentX, y: currentY },
        selected: selectedNodeId === currId,
        data: {
          id: currId,
          type: node.type,
          description: node.description,
          isEntry: definition.entry === currId,
          locator,
          highlightParam,
          hasErrors,
        },
      });

      currentY += 180;
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

        result.push({
          id: key,
          type: "customNode",
          position: { x: posX, y: posY },
          selected: selectedNodeId === key,
          data: {
            id: key,
            type: node.type,
            description: node.description,
            isEntry: definition.entry === key,
            hasErrors: validationErrors.some((e) => e.includes(key)),
          },
        });
      }
    }

    return result;
  }, [definition, selectedNodeId, validationErrors]);

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
        <Controls className="!bg-neutral-900 !border-neutral-800 !fill-neutral-300 [&>button]:!border-neutral-800" />
        <MiniMap
          nodeColor="#3b82f6"
          maskColor="rgba(0, 0, 0, 0.7)"
          className="!bg-neutral-950 !border !border-neutral-800 !rounded-lg"
        />
      </ReactFlow>
    </div>
  );
}
