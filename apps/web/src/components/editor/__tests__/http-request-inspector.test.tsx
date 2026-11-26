import React from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { HttpRequestNode, RecipeDsl } from "@rpa/dsl";
import { HttpRequestInspectorForm } from "../nodes/inspectors/http-request-inspector";
import { useRecipeStore } from "@/stores/use-recipe-store";
import { useWebhookTestStore } from "@/stores/use-webhook-test-store";

beforeAll(() => {
  if (typeof Range !== "undefined" && !Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () =>
      ({
        length: 0,
        item: () => null,
        [Symbol.iterator]: function* () {},
      }) as unknown as DOMRectList;
  }
  if (typeof Range !== "undefined" && !Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0);
  }
});

function createHttpNode(
  overrides?: Partial<HttpRequestNode["params"]>
): HttpRequestNode {
  return {
    id: "http_1",
    type: "httpRequest",
    description: "Llamar API",
    params: {
      method: "GET",
      url: "https://api.example.com/items",
      pathParams: [],
      queryParams: [],
      headers: [],
      auth: { type: "none" },
      bodyType: "none",
      responseType: "auto",
      followRedirects: true,
      failOnHttpError: true,
      ...overrides,
    },
  };
}

function seedStore(editorMode: "edit" | "published" = "edit") {
  const node = createHttpNode();
  const definition: RecipeDsl = {
    schema: "rpa/v1",
    name: "HTTP Test",
    variables: [],
    secrets: ["API_KEY"],
    entry: "webhook_1",
    edges: [],
    nodes: {
      webhook_1: {
        id: "webhook_1",
        type: "webhook",
        description: "Webhook inicial",
        params: { httpMethod: "POST", outputVariable: "webhook" },
      },
      http_1: node,
    },
  };
  useRecipeStore.setState({
    definition,
    editorMode,
    viewingVersion: null,
    activeDetailNodeId: null,
    nodeOutputs: {},
  });
  useWebhookTestStore.setState({ byNode: {} });
}

describe("HttpRequestInspectorForm", () => {
  beforeEach(() => {
    seedStore("edit");
  });

  it("permite seleccionar cualquier verbo HTTP y navegar por Parámetros, Auth, Body y Respuesta", () => {
    const updateParam = vi.fn();
    render(
      <HttpRequestInspectorForm
        node={createHttpNode({ outputVariable: null as unknown as string })}
        updateNode={vi.fn()}
        updateParam={updateParam}
      />
    );

    const methodSelect = screen.getByLabelText("Método HTTP de la petición");
    fireEvent.change(methodSelect, { target: { value: "PATCH" } });
    expect(updateParam).toHaveBeenCalledWith("method", "PATCH");

    fireEvent.click(screen.getByRole("button", { name: /Añadir Query Param/i }));
    expect(updateParam).toHaveBeenCalledWith("queryParams", [
      { key: "", value: "", enabled: true },
    ]);

    fireEvent.click(screen.getByRole("tab", { name: "Auth" }));
    fireEvent.change(screen.getByLabelText("Tipo de autenticación"), {
      target: { value: "bearer" },
    });
    expect(updateParam).toHaveBeenCalledWith("auth", { type: "bearer", token: "" });

    fireEvent.click(screen.getByRole("tab", { name: "Body" }));
    fireEvent.change(screen.getByLabelText("Formato del cuerpo (Body)"), {
      target: { value: "multipart" },
    });
    expect(updateParam).toHaveBeenCalledWith("bodyType", "multipart");

    fireEvent.click(screen.getByRole("tab", { name: "Respuesta" }));
    fireEvent.change(screen.getByLabelText("Formato de respuesta esperado"), {
      target: { value: "binary" },
    });
    expect(updateParam).toHaveBeenCalledWith("responseType", "binary");
  });

  it("monta editor con autocompletado en Payload JSON y muestra vista previa renderizada del webhook", () => {
    useWebhookTestStore.setState({
      byNode: {
        webhook_1: {
          status: "success",
          listenId: "l1",
          channel: "ch1",
          payload: {
            method: "POST",
            path: "/api/v1/webhooks-test/webhook_1",
            headers: {},
            params: {},
            query: {},
            timestamp: "2026-11-26T00:00:00Z",
            body: {
              raffle_id: 8425,
              results: { raffle_code: 6800 },
            },
          },
        },
      },
    });

    const node = createHttpNode({
      method: "POST",
      bodyType: "json",
      bodyJson:
        '{"raffle_id": {{steps.webhook_1.body.raffle_id}}, "code": {{steps.webhook_1.body.results.raffle_code}}}',
    });

    render(
      <HttpRequestInspectorForm
        node={node}
        updateNode={vi.fn()}
        updateParam={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "Body" }));

    expect(screen.getByTestId("codemirror-template-host")).toBeInTheDocument();
    expect(screen.getByText("Vista previa renderizada")).toBeInTheDocument();
    expect(screen.getByText("JSON válido")).toBeInTheDocument();
    expect(
      screen.getByText('{"raffle_id": 8425, "code": 6800}')
    ).toBeInTheDocument();
  });

  it("deshabilita los controles en modo solo lectura", () => {
    seedStore("published");
    render(
      <HttpRequestInspectorForm
        node={createHttpNode()}
        updateNode={vi.fn()}
        updateParam={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Método HTTP de la petición")).toBeDisabled();
    expect(
      screen.getByPlaceholderText("https://api.example.com/v1/items/:id")
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: /Añadir Query Param/i })
    ).not.toBeInTheDocument();
  });
});
