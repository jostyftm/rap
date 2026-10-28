import { create } from "zustand";
import type { RecipeDsl, RecipeNode, RecipeEdge, LocatorGroup, NodeValidationIssue, RecipeVariable } from "@rpa/dsl";
import { validateRecipeDslDetailed, reconcileRecipeRoot, analyzeInitializerNodes } from "@rpa/dsl";
import { calculateLocatorScore } from "@rpa/locator";
import { nodeRegistry } from "@/components/editor/nodes";
import {
  BRANCH_PARAM_KEYS,
  applyEdgeToDefinition,
  edgeHandle,
} from "@/lib/branch-wiring";
import { createInitialDefinition } from "@/lib/default-recipe";


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
  selectedNodeIds: string[];
  isTestingSteps: boolean;
  testingStepsProgress: { current: number; total: number; nodeId?: string } | null;
  activeView: EditorView;
  isDirty: boolean;

  // Acciones de selección
  setSelectedNodeIds: (ids: string[]) => void;
  toggleNodeSelection: (id: string, multi?: boolean) => void;
  clearSelection: () => void;
  setIsTestingSteps: (
    isTesting: boolean,
    progress?: { current: number; total: number; nodeId?: string } | null
  ) => void;

  // Vista de detalle de nodo estilo n8n
  activeDetailNodeId: string | null;
  openNodeDetail: (nodeId: string) => void;
  closeNodeDetail: () => void;
  setRecipeVariables: (variables: RecipeVariable[]) => void;

  // Ejecución en vivo
  runId: string | null;
  runStatus: "idle" | "running" | "success" | "failed";
  runControlState: "idle" | "running" | "paused" | "stopping" | "waiting";
  runningNodeId: string | null;
  logs: ExecutionLog[];
  screenshots: ExecutionScreenshot[];

  // Métricas y estado por nodo individual
  nodeExecStatuses: Record<string, "idle" | "running" | "success" | "error">;
  nodeExecDurations: Record<string, number>;
  nodeExecErrors: Record<string, string>;
  disabledNodeIds: string[];
  setNodeExecState: (
    nodeId: string,
    status: "idle" | "running" | "success" | "error",
    durationMs?: number,
    error?: string
  ) => void;

  // Grabación en vivo (Recorder)
  isRecording: boolean;
  recordingSessionId: string | null;
  recordingMode: "browser" | "desktop";
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
  resetRecipe: () => void;
  setName: (name: string) => void;
  setDescription: (desc: string) => void;
  setActiveView: (view: EditorView) => void;
  setSelectedNodeId: (nodeId: string | null) => void;

  addNode: (type: RecipeNode["type"]) => string;
  updateNode: (id: string, updates: Partial<RecipeNode>) => void;
  deleteNode: (id: string) => void;
  duplicateNode: (id: string) => string;
  toggleNodeDisabled: (id: string) => void;
  reorderNodes: (orderedIds: string[]) => void;
  setEntryNode: (id: string) => void;
  reconcileRootInitializer: () => void;

  addEdge: (edge: RecipeEdge) => void;
  removeEdge: (from: string, to: string, handle?: string) => void;
  setBranchTarget: (
    nodeId: string,
    handle: "try" | "catch" | "finally" | "body",
    targetId: string | undefined
  ) => void;

  setDefinitionFromCode: (dsl: RecipeDsl) => void;
  undo: () => void;
  redo: () => void;

  // Control de Ejecución
  startRun: (runId: string) => void;
  setRunningNodeId: (nodeId: string | null) => void;
  setRunControlState: (state: "idle" | "running" | "paused" | "stopping" | "waiting") => void;
  addLog: (log: Omit<ExecutionLog, "id" | "timestamp">) => void;
  addScreenshot: (screenshot: Omit<ExecutionScreenshot, "id" | "timestamp">) => void;
  finishRun: (status: "success" | "failed") => void;
  clearRunState: () => void;

  // Salidas y contexto de nodos probados/ejecutados
  nodeOutputs: Record<string, unknown>;
  setNodeOutput: (nodeId: string, output: unknown) => void;
  updateNodePosition: (id: string, position: { x: number; y: number }) => void;

  // Grabación en vivo
  startRecording: (sessionId: string, mode?: "browser" | "desktop") => void;
  stopRecording: () => void;
  appendRecordedAction: (action: {
    type: string;
    locator?: any;
    params?: any;
    url?: string;
    description?: string;
    preview?: any;
  }) => void;
}

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

const initialDefinition = createInitialDefinition();
const initialValidation = validateDsl(initialDefinition);

export const useRecipeStore = create<RecipeStoreState>((set, get) => ({
  recipeId: null,
  recipeName: "Nueva Receta RPA",
  recipeDescription: "",
  recipeVersion: 1,
  definition: initialDefinition,
  validationErrors: initialValidation.errors,
  nodeIssues: initialValidation.nodeIssues,
  selectedNodeId: "step_navigate",
  selectedNodeIds: ["step_navigate"],
  isTestingSteps: false,
  testingStepsProgress: null,
  activeView: "canvas",
  isDirty: false,

  activeDetailNodeId: null,
  openNodeDetail: (nodeId) =>
    set({
      activeDetailNodeId: nodeId,
      selectedNodeId: nodeId,
      selectedNodeIds: [nodeId],
    }),
  closeNodeDetail: () => set({ activeDetailNodeId: null }),

  runId: null,
  runStatus: "idle",
  runControlState: "idle",
  runningNodeId: null,
  logs: [],
  screenshots: [],

  nodeExecStatuses: {},
  nodeExecDurations: {},
  nodeExecErrors: {},
  disabledNodeIds: [],
  setNodeExecState: (nodeId, status, durationMs, error) =>
    set((state) => ({
      nodeExecStatuses: { ...state.nodeExecStatuses, [nodeId]: status },
      nodeExecDurations:
        durationMs !== undefined
          ? { ...state.nodeExecDurations, [nodeId]: durationMs }
          : state.nodeExecDurations,
      nodeExecErrors:
        error !== undefined
          ? { ...state.nodeExecErrors, [nodeId]: error }
          : status === "running" || status === "success"
          ? { ...state.nodeExecErrors, [nodeId]: "" }
          : state.nodeExecErrors,
    })),

  isRecording: false,
  recordingSessionId: null,
  recordingMode: "browser",
  recordedActionsCount: 0,

  nodeOutputs: {},

  history: [JSON.parse(JSON.stringify(createInitialDefinition()))],
  historyIndex: 0,

  setRecipe: ({ id, name, description, version, definition }) => {
    const rawDef = definition || createInitialDefinition();
    // Reconciliar automáticamente el nodo inicializador raíz como principal (entry)
    const safeDef = reconcileRecipeRoot(rawDef);
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
      selectedNodeIds: safeDef.entry
        ? [safeDef.entry]
        : Object.keys(safeDef.nodes || {})[0]
        ? [Object.keys(safeDef.nodes || {})[0]]
        : [],
      history: [JSON.parse(JSON.stringify(safeDef))],
      historyIndex: 0,
      isDirty: false,
    });
  },

  resetRecipe: () => {
    const definition = createInitialDefinition();
    const { errors, nodeIssues } = validateDsl(definition);
    set({
      recipeId: null,
      recipeName: "Nueva Receta RPA",
      recipeDescription: "",
      recipeVersion: 1,
      definition,
      validationErrors: errors || [],
      nodeIssues: nodeIssues || {},
      selectedNodeId: definition.entry || null,
      selectedNodeIds: definition.entry ? [definition.entry] : [],
      activeDetailNodeId: null,
      history: [JSON.parse(JSON.stringify(definition))],
      historyIndex: 0,
      isDirty: false,
      runId: null,
      runStatus: "idle",
      runControlState: "idle",
      runningNodeId: null,
      logs: [],
      screenshots: [],
      nodeExecStatuses: {},
      nodeExecDurations: {},
      nodeExecErrors: {},
      nodeOutputs: {},
    });
  },

  reconcileRootInitializer: () => {
    const { definition, history, historyIndex } = get();
    const reconciled = reconcileRecipeRoot(definition);
    if (reconciled.entry !== definition.entry) {
      const { errors, nodeIssues } = validateDsl(reconciled);
      const hist = pushHistory(history, historyIndex, reconciled);
      set({
        definition: reconciled,
        validationErrors: errors,
        nodeIssues,
        isDirty: true,
        ...hist,
      });
    }
  },

  setName: (recipeName) => set({ recipeName, isDirty: true }),
  setDescription: (recipeDescription) => set({ recipeDescription, isDirty: true }),
  setActiveView: (activeView) => set({ activeView }),
  setSelectedNodeId: (selectedNodeId) =>
    set({
      selectedNodeId,
      selectedNodeIds: selectedNodeId ? [selectedNodeId] : [],
    }),

  setSelectedNodeIds: (selectedNodeIds) =>
    set({
      selectedNodeIds,
      selectedNodeId:
        selectedNodeIds.length > 0 ? selectedNodeIds[selectedNodeIds.length - 1] : null,
    }),

  toggleNodeSelection: (id, multi = false) => {
    const { selectedNodeIds } = get();
    if (!multi) {
      set({
        selectedNodeId: id,
        selectedNodeIds: [id],
      });
      return;
    }
    const exists = selectedNodeIds.includes(id);
    const nextIds = exists
      ? selectedNodeIds.filter((item) => item !== id)
      : [...selectedNodeIds, id];
    set({
      selectedNodeIds: nextIds,
      selectedNodeId: nextIds.length > 0 ? nextIds[nextIds.length - 1] : null,
    });
  },

  clearSelection: () => set({ selectedNodeId: null, selectedNodeIds: [] }),

  setIsTestingSteps: (isTestingSteps, testingStepsProgress = null) =>
    set({ isTestingSteps, testingStepsProgress }),

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

    const isTrigger = type === "webhook";

    if (!newEntry || !updatedNodes[newEntry] || Object.keys(definition.nodes).length === 0) {
      newEntry = newId;
    } else if (!isTrigger) {
      // Conectar automáticamente desde el nodo seleccionado si existe y no tiene 'next',
      // o desde el último nodo disponible sin 'next' (excepto para triggers como webhook)
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

    const rawDsl: RecipeDsl = {
      ...definition,
      entry: newEntry,
      nodes: updatedNodes,
      edges: updatedEdges,
    };

    const updatedDsl = reconcileRecipeRoot(rawDsl);
    const { errors, nodeIssues } = validateDsl(updatedDsl);
    const hist = pushHistory(history, historyIndex, updatedDsl);

    set({
      definition: updatedDsl,
      validationErrors: errors,
      nodeIssues,
      selectedNodeId: newId,
      selectedNodeIds: [newId],
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

    // Limpiar todas las referencias (continuación y ramas) hacia este nodo
    for (const key of Object.keys(nextNodes)) {
      const targetNode = nextNodes[key] as any;
      let changed = false;
      const cloned: any = { ...targetNode };

      if (cloned.next === id) {
        cloned.next = undefined;
        changed = true;
      }

      if (cloned.params && typeof cloned.params === "object") {
        const params = { ...cloned.params };
        for (const paramKey of BRANCH_PARAM_KEYS) {
          if (params[paramKey] === id) {
            params[paramKey] =
              paramKey === "elseNodeId" || paramKey === "finallyEntryNodeId"
                ? undefined
                : "";
            changed = true;
          }
        }
        if (changed) {
          cloned.params = params;
        }
      }

      if (changed) {
        nextNodes[key] = cloned;
      }
    }

    const nextEdges = definition.edges.filter((e) => e.from !== id && e.to !== id);

    let nextEntry = definition.entry;
    if (nextEntry === id || !nextNodes[nextEntry]) {
      nextEntry = Object.keys(nextNodes)[0] || "";
    }

    const rawDsl: RecipeDsl = {
      ...definition,
      entry: nextEntry,
      nodes: nextNodes,
      edges: nextEdges,
    };

    // Reconciliar si el nodo eliminado era entry para priorizar otro inicializador raíz
    const updatedDsl = reconcileRecipeRoot(rawDsl);
    const { errors, nodeIssues } = validateDsl(updatedDsl);
    const hist = pushHistory(history, historyIndex, updatedDsl);

    const { activeDetailNodeId, selectedNodeIds } = get();

    set({
      definition: updatedDsl,
      validationErrors: errors,
      nodeIssues,
      selectedNodeId: selectedNodeId === id ? (updatedDsl.entry || null) : selectedNodeId,
      selectedNodeIds: selectedNodeIds.filter((item) => item !== id),
      activeDetailNodeId: activeDetailNodeId === id ? null : activeDetailNodeId,
      isDirty: true,
      ...hist,
    });
  },

  duplicateNode: (id) => {
    const { definition, history, historyIndex } = get();
    const sourceNode = definition.nodes[id];
    if (!sourceNode) return id;

    const newId = `${sourceNode.type}_${Math.random().toString(36).substring(2, 7)}`;
    const clonedNode: RecipeNode = JSON.parse(JSON.stringify(sourceNode));
    clonedNode.id = newId;
    clonedNode.description = `${sourceNode.description || sourceNode.type} (Copia)`;
    clonedNode.next = undefined;
    if (clonedNode.position) {
      clonedNode.position = {
        x: clonedNode.position.x + 40,
        y: clonedNode.position.y + 40,
      };
    }

    const updatedNodes = { ...definition.nodes, [newId]: clonedNode };
    const updatedDsl: RecipeDsl = {
      ...definition,
      nodes: updatedNodes,
    };

    const { errors, nodeIssues } = validateDsl(updatedDsl);
    const hist = pushHistory(history, historyIndex, updatedDsl);

    set({
      definition: updatedDsl,
      validationErrors: errors,
      nodeIssues,
      selectedNodeId: newId,
      selectedNodeIds: [newId],
      activeDetailNodeId: newId,
      isDirty: true,
      ...hist,
    });

    return newId;
  },

  toggleNodeDisabled: (id) => {
    set((state) => {
      const exists = state.disabledNodeIds.includes(id);
      return {
        disabledNodeIds: exists
          ? state.disabledNodeIds.filter((x) => x !== id)
          : [...state.disabledNodeIds, id],
      };
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

    const targetEntry = orderedIds[0] || definition.entry || Object.keys(newNodes)[0] || "";
    const updatedDsl: RecipeDsl = reconcileRecipeRoot({
      ...definition,
      entry: targetEntry,
      nodes: newNodes,
      edges: newEdges,
    });

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
    if (!id || !definition.nodes[id]) return;

    const updatedDsl = { ...definition, entry: id };
    const { errors, nodeIssues } = validateDsl(updatedDsl);
    const hist = pushHistory(history, historyIndex, updatedDsl);

    set({
      definition: updatedDsl,
      validationErrors: errors,
      nodeIssues,
      selectedNodeId: id,
      selectedNodeIds: [id],
      isDirty: true,
      ...hist,
    });
  },

  addEdge: (edge) => {
    const { definition, history, historyIndex } = get();
    const updatedDsl = applyEdgeToDefinition(definition, edge);
    if (!updatedDsl) return;

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

  removeEdge: (from, to, handle) => {
    const { definition, history, historyIndex } = get();
    const sourceNode = definition.nodes[from];
    const updatedNodes = { ...definition.nodes };

    if (sourceNode) {
      const cloned: any = { ...sourceNode };
      let changed = false;

      if (handle === undefined && cloned.next === to) {
        cloned.next = undefined;
        changed = true;
      }

      const branchKeyByHandle: Record<string, string> = {
        then: "thenNodeId",
        else: "elseNodeId",
        body: "bodyEntryNodeId",
        try: "tryEntryNodeId",
        catch: "catchEntryNodeId",
        finally: "finallyEntryNodeId",
      };

      if (cloned.params && typeof cloned.params === "object") {
        const params = { ...cloned.params };
        const keysToCheck = handle
          ? [branchKeyByHandle[handle]].filter(Boolean)
          : [...BRANCH_PARAM_KEYS];

        for (const key of keysToCheck) {
          if (params[key] === to) {
            params[key] =
              key === "elseNodeId" || key === "finallyEntryNodeId" ? undefined : "";
            changed = true;
          }
        }

        if (changed) {
          cloned.params = params;
        }
      }

      if (changed) {
        updatedNodes[from] = cloned as RecipeNode;
      }
    }

    const updatedDsl: RecipeDsl = {
      ...definition,
      nodes: updatedNodes,
      edges: definition.edges.filter(
        (e) =>
          !(
            e.from === from &&
            e.to === to &&
            (handle === undefined || edgeHandle(e) === handle)
          )
      ),
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

  setBranchTarget: (nodeId, handle, targetId) => {
    const { definition, history, historyIndex } = get();
    const sourceNode = definition.nodes[nodeId];
    const isTryCatchHandle =
      handle === "try" || handle === "catch" || handle === "finally";

    if (!sourceNode) return;
    if (isTryCatchHandle && sourceNode.type !== "tryCatch") return;
    if (handle === "body" && sourceNode.type !== "loop") return;

    const paramKey = `${handle}EntryNodeId`;
    const params = {
      ...sourceNode.params,
      [paramKey]: targetId,
    } as any;

    if (targetId === undefined) {
      params[paramKey] = undefined;
    }

    const updatedDsl: RecipeDsl = {
      ...definition,
      nodes: {
        ...definition.nodes,
        [nodeId]: { ...sourceNode, params },
      },
      edges: [
        ...definition.edges.filter(
          (e) => !(e.from === nodeId && edgeHandle(e) === handle)
        ),
        ...(targetId
          ? [{ from: nodeId, to: targetId, label: handle }]
          : []),
      ],
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

  setRecipeVariables: (variables) => {
    const { definition, history, historyIndex } = get();
    const updatedDsl: RecipeDsl = {
      ...definition,
      variables,
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

  startRecording: (recordingSessionId: string, recordingMode: "browser" | "desktop" = "browser") => {
    set({
      isRecording: true,
      recordingSessionId,
      recordingMode,
      recordedActionsCount: 0,
    });
  },

  stopRecording: () => {
    set({
      isRecording: false,
      recordingSessionId: null,
      recordingMode: "browser",
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
      preview: action.preview,
    } as RecipeNode;

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
      selectedNodeIds: [newId],
      isDirty: true,
      recordedActionsCount: recordedActionsCount + 1,
      ...hist,
    });
  },
}));
