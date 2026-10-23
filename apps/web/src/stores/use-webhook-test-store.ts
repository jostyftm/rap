"use client";

import { create } from "zustand";
import type { WebhookNode } from "@rpa/dsl";
import { apiFetch } from "@/lib/api-client";
import { getEcho } from "@/lib/echo";
import { buildWebhookUrl } from "@/lib/webhook-url";
import { useRecipeStore } from "@/stores/use-recipe-store";

export type WebhookTestStatus = "idle" | "listening" | "success" | "error";

export interface WebhookReceivedPayload {
  method: string;
  path: string;
  headers: Record<string, unknown>;
  params: Record<string, unknown>;
  query: Record<string, unknown>;
  body: unknown;
  timestamp: string;
}

export interface WebhookTestEntry {
  status: WebhookTestStatus;
  listenId?: string;
  url?: string;
  channel?: string;
  expiresAt?: number;
  payload?: WebhookReceivedPayload;
  error?: string;
}

interface WebhookTestStore {
  byNode: Record<string, WebhookTestEntry>;
  getEntry: (nodeId: string) => WebhookTestEntry;
  startListening: (recipeId: string, node: WebhookNode) => Promise<void>;
  stopListening: (recipeId: string, nodeId: string) => Promise<void>;
  reset: (nodeId: string) => void;
}

const DEFAULT_ENTRY: WebhookTestEntry = {
  status: "idle",
};

// Mapa interno para timers de expiración y canales activos
const activeTimers = new Map<string, ReturnType<typeof setTimeout>>();
const activeChannels = new Map<string, string>();

export const useWebhookTestStore = create<WebhookTestStore>((set, get) => ({
  byNode: {},

  getEntry: (nodeId: string) => {
    return get().byNode[nodeId] || DEFAULT_ENTRY;
  },

  startListening: async (recipeId: string, node: WebhookNode) => {
    const nodeId = node.id;
    const path = node.params.path || `/api/v1/webhooks/${node.id}`;
    const httpMethod = node.params.httpMethod || "POST";
    const responseCode = node.params.responseCode ?? 200;
    const responseBody = node.params.responseBody || '{"ok":true}';

    // Limpiar si ya había timer o canal previo
    if (activeTimers.has(nodeId)) {
      clearTimeout(activeTimers.get(nodeId)!);
      activeTimers.delete(nodeId);
    }
    const oldChannel = activeChannels.get(nodeId);
    if (oldChannel) {
      const echo = getEcho();
      if (echo) echo.leaveChannel(oldChannel);
      activeChannels.delete(nodeId);
    }

    set((state) => ({
      byNode: {
        ...state.byNode,
        [nodeId]: {
          status: "listening",
          url: buildWebhookUrl(path),
          error: undefined,
        },
      },
    }));

    try {
      const res = await apiFetch<{
        listen_id: string;
        url: string;
        channel: string;
        expires_at: number;
      }>(`/api/v1/recipes/${recipeId}/webhook-test/listen`, {
        method: "POST",
        body: JSON.stringify({
          node_id: nodeId,
          path,
          http_method: httpMethod,
          response_code: responseCode,
          response_body: responseBody,
        }),
      });

      const { listen_id, url, channel, expires_at } = res;

      set((state) => ({
        byNode: {
          ...state.byNode,
          [nodeId]: {
            status: "listening",
            listenId: listen_id,
            url,
            channel,
            expiresAt: expires_at,
          },
        },
      }));

      activeChannels.set(nodeId, channel);

      // Conectar WebSocket vía Laravel Echo / Reverb
      const echo = getEcho();
      if (echo) {
        const ch = echo.channel(channel);
        ch.listen(
          ".webhook.test.received",
          (e: {
            listen_id: string;
            recipe_uuid: string;
            node_id: string;
            payload: WebhookReceivedPayload;
          }) => {
            // Cancelar timer de expiración
            if (activeTimers.has(nodeId)) {
              clearTimeout(activeTimers.get(nodeId)!);
              activeTimers.delete(nodeId);
            }
            if (activeChannels.has(nodeId)) {
              echo.leaveChannel(channel);
              activeChannels.delete(nodeId);
            }

            // Actualizar estado en este store
            set((state) => ({
              byNode: {
                ...state.byNode,
                [nodeId]: {
                  ...state.byNode[nodeId],
                  status: "success",
                  payload: e.payload,
                  error: undefined,
                },
              },
            }));

            // Sincronizar con el store general de la receta para que esté disponible en la salida y variables
            useRecipeStore.getState().setNodeOutput(nodeId, e.payload);
            useRecipeStore.getState().setNodeExecState(nodeId, "success");
          }
        );
      }

      // Configurar temporizador local para timeout (120 s)
      const timeoutMs = Math.max(1000, (expires_at * 1000) - Date.now());
      const timer = setTimeout(() => {
        const current = get().byNode[nodeId];
        if (current && current.status === "listening") {
          const echoInstance = getEcho();
          if (echoInstance && channel) {
            echoInstance.leaveChannel(channel);
          }
          activeChannels.delete(nodeId);
          activeTimers.delete(nodeId);

          set((state) => ({
            byNode: {
              ...state.byNode,
              [nodeId]: {
                ...state.byNode[nodeId],
                status: "error",
                error: "Tiempo de espera agotado (120s). No se recibieron peticiones HTTP.",
              },
            },
          }));
        }
      }, timeoutMs);

      activeTimers.set(nodeId, timer);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "No se pudo iniciar la escucha de prueba.";
      set((state) => ({
        byNode: {
          ...state.byNode,
          [nodeId]: {
            ...state.byNode[nodeId],
            status: "error",
            error: message,
          },
        },
      }));
    }
  },

  stopListening: async (recipeId: string, nodeId: string) => {
    const entry = get().byNode[nodeId];
    if (activeTimers.has(nodeId)) {
      clearTimeout(activeTimers.get(nodeId)!);
      activeTimers.delete(nodeId);
    }

    if (entry?.channel) {
      const echo = getEcho();
      if (echo) echo.leaveChannel(entry.channel);
      activeChannels.delete(nodeId);
    }

    const listenId = entry?.listenId;
    set((state) => ({
      byNode: {
        ...state.byNode,
        [nodeId]: {
          ...state.byNode[nodeId],
          status: "idle",
        },
      },
    }));

    if (recipeId && listenId) {
      try {
        await apiFetch(`/api/v1/recipes/${recipeId}/webhook-test/${listenId}`, {
          method: "DELETE",
        });
      } catch {
        // Ignorar error al limpiar backend
      }
    }
  },

  reset: (nodeId: string) => {
    if (activeTimers.has(nodeId)) {
      clearTimeout(activeTimers.get(nodeId)!);
      activeTimers.delete(nodeId);
    }
    const channel = activeChannels.get(nodeId);
    if (channel) {
      const echo = getEcho();
      if (echo) echo.leaveChannel(channel);
      activeChannels.delete(nodeId);
    }
    set((state) => ({
      byNode: {
        ...state.byNode,
        [nodeId]: DEFAULT_ENTRY,
      },
    }));
  },
}));
