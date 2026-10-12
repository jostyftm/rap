import { create } from "zustand";
import type { RecipeDsl, RecipeNode, RecipeEdge, LocatorGroup, NodeValidationIssue } from "@rpa/dsl";
import { validateRecipeDslDetailed } from "@rpa/dsl";
import { calculateLocatorScore } from "@rpa/locator";
import { nodeRegistry } from "@/components/editor/nodes";

export type EditorView = "canvas" | "steps" | "code";

export interface ExecutionLog {
  id: string;
  timestamp: string;
  level: "info" | "warn" | "error" | "success";
  message: string;
  nodeId?: string;
  source?: "runner" | "browser" | "network" | "live";
  context?: Record<string, unknown>;
}

export interface ExecutionScreenshot {
  id: string;
  nodeId: string;
  timestamp: string;
  url: string;
}

export interface RecipeStoreState {
  recipeId: string | null;
  recipeName: string;
  recipeDescription: string;
  recipeVersion: number;
  definition: RecipeDsl;
  validationErrors: string[];
  nodeIssues: Record<string, NodeValidationIssue[]>;
  selectedNodeId: string | null;
  activeView: EditorView;
  isDirty: boolean;

  // Ejecución en vivo
  runId: string | null;
  runStatus: "idle" | "running" | "success" | "failed";
  runControlState: "idle" | "running" | "paused" | "stopping";
  runningNodeId: string | null;
  logs: ExecutionLog[];
  screenshots: ExecutionScreenshot[];

  // Grabación en vivo (Recorder)
  isRecording: boolean;
  recordingSessionId: string | null;
  recordedActionsCount: number;

  // Historial (Undo / Redo)
  history: RecipeDsl[];
  historyIndex: number;

  // Acciones
  setRecipe: (data: {
    id: string;
    name: string;
    description?: string;
    version: number;
    definition: RecipeDsl;
  }) => void;
  setName: (name: string) => void;
  setDescription: (desc: string) => void;
  setActiveView: (view: EditorView) => void;
  setSelectedNodeId: (nodeId: string | null) => void;

  addNode: (type: RecipeNode["type"]) => string;
  updateNode: (id: string, updates: Partial<RecipeNode>) => void;
  deleteNode: (id: string) => void;
  reorderNodes: (orderedIds: string[]) => void;
  setEntryNode: (id: string) => void;

  addEdge: (edge: RecipeEdge) => void;
  removeEdge: (from: string, to: string) => void;

  setDefinitionFromCode: (dsl: RecipeDsl) => void;
  undo: () => void;
  redo: () => void;

  // Control de Ejecución
  startRun: (runId: string) => void;
  setRunningNodeId: (nodeId: string | null) => void;
  setRunControlState: (state: "idle" | "running" | "paused" | "stopping") => void;
  addLog: (log: Omit<ExecutionLog, "id" | "timestamp">) => void;
  addScreenshot: (screenshot: Omit<ExecutionScreenshot, "id" | "timestamp">) => void;
  finishRun: (status: "success" | "failed") => void;
  clearRunState: () => void;

  // Salidas y contexto de nodos probados/ejecutados
  nodeOutputs: Record<string, unknown>;
  setNodeOutput: (nodeId: string, output: unknown) => void;
  updateNodePosition: (id: string, position: { x: number; y: number }) => void;

  // Grabación en vivo
  startRecording: (sessionId: string) => void;
  stopRecording: () => void;
  appendRecordedAction: (action: {
    type: string;
    locator?: any;
    params?: any;
    url?: string;
    description?: string;
  }) => void;
}

const DEFAULT_INITIAL_DSL: RecipeDsl = {
  schema: "rpa/v1",
  name: "Nueva Receta RPA",
  entry: "step_navigate",
  variables: [],
  nodes: {
    step_navigate: {
      id: "step_navigate",
      type: "navigate",
      description: "Navegar a la página web",
      params: { url: "https://example.com", waitUntil: "domcontentloaded" },
      next: "step_click",
    },
    step_click: {
      id: "step_click",
      type: "click",
      description: "Hacer clic en el botón principal",
      locator: {
        primary: { strategy: "role", value: "button[name='More information...']", score: 90 },
        fallbacks: [
          { strategy: "css", value: "a[href*='iana.org']", score: 70 },
        ],
      },
      params: { button: "left" },
    },
  },
  edges: [
    { from: "step_navigate", to: "step_click" },
  ],
};

function pushHistory(currentHistory: RecipeDsl[], currentIndex: number, newDsl: RecipeDsl) {
  const truncated = currentHistory.slice(0, currentIndex + 1);
  const updated = [...truncated, JSON.parse(JSON.stringify(newDsl))];
  if (updated.length > 30) updated.shift();
  return { history: updated, historyIndex: updated.length - 1 };
}

function validateDsl(dsl: RecipeDsl): {
  errors: string[];
  nodeIssues: Record<string, NodeValidationIssue[]>;
} {
  const res = validateRecipeDslDetailed(dsl);
  if (res.success) {
    return { errors: [], nodeIssues: {} };
  }
  return {
    errors: res.errors || ["Error de validación en DSL"],
    nodeIssues: res.nodeIssues || {},
  };
}

function calculateNextNodePosition(
  definition: RecipeDsl,
  preferredRefNodeId?: string | null
): { x: number; y: number } {
  const nodes = definition.nodes || {};
  const allNodes = Object.values(nodes);

  if (allNodes.length === 0) {
    return { x: 180, y: 50 };
  }

  // 1. Nodo de referencia: el seleccionado si existe, o el nodo con mayor Y en el lienzo
  let refNode: RecipeNode | null = null;
  if (preferredRefNodeId && nodes[preferredRefNodeId]) {
    refNode = nodes[preferredRefNodeId];
  } else {
    refNode = allNodes.reduce((lowest, curr) => {
      const lowestY = lowest.position?.y ?? 0;
      const currY = curr.position?.y ?? 0;
      return currY > lowestY ? curr : lowest;
    }, allNodes[0]);
  }

  let posX = refNode?.position?.x ?? 180;
  let posY = (refNode?.position?.y ?? 50) + 220;

  // 2. Evitar solapamientos con nodos existentes cercanos
  let collision = true;
  let attempts = 0;
  while (collision && attempts < 10) {
    const hasOverlap = allNodes.some((n) => {
      const nx = n.position?.x ?? 0;
      const ny = n.position?.y ?? 0;
      return Math.abs(nx - posX) < 30 && Math.abs(ny - posY) < 50;
    });

    if (hasOverlap) {
      posX += 40;
      posY += 40;
      attempts++;
    } else {
      collision = false;
    }
  }

  return { x: Math.round(posX), y: Math.round(posY) };
}

const initialValidation = validateDsl(DEFAULT_INITIAL_DSL);

export const useRecipeStore = create<RecipeStoreState>((set, get) => ({
  recipeId: null,
  recipeName: "Nueva Receta RPA",
  recipeDescription: "",
  recipeVersion: 1,
  definition: DEFAULT_INITIAL_DSL,
  validationErrors: initialValidation.errors,
  nodeIssues: initialValidation.nodeIssues,
  selectedNodeId: "step_navigate",
  activeView: "canvas",
  isDirty: false,

  runId: null,
  runStatus: "idle",
  runControlState: "idle",
  runningNodeId: null,
  logs: [],
  screenshots: [],

  isRecording: false,
  recordingSessionId: null,
  recordedActionsCount: 0,

  nodeOutputs: {},

  history: [JSON.parse(JSON.stringify(DEFAULT_INITIAL_DSL))],
  historyIndex: 0,

  setRecipe: ({ id, name, description, version, definition }) => {
    const safeDef = definition || DEFAULT_INITIAL_DSL;
    const { errors, nodeIssues } = validateDsl(safeDef);
    set({
      recipeId: id,
      recipeName: name,
      recipeDescription: description || "",
      recipeVersion: version,
      definition: safeDef,
      validationErrors: errors || [],
      nodeIssues: nodeIssues || {},
      selectedNodeId: safeDef.entry || Object.keys(safeDef.nodes || {})[0] || null,
      history: [JSON.parse(JSON.stringify(safeDef))],
      historyIndex: 0,
      isDirty: false,
    });
  },

  setName: (recipeName) => set({ recipeName, isDirty: true }),
  setDescription: (recipeDescription) => set({ recipeDescription, isDirty: true }),
  setActiveView: (activeView) => set({ activeView }),
  setSelectedNodeId: (selectedNodeId) => set({ selectedNodeId }),

  addNode: (type) => {
    const { definition, history, historyIndex, selectedNodeId } = get();
    const newId = `${type}_${Math.random().toString(36).substring(2, 7)}`;
    const newNode = nodeRegistry.createNode(type, newId);

    // Calcular posición basada en el nodo seleccionado o el último inferior
    const nextPos = calculateNextNodePosition(definition, selectedNodeId);
    newNode.position = nextPos;

    const updatedNodes = { ...definition.nodes, [newId]: newNode };
    let newEntry = definition.entry;
    const updatedEdges = [...definition.edges];

    if (!newEntry || Object.keys(definition.nodes).length === 0) {
      newEntry = newId;
    } else {
      // Conectar automáticamente desde el nodo seleccionado si existe y no tiene 'next',
      // o desde el último nodo disponible sin 'next'
      const candidateSourceId =
        selectedNodeId && definition.nodes[selectedNodeId]
          ? selectedNodeId
          : Object.keys(definition.nodes).pop();

      if (candidateSourceId) {
        const sourceNode = definition.nodes[candidateSourceId];
        if (sourceNode && !sourceNode.next && sourceNode.type !== "condition") {
          updatedNodes[candidateSourceId] = { ...sourceNode, next: newId };
          updatedEdges.push({ from: candidateSourceId, to: newId });
        }
      }
    }

    const updatedDsl: RecipeDsl = {
      ...definition,
      entry: newEntry,
      nodes: updatedNodes,
      edges: updatedEdges,
    };

    const { errors, nodeIssues } = validateDsl(updatedDsl);
    const hist = pushHistory(history, historyIndex, updatedDsl);

    set({
      definition: updatedDsl,
      validationErrors: errors,
      nodeIssues,
      selectedNodeId: newId,
      isDirty: true,
      ...hist,
    });

    return newId;
  },

  updateNode: (id, updates) => {
    const { definition, history, historyIndex } = get();
    const existing = definition.nodes[id];
    if (!existing) return;

    // Si se actualizan localizadores, recalcular scores
    const merged: any = { ...existing, ...updates };
    const rawUpdates = updates as Record<string, any>;
    if ("locator" in rawUpdates && rawUpdates.locator) {
      const loc = rawUpdates.locator as LocatorGroup;
      if (loc.primary) {
        loc.primary.score = calculateLocatorScore(loc.primary.strategy, loc.primary.value);
      }
      if (loc.fallbacks) {
        loc.fallbacks = loc.fallbacks.map((f) => ({
          ...f,
          score: calculateLocatorScore(f.strategy, f.value),
        }));
      }
      merged.locator = loc;
    }

    const updatedDsl: RecipeDsl = {
      ...definition,
      nodes: {
        ...definition.nodes,
        [id]: merged as RecipeNode,
      },
    };

    const { errors, nodeIssues } = validateDsl(updatedDsl);
    const hist = pushHistory(history, historyIndex, updatedDsl);

    set({
      definition: updatedDsl,
      validationErrors: errors,
      nodeIssues,
      isDirty: true,
      ...hist,
    });
  },

  updateNodePosition: (id, position) => {
    const { definition } = get();
    const node = definition.nodes[id];
    if (!node) return;
    if (node.position?.x === position.x && node.position?.y === position.y) return;

    const updatedDsl: RecipeDsl = {
      ...definition,
      nodes: {
        ...definition.nodes,
        [id]: {
          ...node,
          position,
        },
      },
    };

    set({
      definition: updatedDsl,
      isDirty: true,
    });
  },

  setNodeOutput: (nodeId, output) => {
    set((state) => ({
      nodeOutputs: {
        ...state.nodeOutputs,
        [nodeId]: output,
      },
    }));
  },

  deleteNode: (id) => {
    const { definition, history, historyIndex, selectedNodeId } = get();
    const nextNodes = { ...definition.nodes };
    delete nextNodes[id];

    // Limpiar referencias 'next' hacia este nodo
    for (const key of Object.keys(nextNodes)) {
      if (nextNodes[key].next === id) {
        nextNodes[key] = { ...nextNodes[key], next: undefined };
      }
    }

    const nextEdges = definition.edges.filter((e) => e.from !== id && e.to !== id);

    let nextEntry = definition.entry;
    if (nextEntry === id) {
      nextEntry = Object.keys(nextNodes)[0] || "";
    }

    const updatedDsl: RecipeDsl = {
      ...definition,
      entry: nextEntry,
      nodes: nextNodes,
      edges: nextEdges,
    };

    const { errors, nodeIssues } = validateDsl(updatedDsl);
    const hist = pushHistory(history, historyIndex, updatedDsl);

    set({
      definition: updatedDsl,
      validationErrors: errors,
      nodeIssues,
      selectedNodeId: selectedNodeId === id ? (nextEntry || null) : selectedNodeId,
      isDirty: true,
      ...hist,
    });
  },

  reorderNodes: (orderedIds) => {
    const { definition, history, historyIndex } = get();
    if (orderedIds.length === 0) return;

    const newNodes = { ...definition.nodes };
    const newEdges: RecipeEdge[] = [];

    for (let i = 0; i < orderedIds.length; i++) {
      const currentId = orderedIds[i];
      const nextId = orderedIds[i + 1];
      if (newNodes[currentId]) {
        newNodes[currentId] = {
          ...newNodes[currentId],
          next: nextId || undefined,
        };
        if (nextId) {
          newEdges.push({ from: currentId, to: nextId });
        }
      }
    }

    const updatedDsl: RecipeDsl = {
      ...definition,
      entry: orderedIds[0],
      nodes: newNodes,
      edges: newEdges,
    };

    const { errors, nodeIssues } = validateDsl(updatedDsl);
    const hist = pushHistory(history, historyIndex, updatedDsl);

    set({
      definition: updatedDsl,
      validationErrors: errors,
      nodeIssues,
      isDirty: true,
      ...hist,
    });
  },

  setEntryNode: (id) => {
    const { definition, history, historyIndex } = get();
    if (!definition.nodes[id]) return;

    const updatedDsl = { ...definition, entry: id };
    const { errors, nodeIssues } = validateDsl(updatedDsl);
    const hist = pushHistory(history, historyIndex, updatedDsl);

    set({
      definition: updatedDsl,
      validationErrors: errors,
      nodeIssues,
      isDirty: true,
      ...hist,
    });
  },

  addEdge: (edge) => {
    const { definition, history, historyIndex } = get();
    // Evitar duplicados
    const exists = definition.edges.some((e) => e.from === edge.from && e.to === edge.to);
    if (exists) return;

    // Actualizar también el 'next' del nodo de origen
    const sourceNode = definition.nodes[edge.from];
    const updatedNodes = { ...definition.nodes };
    if (sourceNode && !edge.condition) {
      updatedNodes[edge.from] = { ...sourceNode, next: edge.to };
    }

    const updatedDsl: RecipeDsl = {
      ...definition,
      nodes: updatedNodes,
      edges: [...definition.edges, edge],
    };

    const { errors, nodeIssues } = validateDsl(updatedDsl);
    const hist = pushHistory(history, historyIndex, updatedDsl);

    set({
      definition: updatedDsl,
      validationErrors: errors,
      nodeIssues,
      isDirty: true,
      ...hist,
    });
  },

  removeEdge: (from, to) => {
    const { definition, history, historyIndex } = get();
    const sourceNode = definition.nodes[from];
    const updatedNodes = { ...definition.nodes };
    if (sourceNode) {
      if (sourceNode.next === to) {
        updatedNodes[from] = { ...sourceNode, next: undefined };
      }
      if (sourceNode.type === "condition") {
        const condNode = sourceNode as any;
        if (condNode.params?.thenNodeId === to) {
          updatedNodes[from] = {
            ...condNode,
            params: { ...condNode.params, thenNodeId: "" },
          };
        } else if (condNode.params?.elseNodeId === to) {
          updatedNodes[from] = {
            ...condNode,
            params: { ...condNode.params, elseNodeId: undefined },
          };
        }
      } else if (sourceNode.type === "loop") {
        const loopNode = sourceNode as any;
        if (loopNode.params?.bodyEntryNodeId === to) {
          updatedNodes[from] = {
            ...loopNode,
            params: { ...loopNode.params, bodyEntryNodeId: "" },
          };
        }
      }
    }

    const updatedDsl: RecipeDsl = {
      ...definition,
      nodes: updatedNodes,
      edges: definition.edges.filter((e) => !(e.from === from && e.to === to)),
    };

    const { errors, nodeIssues } = validateDsl(updatedDsl);
    const hist = pushHistory(history, historyIndex, updatedDsl);

    set({
      definition: updatedDsl,
      validationErrors: errors,
      nodeIssues,
      isDirty: true,
      ...hist,
    });
  },

  setDefinitionFromCode: (dsl) => {
    const { history, historyIndex } = get();
    const { errors, nodeIssues } = validateDsl(dsl);
    const hist = pushHistory(history, historyIndex, dsl);

    set({
      definition: dsl,
      validationErrors: errors,
      nodeIssues,
      isDirty: true,
      ...hist,
    });
  },

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex > 0) {
      const prev = history[historyIndex - 1];
      const { errors, nodeIssues } = validateDsl(prev);
      set({
        definition: prev,
        validationErrors: errors,
        nodeIssues,
        historyIndex: historyIndex - 1,
        isDirty: true,
      });
    }
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex < history.length - 1) {
      const next = history[historyIndex + 1];
      const { errors, nodeIssues } = validateDsl(next);
      set({
        definition: next,
        validationErrors: errors,
        nodeIssues,
        historyIndex: historyIndex + 1,
        isDirty: true,
      });
    }
  },

  startRun: (runId) => {
    set({
      runId,
      runStatus: "running",
      runControlState: "running",
      runningNodeId: null,
      logs: [
        {
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          level: "info",
          message: `Iniciando ejecución determinista ${runId}...`,
        },
      ],
      screenshots: [],
    });
  },

  setRunningNodeId: (runningNodeId) => set({ runningNodeId }),
  setRunControlState: (runControlState) => set({ runControlState }),

  addLog: (log) => {
    set((state) => ({
      logs: [
        ...state.logs,
        {
          ...log,
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
        },
      ],
    }));
  },

  addScreenshot: (screenshot) => {
    set((state) => ({
      screenshots: [
        ...state.screenshots,
        {
          ...screenshot,
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
        },
      ],
    }));
  },

  finishRun: (status) => {
    set((state) => ({
      runStatus: status,
      runControlState: "idle",
      runningNodeId: null,
      logs: [
        ...state.logs,
        {
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          level: status === "success" ? "success" : "error",
          message:
            status === "success"
              ? "✓ Receta completada con éxito."
              : "✗ La ejecución falló con errores.",
        },
      ],
    }));
  },

  clearRunState: () => {
    set({
      runId: null,
      runStatus: "idle",
      runControlState: "idle",
      runningNodeId: null,
      logs: [],
      screenshots: [],
      nodeOutputs: {},
    });
  },

  startRecording: (recordingSessionId: string) => {
    set({
      isRecording: true,
      recordingSessionId,
      recordedActionsCount: 0,
    });
  },

  stopRecording: () => {
    set({
      isRecording: false,
      recordingSessionId: null,
    });
  },

  appendRecordedAction: (action) => {
    const { definition, history, historyIndex, selectedNodeId, recordedActionsCount } = get();
    const type = (action.type || "click") as RecipeNode["type"];
    const newId = `rec_${type}_${Math.random().toString(36).substring(2, 7)}`;

    const nextPos = calculateNextNodePosition(definition, selectedNodeId);

    const newNode: RecipeNode = {
      id: newId,
      type: type,
      description: action.description || `Acción grabada: ${type}`,
      locator: action.locator,
      params: action.params || {},
      position: nextPos,
    };

    const updatedNodes = { ...definition.nodes, [newId]: newNode };
    let newEntry = definition.entry;
    const updatedEdges = [...definition.edges];

    if (!newEntry || Object.keys(definition.nodes).length === 0) {
      newEntry = newId;
    } else {
      const nodeKeys = Object.keys(definition.nodes);
      const lastKey = nodeKeys[nodeKeys.length - 1];
      const lastNode = definition.nodes[lastKey];
      if (lastNode && !lastNode.next && lastNode.type !== "condition") {
        updatedNodes[lastKey] = { ...lastNode, next: newId };
        updatedEdges.push({ from: lastKey, to: newId });
      }
    }

    const updatedDsl: RecipeDsl = {
      ...definition,
      entry: newEntry,
      nodes: updatedNodes,
      edges: updatedEdges,
    };

    const { errors, nodeIssues } = validateDsl(updatedDsl);
    const hist = pushHistory(history, historyIndex, updatedDsl);

    set({
      definition: updatedDsl,
      validationErrors: errors,
      nodeIssues,
      selectedNodeId: newId,
      isDirty: true,
      recordedActionsCount: recordedActionsCount + 1,
      ...hist,
    });
  },
}));
