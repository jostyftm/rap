import { create } from "zustand";
import type { LocatorCandidate, RecipeNode } from "@rpa/dsl";
import { calculateLocatorScore } from "@rpa/locator";
import { apiFetch } from "../lib/api-client";
import { useRecipeStore } from "./use-recipe-store";

export type LiveKind = "embedded" | "screencast" | "external";
export type LiveStatus = "idle" | "starting" | "ready" | "error";

export interface LiveViewport {
  width: number;
  height: number;
}

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
  wsUrl: string | null;
  viewport: LiveViewport;
  currentUrl: string;
  pageTitle: string;
  armedNodeId: string | null;
  pendingArmNodeId: string | null;
  lastPick: LivePick | null;
  execResults: Record<string, LiveExecResult>;
  error: string | null;

  /** Registrado por el panel/canvas: envía un mensaje al sitio (iframe, screencast o Chromium externo) */
  sender: ((msg: Record<string, unknown>) => void) | null;
  setSender: (fn: LiveState["sender"]) => void;

  open: () => void;
  close: (recipeId: string | null) => Promise<void>;
  startEmbedded: (recipeId: string, url: string) => Promise<void>;
  startScreencast: (recipeId: string, url: string, viewport?: LiveViewport) => Promise<void>;
  startExternal: (recipeId: string, url: string) => Promise<void>;
  handleMessage: (msg: any) => void;

  arm: (nodeId: string) => void;
  disarm: () => void;
  openAndArm: (nodeId: string) => void;
  exec: (node: RecipeNode, timeoutMs?: number) => Promise<LiveExecResult>;
  locate: (node: RecipeNode) => void;
  applyCandidates: (nodeId: string, primary: PickCandidate, others: PickCandidate[]) => void;
}

export function normalizeLiveUrl(url: string): string {
  let cleanUrl = url.trim();
  if (cleanUrl && !/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(cleanUrl)) {
    cleanUrl = `https://${cleanUrl}`;
  }
  return cleanUrl;
}

export function resolveScreencastWsUrl(res: {
  ws_url?: string;
  ws_path?: string;
  ws_port?: number;
}): string {
  if (res.ws_path && typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = process.env.NEXT_PUBLIC_LIVE_HOST || window.location.hostname || "localhost";
    const port = process.env.NEXT_PUBLIC_LIVE_PORT || String(res.ws_port || 8085);
    return `${proto}//${host}:${port}${res.ws_path}`;
  }
  return res.ws_url || "";
}

async function stopRemoteSession(
  recipeId: string | null | undefined,
  sessionId: string | null,
  kind: LiveKind
): Promise<void> {
  if (!recipeId || !sessionId) return;
  if (kind !== "external" && kind !== "screencast") return;
  try {
    await apiFetch(`/api/v1/recipes/${recipeId}/live/stop`, {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId }),
    });
  } catch {
    // ignorar errores de cierre previo
  }
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
  wsUrl: null,
  viewport: { width: 1280, height: 800 },
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
    await stopRemoteSession(recipeId, sessionId, kind);
    set({
      isOpen: false,
      status: "idle",
      sessionId: null,
      proxyUrl: null,
      wsUrl: null,
      armedNodeId: null,
      pendingArmNodeId: null,
      sender: null,
      error: null,
    });
  },

  startEmbedded: async (recipeId, url) => {
    const cleanUrl = normalizeLiveUrl(url);
    const { sessionId: prevId, kind: prevKind } = get();
    if (prevId && prevKind !== "embedded") {
      void stopRemoteSession(recipeId, prevId, prevKind);
    }
    set({ status: "starting", error: null, kind: "embedded", armedNodeId: null, wsUrl: null });
    try {
      const def = useRecipeStore.getState().definition;
      const macVar = def?.variables?.find((v) =>
        ["mock_mac", "mock_macs", "tray_mac", "mac"].includes(v.name)
      );
      const versionVar = def?.variables?.find((v) => v.name === "mock_tray_version");

      const payload: Record<string, unknown> = { url: cleanUrl };
      if (macVar?.defaultValue !== undefined) {
        payload.mock_mac = macVar.defaultValue;
      }
      if (versionVar?.defaultValue !== undefined) {
        payload.mock_version = versionVar.defaultValue;
      }

      const res = await apiFetch<{ session_id: string; proxy_url: string; origin: string }>(
        `/api/v1/recipes/${recipeId}/live/start`,
        { method: "POST", body: JSON.stringify(payload) }
      );
      set({
        status: "ready",
        sessionId: res.session_id,
        proxyUrl: res.proxy_url,
        wsUrl: null,
        currentUrl: cleanUrl,
      });
    } catch (err: any) {
      set({ status: "error", error: err?.message || "No se pudo iniciar el sitio en vivo" });
    }
  },

  startScreencast: async (recipeId, url, viewport) => {
    const cleanUrl = normalizeLiveUrl(url);
    const state = get();
    const nextVp = viewport || state.viewport || { width: 1280, height: 800 };

    if (state.kind === "screencast" && state.status === "ready" && state.sessionId && state.sender) {
      if (
        viewport &&
        (viewport.width !== state.viewport.width || viewport.height !== state.viewport.height)
      ) {
        state.sender({ type: "browser:resize", width: nextVp.width, height: nextVp.height });
      }
      state.sender({ type: "browser:navigate", url: cleanUrl });
      set({ currentUrl: cleanUrl, viewport: nextVp, armedNodeId: null, error: null });
      return;
    }

    if (state.sessionId && state.kind !== "embedded") {
      void stopRemoteSession(recipeId, state.sessionId, state.kind);
    }

    set({
      status: "starting",
      error: null,
      kind: "screencast",
      armedNodeId: null,
      proxyUrl: null,
      wsUrl: null,
      viewport: nextVp,
    });

    try {
      const res = await apiFetch<{
        session_id: string;
        ws_token: string;
        ws_path: string;
        ws_port: number;
        ws_url: string;
        origin: string;
        viewport?: LiveViewport;
      }>(`/api/v1/recipes/${recipeId}/live/screencast`, {
        method: "POST",
        body: JSON.stringify({
          url: cleanUrl,
          width: nextVp.width,
          height: nextVp.height,
        }),
      });

      set({
        status: "ready",
        sessionId: res.session_id,
        proxyUrl: null,
        wsUrl: resolveScreencastWsUrl(res),
        viewport: res.viewport || nextVp,
        currentUrl: cleanUrl,
      });
    } catch (err: any) {
      set({ status: "error", error: err?.message || "No se pudo iniciar el navegador remoto" });
    }
  },

  startExternal: async (recipeId, url) => {
    const cleanUrl = normalizeLiveUrl(url);
    const { sessionId: prevId, kind: prevKind } = get();
    if (prevId && prevKind !== "embedded") {
      void stopRemoteSession(recipeId, prevId, prevKind);
    }
    set({
      status: "starting",
      error: null,
      kind: "external",
      armedNodeId: null,
      proxyUrl: null,
      wsUrl: null,
    });
    try {
      const res = await apiFetch<{ session_id: string }>(
        `/api/v1/recipes/${recipeId}/live/external`,
        { method: "POST", body: JSON.stringify({ url: cleanUrl }) }
      );
      set({ status: "ready", sessionId: res.session_id, wsUrl: null, currentUrl: cleanUrl });
    } catch (err: any) {
      set({ status: "error", error: err?.message || "No se pudo abrir Chromium externo" });
    }
  },

  handleMessage: (msg) => {
    if (!msg || typeof msg.type !== "string") return;
    switch (msg.type) {
      case "screencast:ready":
        set({
          currentUrl: msg.url || get().currentUrl,
          pageTitle: msg.title ?? get().pageTitle,
          viewport: msg.viewport || get().viewport,
        });
        break;
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
        set({ status: "idle", sessionId: null, wsUrl: null, armedNodeId: null });
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
        timeout: Math.min(n.timeout || (n.params as any)?.timeout || 3500, Math.max(1000, timeoutMs - 1000)),
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
