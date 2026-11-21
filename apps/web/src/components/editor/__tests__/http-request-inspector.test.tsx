import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { HttpRequestNode, RecipeDsl } from "@rpa/dsl";
import { HttpRequestInspectorForm } from "../nodes/inspectors/http-request-inspector";
import { useRecipeStore } from "@/stores/use-recipe-store";

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
    entry: "http_1",
    edges: [],
    nodes: { http_1: node },
  };
  useRecipeStore.setState({
    definition,
    editorMode,
    viewingVersion: null,
    activeDetailNodeId: null,
    nodeOutputs: {},
  });
}

describe("HttpRequestInspectorForm", () => {
  beforeEach(() => {
    seedStore("edit");
  });

  it("permite seleccionar cualquier verbo HTTP y navegar por Parámetros, Auth, Body y Respuesta", () => {
    const updateParam = vi.fn();
    render(
      <HttpRequestInspectorForm
        node={createHttpNode()}
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
