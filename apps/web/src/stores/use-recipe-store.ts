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
  dbId?: number | string;
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
  artifactKey?: string;
}

export interface ExecutionStepRecord {
  nodeId: string;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  durationMs?: number | null;
  locatorStrategy?: string | null;
  locatorValue?: string | null;
  output?: unknown;
  screenshotPath?: string | null;
  screenshotUrl?: string | null;
  errorMessage?: string | null;
}

export type ConsoleTab = "executions" | "result" | "logs" | "screenshots";

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
  runTrigger: string | null;
  runVersion: number | null;
  runIsDraft: boolean;
  runParameters: Record<string, unknown> | null;
  runResult: Record<string, unknown> | null;
  runDurationMs: number | null;
  runErrorMessage: string | null;
  runSteps: ExecutionStepRecord[];
  consoleOpen: boolean;
  consoleTab: ConsoleTab;

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

  // Modo de edición y publicación
  editorMode: "edit" | "published";
  publishedVersion: {
    id?: string;
    version: number;
    definition?: RecipeDsl;
    changelog?: string;
    published_at?: string;
  } | null;
  hasUnpublishedChanges: boolean;
  draftDefinition: RecipeDsl | null;
  viewingVersion: {
    version: number;
    definition: RecipeDsl;
    changelog?: string;
  } | null;

  setEditorMode: (mode: "edit" | "published") => void;
  setPublishedVersion: (pub: {
    id?: string;
    version: number;
    definition?: RecipeDsl;
    changelog?: string;
    published_at?: string;
  } | null) => void;
  setHasUnpublishedChanges: (hasChanges: boolean) => void;
  setViewingVersion: (versionData: {
    version: number;
    definition: RecipeDsl;
    changelog?: string;
  } | null) => void;

  // Acciones
  setRecipe: (data: {
    id: string;
    name: string;
    description?: string;
    version: number;
    definition: RecipeDsl;
    publishedVersion?: {
      id?: string;
      version: number;
      definition?: RecipeDsl;
      changelog?: string;
      published_at?: string;
    } | null;
    hasUnpublishedChanges?: boolean;
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
  setConsoleOpen: (open: boolean) => void;
  setConsoleTab: (tab: ConsoleTab) => void;
  attachRun: (
    runId: string,
    opts?: {
      trigger?: string | null;
      version?: number | null;
      isDraft?: boolean;
      status?: "running" | "success" | "failed";
      controlState?: "idle" | "running" | "paused" | "stopping" | "waiting";
      openConsole?: boolean;
      consoleTab?: ConsoleTab;
      initialMessage?: string;
    }
  ) => void;
  setRunMeta: (meta: {
    trigger?: string | null;
    version?: number | null;
    isDraft?: boolean;
    parameters?: Record<string, unknown> | null;
    result?: Record<string, unknown> | null;
    durationMs?: number | null;
    errorMessage?: string | null;
    status?: "idle" | "running" | "success" | "failed";
    controlState?: "idle" | "running" | "paused" | "stopping" | "waiting";
  }) => void;
  upsertRunStep: (step: ExecutionStepRecord) => void;
  hydrateRunLogs: (entries: ExecutionLog[]) => void;
  hydrateRunScreenshots: (items: Array<Omit<ExecutionScreenshot, "id" | "timestamp"> & { timestamp?: string }>) => void;
  setRunningNodeId: (nodeId: string | null) => void;
  setRunControlState: (state: "idle" | "running" | "paused" | "stopping" | "waiting") => void;
  addLog: (log: Omit<ExecutionLog, "id" | "timestamp">) => void;
  addScreenshot: (screenshot: Omit<ExecutionScreenshot, "id" | "timestamp"> & { timestamp?: string }) => void;
  finishRun: (status: "success" | "failed", errorMessage?: string) => void;
  clearRunState: () => void;

  // Salidas y contexto de nodos probados/ejecutados
  nodeOutputs: Record<string, unknown>;
  setNodeOutput: (nodeId: string, output: unknown) => void;
  updateNodePosition: (id: string, position: { x: number; y: number }) => void;

  // Grabación en vivo
  startRecording: (sessionId: string, mode?: string) => void;
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
  runTrigger: null,
  runVersion: null,
  runIsDraft: false,
  runParameters: null,
  runResult: null,
  runDurationMs: null,
  runErrorMessage: null,
  runSteps: [],
  consoleOpen: false,
  consoleTab: "logs",

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

  editorMode: "edit",
  publishedVersion: null,
  hasUnpublishedChanges: false,
  draftDefinition: null,
  viewingVersion: null,

  setEditorMode: (mode) => {
    const state = get();
    if (state.editorMode === mode) return;

    if (mode === "published") {
      const draftDef = state.draftDefinition || state.definition;
      const pubDef = state.publishedVersion?.definition;
      if (pubDef) {
        const safeDef = reconcileRecipeRoot(pubDef);
        const { errors, nodeIssues } = validateDsl(safeDef);
        set({
          editorMode: "published",
          draftDefinition: draftDef,
          definition: safeDef,
          validationErrors: errors || [],
          nodeIssues: nodeIssues || {},
          viewingVersion: null,
          selectedNodeId: safeDef.entry || Object.keys(safeDef.nodes || {})[0] || null,
        });
      } else {
        set({ editorMode: "published", draftDefinition: draftDef, viewingVersion: null });
      }
    } else {
      // Volver a modo edición
      const restoredDraft = state.draftDefinition || state.definition;
      const safeDef = reconcileRecipeRoot(restoredDraft);
      const { errors, nodeIssues } = validateDsl(safeDef);
      set({
        editorMode: "edit",
        definition: safeDef,
        validationErrors: errors || [],
        nodeIssues: nodeIssues || {},
        viewingVersion: null,
        selectedNodeId: safeDef.entry || Object.keys(safeDef.nodes || {})[0] || null,
      });
    }
  },

  setPublishedVersion: (pub) => {
    set({ publishedVersion: pub });
  },

  setHasUnpublishedChanges: (hasChanges) => {
    set({ hasUnpublishedChanges: hasChanges });
  },

  setViewingVersion: (versionData) => {
    const state = get();
    if (versionData) {
      const draftDef = state.draftDefinition || state.definition;
      const safeDef = reconcileRecipeRoot(versionData.definition);
      const { errors, nodeIssues } = validateDsl(safeDef);
      set({
        viewingVersion: versionData,
        draftDefinition: draftDef,
        definition: safeDef,
        validationErrors: errors || [],
        nodeIssues: nodeIssues || {},
        selectedNodeId: safeDef.entry || Object.keys(safeDef.nodes || {})[0] || null,
      });
    } else {
      const restoredDraft = state.draftDefinition || state.definition;
      const safeDef = reconcileRecipeRoot(restoredDraft);
      const { errors, nodeIssues } = validateDsl(safeDef);
      set({
        viewingVersion: null,
        definition: safeDef,
        validationErrors: errors || [],
        nodeIssues: nodeIssues || {},
        selectedNodeId: safeDef.entry || Object.keys(safeDef.nodes || {})[0] || null,
      });
    }
  },

  setRecipe: ({ id, name, description, version, definition, publishedVersion, hasUnpublishedChanges }) => {
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
      editorMode: "edit",
      publishedVersion: publishedVersion !== undefined ? publishedVersion : get().publishedVersion,
      hasUnpublishedChanges: hasUnpublishedChanges !== undefined ? hasUnpublishedChanges : false,
      draftDefinition: safeDef,
      viewingVersion: null,
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
      editorMode: "edit",
      publishedVersion: null,
      hasUnpublishedChanges: false,
      draftDefinition: null,
      viewingVersion: null,
      runId: null,
      runStatus: "idle",
      runControlState: "idle",
      runningNodeId: null,
      logs: [],
      screenshots: [],
      runTrigger: null,
      runVersion: null,
      runIsDraft: false,
      runParameters: null,
      runResult: null,
      runDurationMs: null,
      runErrorMessage: null,
      runSteps: [],
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
    if (get().editorMode === "published" || get().viewingVersion !== null) return "";
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
      hasUnpublishedChanges: true,
      draftDefinition: updatedDsl,
      ...hist,
    });

    return newId;
  },

  updateNode: (id, updates) => {
    if (get().editorMode === "published" || get().viewingVersion !== null) return;
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
      hasUnpublishedChanges: true,
      draftDefinition: updatedDsl,
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
    if (get().editorMode === "published" || get().viewingVersion !== null) return;
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
    if (get().editorMode === "published" || get().viewingVersion !== null) return "";
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
      hasUnpublishedChanges: true,
      draftDefinition: updatedDsl,
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
    if (get().editorMode === "published" || get().viewingVersion !== null) return;
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
      hasUnpublishedChanges: true,
      draftDefinition: updatedDsl,
      ...hist,
    });
  },

  removeEdge: (from, to, handle) => {
    if (get().editorMode === "published" || get().viewingVersion !== null) return;
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
      hasUnpublishedChanges: true,
      draftDefinition: updatedDsl,
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
      hasUnpublishedChanges: true,
      draftDefinition: updatedDsl,
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

  setConsoleOpen: (consoleOpen) => set({ consoleOpen }),
  setConsoleTab: (consoleTab) => set({ consoleTab }),

  attachRun: (runId, opts) => {
    const nextStatus = opts?.status ?? "running";
    const nextControl =
      opts?.controlState ?? (nextStatus === "running" ? "running" : "idle");
    const initialLogs: ExecutionLog[] = opts?.initialMessage
      ? [
          {
            id: Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toLocaleTimeString(),
            level: "info",
            source: "runner",
            message: opts.initialMessage,
          },
        ]
      : [];

    set((state) => ({
      runId,
      runStatus: nextStatus,
      runControlState: nextControl,
      runningNodeId: null,
      logs: initialLogs,
      screenshots: [],
      runTrigger: opts?.trigger ?? null,
      runVersion: opts?.version ?? null,
      runIsDraft: opts?.isDraft ?? false,
      runParameters: null,
      runResult: null,
      runDurationMs: null,
      runErrorMessage: null,
      runSteps: [],
      nodeExecStatuses: {},
      nodeExecDurations: {},
      nodeExecErrors: {},
      nodeOutputs: {},
      consoleOpen: opts?.openConsole !== undefined ? opts.openConsole : true,
      consoleTab: opts?.consoleTab ?? state.consoleTab,
    }));
  },

  setRunMeta: (meta) => {
    set((state) => ({
      runTrigger: meta.trigger !== undefined ? meta.trigger : state.runTrigger,
      runVersion: meta.version !== undefined ? meta.version : state.runVersion,
      runIsDraft: meta.isDraft !== undefined ? meta.isDraft : state.runIsDraft,
      runParameters: meta.parameters !== undefined ? meta.parameters : state.runParameters,
      runResult: meta.result !== undefined ? meta.result : state.runResult,
      runDurationMs: meta.durationMs !== undefined ? meta.durationMs : state.runDurationMs,
      runErrorMessage:
        meta.errorMessage !== undefined ? meta.errorMessage : state.runErrorMessage,
      runStatus: meta.status !== undefined ? meta.status : state.runStatus,
      runControlState:
        meta.controlState !== undefined ? meta.controlState : state.runControlState,
    }));
  },

  upsertRunStep: (step) => {
    set((state) => {
      const idx = state.runSteps.findIndex((s) => s.nodeId === step.nodeId);
      const existing = idx >= 0 ? state.runSteps[idx] : undefined;
      const merged: ExecutionStepRecord = {
        nodeId: step.nodeId,
        status: step.status,
        durationMs: step.durationMs !== undefined ? step.durationMs : existing?.durationMs,
        locatorStrategy:
          step.locatorStrategy !== undefined
            ? step.locatorStrategy
            : existing?.locatorStrategy,
        locatorValue:
          step.locatorValue !== undefined ? step.locatorValue : existing?.locatorValue,
        output: step.output !== undefined ? step.output : existing?.output,
        screenshotPath:
          step.screenshotPath !== undefined
            ? step.screenshotPath
            : existing?.screenshotPath,
        screenshotUrl:
          step.screenshotUrl !== undefined ? step.screenshotUrl : existing?.screenshotUrl,
        errorMessage:
          step.errorMessage !== undefined
            ? step.errorMessage
            : step.status === "running" || step.status === "success"
            ? null
            : existing?.errorMessage,
      };

      const nextSteps = [...state.runSteps];
      if (idx >= 0) {
        nextSteps[idx] = merged;
      } else {
        nextSteps.push(merged);
      }

      const mappedExecStatus: "idle" | "running" | "success" | "error" =
        merged.status === "failed"
          ? "error"
          : merged.status === "success"
          ? "success"
          : merged.status === "running"
          ? "running"
          : "idle";

      const nextOutputs =
        merged.output !== undefined
          ? { ...state.nodeOutputs, [step.nodeId]: merged.output }
          : state.nodeOutputs;

      return {
        runSteps: nextSteps,
        nodeExecStatuses: {
          ...state.nodeExecStatuses,
          [step.nodeId]: mappedExecStatus,
        },
        nodeExecDurations:
          typeof merged.durationMs === "number"
            ? { ...state.nodeExecDurations, [step.nodeId]: merged.durationMs }
            : state.nodeExecDurations,
        nodeExecErrors:
          merged.errorMessage
            ? { ...state.nodeExecErrors, [step.nodeId]: merged.errorMessage }
            : merged.status === "running" || merged.status === "success"
            ? { ...state.nodeExecErrors, [step.nodeId]: "" }
            : state.nodeExecErrors,
        nodeOutputs: nextOutputs,
      };
    });
  },

  hydrateRunLogs: (entries) => {
    set((state) => {
      if (entries.length === 0) return state;

      const makeKey = (entry: ExecutionLog) =>
        `${entry.nodeId || ""}|${entry.level}|${entry.message}`;

      const incomingCounts = new Map<string, number>();
      for (const entry of entries) {
        const k = makeKey(entry);
        incomingCounts.set(k, (incomingCounts.get(k) || 0) + 1);
      }

      const retainedLocalLogs: ExecutionLog[] = [];
      for (const log of state.logs) {
        if (log.dbId !== undefined) continue;
        const k = makeKey(log);
        const remaining = incomingCounts.get(k) || 0;
        if (remaining > 0) {
          incomingCounts.set(k, remaining - 1);
          continue;
        }
        retainedLocalLogs.push(log);
      }

      return {
        logs: [...retainedLocalLogs, ...entries],
      };
    });
  },

  hydrateRunScreenshots: (items) => {
    set((state) => {
      if (items.length === 0) return state;
      const next = [...state.screenshots];
      const existingKeys = new Set(
        next.map((s) => s.artifactKey || s.url.split("?")[0])
      );
      let changed = false;

      for (const item of items) {
        const key = item.artifactKey || item.url.split("?")[0];
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);
        next.push({
          ...item,
          artifactKey: key,
          id: Math.random().toString(36).substring(2, 9),
          timestamp: item.timestamp || new Date().toLocaleTimeString(),
        });
        changed = true;
      }

      return changed ? { screenshots: next } : state;
    });
  },

  startRun: (runId) => {
    const state = get();
    const isPublished = state.editorMode === "published";
    set({
      runId,
      runStatus: "running",
      runControlState: "running",
      runningNodeId: null,
      runTrigger: "manual",
      runVersion: isPublished ? (state.publishedVersion?.version ?? null) : 0,
      runIsDraft: !isPublished,
      runParameters: null,
      runResult: null,
      runDurationMs: null,
      runErrorMessage: null,
      runSteps: [],
      nodeExecStatuses: {},
      nodeExecDurations: {},
      nodeExecErrors: {},
      consoleOpen: true,
      logs: [
        {
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          level: "info",
          source: "runner",
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
    const key = screenshot.artifactKey || screenshot.url.split("?")[0];
    set((state) => {
      const exists = state.screenshots.some(
        (s) => (s.artifactKey || s.url.split("?")[0]) === key
      );
      if (exists) return state;
      return {
        screenshots: [
          ...state.screenshots,
          {
            ...screenshot,
            artifactKey: key,
            id: Math.random().toString(36).substring(2, 9),
            timestamp: screenshot.timestamp || new Date().toLocaleTimeString(),
          },
        ],
      };
    });
  },

  finishRun: (status, errorMessage) => {
    set((state) => ({
      runStatus: status,
      runControlState: "idle",
      runningNodeId: null,
      runErrorMessage:
        errorMessage !== undefined ? errorMessage : state.runErrorMessage,
      logs: [
        ...state.logs,
        {
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          level: status === "success" ? "success" : "error",
          source: "runner",
          message:
            status === "success"
              ? "✓ Receta completada con éxito."
              : errorMessage
              ? `✗ La ejecución falló: ${errorMessage}`
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
      runTrigger: null,
      runVersion: null,
      runIsDraft: false,
      runParameters: null,
      runResult: null,
      runDurationMs: null,
      runErrorMessage: null,
      runSteps: [],
      nodeExecStatuses: {},
      nodeExecDurations: {},
      nodeExecErrors: {},
      nodeOutputs: {},
    });
  },

  startRecording: (recordingSessionId: string) => {
    set({
      isRecording: true,
      recordingSessionId,
      recordingMode: "browser",
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
    const nodeKeys = Object.keys(definition.nodes);
    const lastKey = nodeKeys.length > 0 ? nodeKeys[nodeKeys.length - 1] : undefined;
    const lastNode = lastKey ? definition.nodes[lastKey] : undefined;

    // 1. Fusión inteligente de tipeo consecutivo en el mismo campo
    if (type === "type" && lastKey && lastNode && lastNode.type === "type") {
      const sameLocator =
        Boolean(action.locator?.primary?.value) &&
        action.locator?.primary?.value === lastNode.locator?.primary?.value;

      if (sameLocator) {
        const updatedNode: RecipeNode = {
          ...lastNode,
          params: {
            ...lastNode.params,
            text: action.params?.text ?? (lastNode.params as any).text,
            pressEnter: Boolean(action.params?.pressEnter || (lastNode.params as any).pressEnter),
          },
          description: action.description || lastNode.description,
          preview: action.preview || lastNode.preview,
        };

        const updatedNodes = {
          ...definition.nodes,
          [lastKey]: updatedNode,
        };

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
          isDirty: true,
          ...hist,
        });
        return;
      }
    }

    // 2. Fusión acumulativa de desplazamientos (scroll) consecutivos por coordenadas
    if (
      type === "scroll" &&
      action.params?.mode === "coordinates" &&
      lastKey &&
      lastNode &&
      lastNode.type === "scroll" &&
      lastNode.params?.mode === "coordinates"
    ) {
      const prevY = typeof lastNode.params?.y === "number" ? lastNode.params.y : 0;
      const newDeltaY = typeof action.params?.y === "number" ? Number(action.params.y) : 0;
      const totalY = prevY + newDeltaY;
      const isDown = totalY >= 0;

      const updatedNode: RecipeNode = {
        ...lastNode,
        params: {
          ...lastNode.params,
          y: totalY,
          x: (lastNode.params.x || 0) + (Number(action.params?.x) || 0),
        },
        description: `Desplazar hacia ${isDown ? "abajo" : "arriba"} (${Math.abs(totalY)}px)`,
        preview: action.preview || lastNode.preview,
      };

      const updatedNodes = {
        ...definition.nodes,
        [lastKey]: updatedNode,
      };

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
        isDirty: true,
        ...hist,
      });
      return;
    }

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
    } else if (lastKey) {
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
