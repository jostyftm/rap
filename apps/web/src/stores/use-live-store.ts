import { create } from "zustand";
import type { LocatorCandidate, RecipeNode } from "@rpa/dsl";
import { calculateLocatorScore } from "@rpa/locator";
import { apiFetch } from "../lib/api-client";
import { useRecipeStore } from "./use-recipe-store";

export type LiveKind = "embedded" | "external";
export type LiveStatus = "idle" | "starting" | "ready" | "error";

export interface PickCandidate extends LocatorCandidate {
  unique?: boolean;
}

export interface LivePick {
  nodeId: string;
  element: {
    tag: string;
    text: string;
    attrs: Record<string, string>;
    isInput: boolean;
    isSelect: boolean;
    role: string | null;
  };
  candidates: PickCandidate[];
  url: string;
}

export interface LiveExecResult {
  nodeId: string;
  ok: boolean;
  error?: string;
  strategy?: string;
  output?: unknown;
}

interface LiveState {
  isOpen: boolean;
  status: LiveStatus;
  kind: LiveKind;
  sessionId: string | null;
  proxyUrl: string | null;
  currentUrl: string;
  pageTitle: string;
  armedNodeId: string | null;
  pendingArmNodeId: string | null;
  lastPick: LivePick | null;
  execResults: Record<string, LiveExecResult>;
  error: string | null;

  /** Registrado por el panel: envía un mensaje al sitio (iframe o Chromium externo) */
  sender: ((msg: Record<string, unknown>) => void) | null;
  setSender: (fn: LiveState["sender"]) => void;

  open: () => void;
  close: (recipeId: string | null) => Promise<void>;
  startEmbedded: (recipeId: string, url: string) => Promise<void>;
  startExternal: (recipeId: string, url: string) => Promise<void>;
  handleMessage: (msg: any) => void;

  arm: (nodeId: string) => void;
  disarm: () => void;
  openAndArm: (nodeId: string) => void;
  exec: (node: RecipeNode, timeoutMs?: number) => Promise<LiveExecResult>;
  locate: (node: RecipeNode) => void;
  applyCandidates: (nodeId: string, primary: PickCandidate, others: PickCandidate[]) => void;
}

function withScores(list: PickCandidate[]): LocatorCandidate[] {
  return list.map((c) => ({
    strategy: c.strategy,
    value: c.value,
    score: Math.max(
      0,
      Math.min(c.score, calculateLocatorScore(c.strategy, c.value) || c.score) - (c.unique === false ? 30 : 0)
    ),
  }));
}

const pendingExecResolvers = new Map<string, (res: LiveExecResult) => void>();

export const useLiveStore = create<LiveState>((set, get) => ({
  isOpen: false,
  status: "idle",
  kind: "embedded",
  sessionId: null,
  proxyUrl: null,
  currentUrl: "",
  pageTitle: "",
  armedNodeId: null,
  pendingArmNodeId: null,
  lastPick: null,
  execResults: {},
  error: null,
  sender: null,

  setSender: (fn) => {
    set({ sender: fn });
    if (fn && get().pendingArmNodeId) {
      const p = get().pendingArmNodeId!;
      set({ pendingArmNodeId: null });
      setTimeout(() => get().arm(p), 150);
    }
  },

  open: () => set({ isOpen: true }),

  close: async (recipeId) => {
    const { sessionId, kind } = get();
    if (recipeId && sessionId && kind === "external") {
      try {
        await apiFetch(`/api/v1/recipes/${recipeId}/live/stop`, {
          method: "POST",
          body: JSON.stringify({ session_id: sessionId }),
        });
      } catch {
        // ignorar
      }
    }
    set({
      isOpen: false,
      status: "idle",
      sessionId: null,
      proxyUrl: null,
      armedNodeId: null,
      pendingArmNodeId: null,
      sender: null,
      error: null,
    });
  },

  startEmbedded: async (recipeId, url) => {
    set({ status: "starting", error: null, kind: "embedded", armedNodeId: null });
    try {
      const res = await apiFetch<{ session_id: string; proxy_url: string; origin: string }>(
        `/api/v1/recipes/${recipeId}/live/start`,
        { method: "POST", body: JSON.stringify({ url }) }
      );
      set({
        status: "ready",
        sessionId: res.session_id,
        proxyUrl: res.proxy_url,
        currentUrl: url,
      });
    } catch (err: any) {
      set({ status: "error", error: err?.message || "No se pudo iniciar el sitio en vivo" });
    }
  },

  startExternal: async (recipeId, url) => {
    set({ status: "starting", error: null, kind: "external", armedNodeId: null, proxyUrl: null });
    try {
      const res = await apiFetch<{ session_id: string }>(
        `/api/v1/recipes/${recipeId}/live/external`,
        { method: "POST", body: JSON.stringify({ url }) }
      );
      set({ status: "ready", sessionId: res.session_id, currentUrl: url });
    } catch (err: any) {
      set({ status: "error", error: err?.message || "No se pudo abrir Chromium externo" });
    }
  },

  handleMessage: (msg) => {
    if (!msg || typeof msg.type !== "string") return;
    switch (msg.type) {
      case "rpa:navigated":
        set({ currentUrl: msg.url || get().currentUrl, pageTitle: msg.title ?? get().pageTitle });
        break;
      case "rpa:ready": {
        set({ currentUrl: msg.url || get().currentUrl, pageTitle: msg.title ?? get().pageTitle });
        const pending = get().pendingArmNodeId;
        if (pending) {
          set({ pendingArmNodeId: null });
          setTimeout(() => get().arm(pending), 150);
        }
        break;
      }
      case "rpa:closed":
        pendingExecResolvers.forEach((cb, key) => {
          cb({
            nodeId: key,
            ok: false,
            error: "Conexión con el navegador cerrada",
          });
        });
        pendingExecResolvers.clear();
        set({ status: "idle", sessionId: null, armedNodeId: null });
        break;
      case "rpa:disarmed":
        set({ armedNodeId: null });
        break;
      case "rpa:pick": {
        const pick = msg as LivePick;
        const nodeId = pick.nodeId;
        const scored = withScores(pick.candidates).sort((a, b) => b.score - a.score);
        const [primary, ...fallbacks] = scored;
        if (primary) {
          useRecipeStore.getState().updateNode(nodeId, {
            locator: {
              primary,
              fallbacks: fallbacks.slice(0, 4),
            },
          } as any);
        }
        set({ lastPick: { ...pick, candidates: scored }, armedNodeId: null });
        break;
      }
      case "rpa:exec:result": {
        const res: LiveExecResult = {
          nodeId: msg.nodeId,
          ok: !!msg.ok,
          error: msg.error,
          strategy: msg.strategy,
          output: msg.output,
        };
        set((s) => ({
          execResults: {
            ...s.execResults,
            [msg.nodeId]: res,
          },
        }));
        const resolver =
          (msg.reqId && pendingExecResolvers.get(msg.reqId)) ||
          pendingExecResolvers.get(msg.nodeId);
        if (resolver) {
          if (msg.reqId) pendingExecResolvers.delete(msg.reqId);
          pendingExecResolvers.delete(msg.nodeId);
          resolver(res);
        }
        break;
      }
    }
  },

  arm: (nodeId) => {
    const { sender } = get();
    if (!sender) return;
    sender({ type: "rpa:arm", nodeId });
    set({ armedNodeId: nodeId });
  },

  disarm: () => {
    get().sender?.({ type: "rpa:disarm" });
    set({ armedNodeId: null, pendingArmNodeId: null });
  },

  openAndArm: (nodeId) => {
    const { status, isOpen, arm } = get();
    if (isOpen && status === "ready") {
      arm(nodeId);
      return;
    }
    set({ isOpen: true, pendingArmNodeId: nodeId });
  },

  exec: (node, timeoutMs = 10000) => {
    const { sender, isOpen, status } = get();
    const n: any = node;

    if (!isOpen || status !== "ready" || !sender) {
      const errRes: LiveExecResult = {
        nodeId: node.id,
        ok: false,
        error: "Navegador no conectado o no listo para ejecutar comandos.",
      };
      set((s) => ({
        execResults: { ...s.execResults, [node.id]: errRes },
      }));
      return Promise.resolve(errRes);
    }

    set((s) => {
      const { [node.id]: _removed, ...rest } = s.execResults;
      return { execResults: rest };
    });

    const reqId = `${node.id}-${Date.now()}`;

    return new Promise<LiveExecResult>((resolve) => {
      let resolved = false;
      const timer = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        pendingExecResolvers.delete(node.id);
        pendingExecResolvers.delete(reqId);
        const timeoutRes: LiveExecResult = {
          nodeId: node.id,
          ok: false,
          error: `Tiempo de espera agotado (${Math.round(timeoutMs / 1000)}s) esperando respuesta del navegador`,
        };
        set((s) => ({
          execResults: { ...s.execResults, [node.id]: timeoutRes },
        }));
        resolve(timeoutRes);
      }, timeoutMs);

      const handler = (res: LiveExecResult) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        resolve(res);
      };

      pendingExecResolvers.set(node.id, handler);
      pendingExecResolvers.set(reqId, handler);

      sender({
        type: "rpa:exec",
        reqId,
        nodeId: node.id,
        action: node.type,
        locator: n.locator,
        params: n.params,
      });
    });
  },

  locate: (node) => {
    get().sender?.({ type: "rpa:locate", nodeId: node.id, locator: (node as any).locator });
  },

  applyCandidates: (nodeId, primary, others) => {
    const scored = withScores([primary, ...others]);
    useRecipeStore.getState().updateNode(nodeId, {
      locator: { primary: scored[0], fallbacks: scored.slice(1, 5) },
    } as any);
  },
}));
