import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";

type ListenerMap = Record<string, Array<(payload: any) => void>>;
const channelListeners = new Map<string, ListenerMap>();

vi.mock("../../../lib/echo", () => ({
  getEcho: () => ({
    channel: (name: string) => {
      if (!channelListeners.has(name)) {
        channelListeners.set(name, {});
      }
      const listeners = channelListeners.get(name)!;
      return {
        listen: (eventName: string, cb: (payload: any) => void) => {
          listeners[eventName] = listeners[eventName] || [];
          listeners[eventName].push(cb);
        },
      };
    },
    leaveChannel: (name: string) => {
      channelListeners.delete(name);
    },
  }),
}));

const mockFetchRecipeRuns = vi.fn();
const mockFetchRunDetail = vi.fn();
const mockFetchRunLogs = vi.fn();

vi.mock("../../../lib/run-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/run-api")>();
  return {
    ...actual,
    fetchRecipeRuns: (...args: any[]) => mockFetchRecipeRuns(...args),
    fetchRunDetail: (...args: any[]) => mockFetchRunDetail(...args),
    fetchRunLogs: (...args: any[]) => mockFetchRunLogs(...args),
  };
});

import { ExecutionConsole } from "../execution-console";
import { useRecipeStore } from "../../../stores/use-recipe-store";

function emitEchoEvent(channel: string, event: string, payload: any) {
  const map = channelListeners.get(channel);
  const cbs = map?.[event] || [];
  for (const cb of cbs) {
    cb(payload);
  }
}

describe("ExecutionConsole observability for webhook & published runs", () => {
  beforeEach(() => {
    channelListeners.clear();
    mockFetchRecipeRuns.mockReset();
    mockFetchRunDetail.mockReset();
    mockFetchRunLogs.mockReset();

    mockFetchRecipeRuns.mockResolvedValue([]);
    mockFetchRunDetail.mockResolvedValue(null);
    mockFetchRunLogs.mockResolvedValue([]);

    useRecipeStore.getState().resetRecipe();
    useRecipeStore.getState().setRecipe({
      id: "recipe-uuid-1",
      name: "Webhook Demo",
      version: 1,
      definition: {
        schema: "rpa/v1",
        name: "Webhook Demo",
        entry: "webhook_1",
        nodes: {
          webhook_1: {
            id: "webhook_1",
            type: "webhook",
            description: "Escuchar pedido",
            params: { httpMethod: "POST", path: "/api/v1/webhooks/demo", outputVariable: "webhook" },
            next: "nav_1",
          },
          nav_1: {
            id: "nav_1",
            type: "navigate",
            description: "Abrir portal",
            params: { url: "https://example.test" },
          },
        },
        edges: [{ from: "webhook_1", to: "nav_1" }],
      },
    });
  });

  it("se auto-engancha cuando un webhook dispara un run y muestra paso a paso, vista previa y logs", async () => {
    mockFetchRunDetail.mockResolvedValue({
      id: "run-wh-01",
      recipe_id: "recipe-uuid-1",
      recipe_version: 1,
      is_draft: false,
      trigger: "webhook",
      status: "completed",
      duration_ms: 420,
      parameters: { webhook: { body: { order_id: 99 } } },
      result: {
        final_url: "https://example.test/done",
        final_title: "Pedido Confirmado",
      },
      steps: [
        {
          id: "step-1",
          node_id: "nav_1",
          status: "success",
          duration_ms: 210,
          output: { url: "https://example.test/done", title: "Pedido Confirmado" },
          screenshot_path: "runs/run-wh-01/screenshots/nav_1.jpg",
          screenshot_url: "http://localhost:8000/api/v1/artifacts/art-1?signature=sig1",
        },
      ],
      artifacts: [
        {
          id: "art-1",
          type: "screenshot",
          s3_key: "runs/run-wh-01/screenshots/nav_1.jpg",
          mime_type: "image/jpeg",
          metadata: { node_id: "nav_1", status: "success" },
          url: "http://localhost:8000/api/v1/artifacts/art-1?signature=sig1",
        },
      ],
    });

    mockFetchRunLogs.mockResolvedValue([
      {
        id: 1,
        level: "info",
        source: "runner",
        node_id: "nav_1",
        message: "Paso [nav_1] (navigate): Abrir portal",
        logged_at: "2026-11-21T12:00:01Z",
      },
      {
        id: 2,
        level: "success",
        source: "runner",
        node_id: "nav_1",
        message: "Paso [nav_1] completado exitosamente en 210ms",
        logged_at: "2026-11-21T12:00:02Z",
      },
    ]);

    render(<ExecutionConsole />);

    // Simular evento Reverb en canal de receta al llegar una petición webhook externa
    await act(async () => {
      emitEchoEvent("recipe.recipe-uuid-1", ".run.updated", {
        id: "run-wh-01",
        recipe_id: "recipe-uuid-1",
        recipe_version: 1,
        is_draft: false,
        trigger: "webhook",
        status: "queued",
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/Abrir portal/)).toBeInTheDocument();
      expect(screen.getByText(/420ms/)).toBeInTheDocument();
      expect(screen.getAllByText(/Pedido Confirmado/).length).toBeGreaterThan(0);
    });

    const previewImg = screen.getByAltText("Vista previa paso nav_1") as HTMLImageElement;
    expect(previewImg.src).toContain("/api/v1/artifacts/art-1?signature=sig1");

    // Cambiar a la pestaña Logs y comprobar logs paso a paso hidratados desde BD
    fireEvent.click(screen.getByText(/Logs \(/));
    expect(
      screen.getByText("Paso [nav_1] completado exitosamente en 210ms")
    ).toBeInTheDocument();
  });

  it("permite listar ejecuciones históricas y abrir su detalle paso a paso", async () => {
    mockFetchRecipeRuns.mockResolvedValue([
      {
        id: "run-hist-99",
        recipe_id: "recipe-uuid-1",
        recipe_version: 2,
        is_draft: false,
        status: "failed",
        trigger: "webhook",
        duration_ms: 850,
        error_message: "Timeout esperando botón",
        steps_count: 1,
        logs_count: 3,
        created_at: "2026-11-21T11:50:00Z",
        preview_url: "http://localhost:8000/api/v1/artifacts/art-err?signature=err",
      },
    ]);

    mockFetchRunDetail.mockResolvedValue({
      id: "run-hist-99",
      recipe_id: "recipe-uuid-1",
      recipe_version: 2,
      is_draft: false,
      status: "failed",
      trigger: "webhook",
      duration_ms: 850,
      error_message: "Timeout esperando botón",
      steps: [
        {
          id: "st-err",
          node_id: "nav_1",
          status: "failed",
          duration_ms: 850,
          error_message: "Timeout esperando botón",
          screenshot_url: "http://localhost:8000/api/v1/artifacts/art-err?signature=err",
        },
      ],
      artifacts: [],
    });

    render(<ExecutionConsole />);

    useRecipeStore.getState().setConsoleTab("executions");
    useRecipeStore.getState().setConsoleOpen(true);

    await waitFor(() => {
      expect(screen.getByText(/run-hist-9/)).toBeInTheDocument();
      expect(screen.getByText(/Timeout esperando botón/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/run-hist-9/));

    await waitFor(() => {
      expect(mockFetchRunDetail).toHaveBeenCalledWith("run-hist-99");
      expect(screen.getByText("Error de ejecución")).toBeInTheDocument();
      expect(screen.getByAltText("Vista previa paso nav_1")).toBeInTheDocument();
    });
  });
});
