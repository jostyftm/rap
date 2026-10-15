import type { RecipeDsl, RecipeNode } from "./types.js";
import { isInitializerNodeType } from "./types.js";

export interface InitializerNodeInfo {
  id: string;
  type: RecipeNode["type"];
  inDegree: number;
  outDegree: number;
  isRoot: boolean;
  isPrincipal: boolean;
}

export interface RootInitializerAnalysis {
  primaryRootId: string | null;
  initializers: InitializerNodeInfo[];
}

/**
 * Analiza el grafo de la receta para identificar todos los nodos inicializadores
 * (Navegador, Webhook, y futuros triggers), calcular su conectividad en el árbol
 * (grado de entrada y salida) y determinar cuál es la raíz principal.
 */
export function analyzeInitializerNodes(recipe: RecipeDsl): RootInitializerAnalysis {
  const nodes = recipe.nodes || {};
  const edges = recipe.edges || [];

  const inDegrees: Record<string, number> = {};
  const outDegrees: Record<string, number> = {};

  for (const id of Object.keys(nodes)) {
    inDegrees[id] = 0;
    outDegrees[id] = 0;
  }

  // 1. Contabilizar aristas explícitas
  const recordedEdges = new Set<string>();
  for (const edge of edges) {
    if (nodes[edge.from] && nodes[edge.to]) {
      const edgeKey = `${edge.from}->${edge.to}`;
      if (!recordedEdges.has(edgeKey)) {
        recordedEdges.add(edgeKey);
        outDegrees[edge.from] = (outDegrees[edge.from] || 0) + 1;
        inDegrees[edge.to] = (inDegrees[edge.to] || 0) + 1;
      }
    }
  }

  // 2. Contabilizar conexiones implícitas en propiedades del nodo (next, thenNodeId, etc.)
  for (const node of Object.values(nodes)) {
    if (node.next && nodes[node.next]) {
      const key = `${node.id}->${node.next}`;
      if (!recordedEdges.has(key)) {
        recordedEdges.add(key);
        outDegrees[node.id] = (outDegrees[node.id] || 0) + 1;
        inDegrees[node.next] = (inDegrees[node.next] || 0) + 1;
      }
    }
    if (node.type === "condition") {
      const thenId = node.params.thenNodeId;
      if (thenId && nodes[thenId]) {
        const key = `${node.id}->${thenId}`;
        if (!recordedEdges.has(key)) {
          recordedEdges.add(key);
          outDegrees[node.id] = (outDegrees[node.id] || 0) + 1;
          inDegrees[thenId] = (inDegrees[thenId] || 0) + 1;
        }
      }
      const elseId = node.params.elseNodeId;
      if (elseId && nodes[elseId]) {
        const key = `${node.id}->${elseId}`;
        if (!recordedEdges.has(key)) {
          recordedEdges.add(key);
          outDegrees[node.id] = (outDegrees[node.id] || 0) + 1;
          inDegrees[elseId] = (inDegrees[elseId] || 0) + 1;
        }
      }
    }
  }

  // 3. Filtrar nodos inicializadores (por tipo o por flag isInitializer)
  const initializers: InitializerNodeInfo[] = [];

  for (const node of Object.values(nodes)) {
    const isInit = isInitializerNodeType(node.type) || node.isInitializer === true;
    if (isInit) {
      const inDeg = inDegrees[node.id] || 0;
      const outDeg = outDegrees[node.id] || 0;
      initializers.push({
        id: node.id,
        type: node.type,
        inDegree: inDeg,
        outDegree: outDeg,
        isRoot: inDeg === 0,
        isPrincipal: recipe.entry === node.id,
      });
    }
  }

  // 4. Determinar la raíz principal
  const rootInitializers = initializers.filter((init) => init.isRoot);

  let primaryRootId: string | null = null;

  if (rootInitializers.length > 0) {
    // Si la entrada actual ya es una de las raíces inicializadoras, mantenerla
    const currentIsRoot = rootInitializers.find((init) => init.id === recipe.entry);
    if (currentIsRoot) {
      primaryRootId = currentIsRoot.id;
    } else {
      // Priorizar el inicializador raíz que tenga conexiones hacia adelante (outDegree > 0)
      const connectedRoot = rootInitializers.find((init) => init.outDegree > 0);
      primaryRootId = connectedRoot ? connectedRoot.id : rootInitializers[0].id;
    }
  } else if (initializers.length > 0) {
    // Si no hay raíces estrictas con inDegree=0, usar el inicializador actual o el primero
    const currentInit = initializers.find((init) => init.id === recipe.entry);
    primaryRootId = currentInit ? currentInit.id : initializers[0].id;
  } else {
    // Si no hay ningún inicializador en la receta, mantener la entrada existente
    primaryRootId = recipe.entry || null;
  }

  // Actualizar la bandera isPrincipal con el primaryRootId definitivo
  for (const init of initializers) {
    init.isPrincipal = init.id === primaryRootId;
  }

  return {
    primaryRootId,
    initializers,
  };
}

/**
 * Reconcilia la receta asegurando que el nodo inicializador raíz esté
 * asignado como principal (entry) del flujo.
 */
export function reconcileRecipeRoot(recipe: RecipeDsl): RecipeDsl {
  const analysis = analyzeInitializerNodes(recipe);
  if (analysis.primaryRootId && analysis.primaryRootId !== recipe.entry) {
    return {
      ...recipe,
      entry: analysis.primaryRootId,
    };
  }
  return recipe;
}
