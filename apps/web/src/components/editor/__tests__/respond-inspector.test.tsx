import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { RespondNode, RecipeDsl } from "@rpa/dsl";
import { RespondInspectorForm } from "../nodes/inspectors/respond-inspector";
import { useRecipeStore } from "@/stores/use-recipe-store";

function createRespondNode(
  overrides?: Partial<RespondNode["params"]>
): RespondNode {
  return {
    id: "resp_1",
    type: "respond",
    description: "Responder cliente",
    params: {
      responseType: "json",
      statusCode: 200,
      body: '{"ok":true}',
      headers: [],
      terminateFlow: true,
      ...overrides,
    },
  };
}

function seedStore(editorMode: "edit" | "published" = "edit") {
  const node = createRespondNode();
  const definition: RecipeDsl = {
    schema: "rpa/v1",
    name: "Respond Test",
    variables: [{ name: "nombre", type: "string", defaultValue: "Ana" }],
    secrets: [],
    entry: "resp_1",
    edges: [],
    nodes: { resp_1: node },
  };
  useRecipeStore.setState({
    definition,
    editorMode,
    viewingVersion: null,
    activeDetailNodeId: null,
    nodeOutputs: {},
  });
}

describe("RespondInspectorForm", () => {
  beforeEach(() => {
    seedStore("edit");
  });

  it("permite cambiar el tipo de respuesta, presets HTTP y el flag terminateFlow", () => {
    const updateParam = vi.fn();
    const node = createRespondNode();

    render(
      <RespondInspectorForm
        node={node}
        updateNode={vi.fn()}
        updateParam={updateParam}
      />
    );

    const typeSelect = screen.getByLabelText("Tipo de retorno");
    fireEvent.change(typeSelect, { target: { value: "redirect" } });
    expect(updateParam).toHaveBeenCalledWith("responseType", "redirect");
    expect(updateParam).toHaveBeenCalledWith("statusCode", 302);

    fireEvent.click(screen.getByRole("button", { name: "201" }));
    expect(updateParam).toHaveBeenCalledWith("statusCode", 201);

    const checkbox = screen.getByRole("checkbox", {
      name: /Finalizar automatización al responder/i,
    });
    fireEvent.click(checkbox);
    expect(updateParam).toHaveBeenCalledWith("terminateFlow", false);
  });

  it("muestra controles específicos para redirect, binary y modo solo lectura", () => {
    render(
      <RespondInspectorForm
        node={createRespondNode({
          responseType: "redirect",
          redirectUrl: "https://example.com/ok",
        })}
        updateNode={vi.fn()}
        updateParam={vi.fn()}
      />
    );
    expect(screen.getByLabelText("URL de redirección (Location)")).toHaveValue(
      "https://example.com/ok"
    );

    seedStore("published");
    render(
      <RespondInspectorForm
        node={createRespondNode({ responseType: "binary", filename: "doc.pdf" })}
        updateNode={vi.fn()}
        updateParam={vi.fn()}
      />
    );

    expect(screen.getByPlaceholderText("reporte.pdf")).toBeDisabled();
    expect(screen.getByPlaceholderText("application/pdf")).toBeDisabled();
  });
});
