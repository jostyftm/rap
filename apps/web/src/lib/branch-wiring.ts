import type { RecipeDsl, RecipeEdge, RecipeNode } from "@rpa/dsl";

/**
 * Identifica la salida lógica de una arista.
 * `undefined` representa la continuación por defecto (`next`).
 */
export function edgeHandle(edge: RecipeEdge): string | undefined {
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
  return undefined;
}

/** Convierte una conexión del canvas (handle de origen) en una arista del DSL. */
export function connectionToEdge(
  source: string,
  target: string,
  sourceHandle?: string | null
): RecipeEdge {
  const edge: RecipeEdge = { from: source, to: target };

  if (sourceHandle === "then") {
    edge.condition = "true";
  } else if (sourceHandle === "else") {
    edge.condition = "false";
  } else if (
    sourceHandle === "try" ||
    sourceHandle === "catch" ||
    sourceHandle === "finally"
  ) {
    edge.label = sourceHandle;
  } else if (sourceHandle === "body") {
    edge.label = "body";
  }

  return edge;
}

export const BRANCH_PARAM_KEYS = [
  "thenNodeId",
  "elseNodeId",
  "bodyEntryNodeId",
  "tryEntryNodeId",
  "catchEntryNodeId",
  "finallyEntryNodeId",
] as const;

const BRANCH_KEY_BY_HANDLE: Record<string, string> = {
  then: "thenNodeId",
  else: "elseNodeId",
  body: "bodyEntryNodeId",
  try: "tryEntryNodeId",
  catch: "catchEntryNodeId",
  finally: "finallyEntryNodeId",
};

function branchParamKey(handle: string | undefined): string | undefined {
  return handle ? BRANCH_KEY_BY_HANDLE[handle] : undefined;
}

/**
 * Aplica una arista al DSL, actualizando la salida lógica del nodo origen y
 * reemplazando cualquier arista previa de esa misma salida. Devuelve `null`
 * cuando el handle no corresponde al tipo de nodo origen.
 */
export function applyEdgeToDefinition(
  definition: RecipeDsl,
  edge: RecipeEdge
): RecipeDsl | null {
  const sourceNode = definition.nodes[edge.from];
  if (!sourceNode) return null;

  const handle = edgeHandle(edge);
  const isConditionBranch = handle === "then" || handle === "else";
  const isTryCatchBranch =
    handle === "try" || handle === "catch" || handle === "finally";
  const isLoopBranch = handle === "body";

  if (isConditionBranch && sourceNode.type !== "condition") return null;
  if (isTryCatchBranch && sourceNode.type !== "tryCatch") return null;
  if (isLoopBranch && sourceNode.type !== "loop") return null;
  // La condición no tiene continuación por defecto: sus salidas son then/else.
  if (handle === undefined && sourceNode.type === "condition") return null;

  const paramKey = branchParamKey(handle);
  const updatedNodes = { ...definition.nodes };

  if (paramKey) {
    updatedNodes[edge.from] = {
      ...sourceNode,
      params: { ...(sourceNode as any).params, [paramKey]: edge.to },
    } as RecipeNode;
  } else {
    updatedNodes[edge.from] = { ...sourceNode, next: edge.to } as RecipeNode;
  }

  // Reemplazar la arista previa de la misma salida lógica
  const updatedEdges = [
    ...definition.edges.filter(
      (existing) => !(existing.from === edge.from && edgeHandle(existing) === handle)
    ),
    edge,
  ];

  return {
    ...definition,
    nodes: updatedNodes,
    edges: updatedEdges,
  };
}
