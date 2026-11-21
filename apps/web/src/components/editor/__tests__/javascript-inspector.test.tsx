import React from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { JavascriptNode, RecipeDsl } from "@rpa/dsl";
import { JavascriptInspectorForm } from "../nodes/inspectors/javascript-inspector";
import { useRecipeStore } from "@/stores/use-recipe-store";

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

function createJsNode(overrides?: Partial<JavascriptNode["params"]>): JavascriptNode {
  return {
    id: "js_1",
    type: "javascript",
    description: "Run JS",
    params: {
      code: "return { ok: true };",
      mode: "sandbox",
      outputVariable: "jsOut",
      ...overrides,
    },
  };
}

function seedRecipeStore(editorMode: "edit" | "published" = "edit") {
  const jsNode = createJsNode();
  const definition: RecipeDsl = {
    schema: "rpa/v1",
    name: "Inspector Test",
    variables: [{ name: "cliente", type: "string", defaultValue: "ACME" }],
    secrets: [],
    entry: "js_1",
    edges: [],
    nodes: {
      js_1: jsNode,
    },
  };

  useRecipeStore.setState({
    definition,
    editorMode,
    viewingVersion: null,
    activeDetailNodeId: null,
    nodeOutputs: {},
  });
}

describe("JavascriptInspectorForm + CodeMirrorJsEditor", () => {
  beforeEach(() => {
    seedRecipeStore("edit");
  });

  it("monta CodeMirror 6 con el código inicial y cambia el modo de ejecución", () => {
    const updateParam = vi.fn();
    const updateNode = vi.fn();
    const node = createJsNode();

    render(
      <JavascriptInspectorForm
        node={node}
        updateNode={updateNode}
        updateParam={updateParam}
      />
    );

    const host = screen.getByTestId("codemirror-js-host");
    const content = host.querySelector(".cm-content");
    expect(content).toBeInTheDocument();
    expect(content?.textContent).toContain("return { ok: true };");

    fireEvent.click(screen.getByRole("tab", { name: /Página \(DOM\)/i }));
    expect(updateParam).toHaveBeenCalledWith("mode", "browser");
  });

  it("permite insertar una plantilla rápida y sincroniza el valor al editor", () => {
    const node = createJsNode({ mode: "browser" });

    function StatefulHarness() {
      const [code, setCode] = React.useState(node.params.code);
      return (
        <JavascriptInspectorForm
          node={{ ...node, params: { ...node.params, code } }}
          updateNode={vi.fn()}
          updateParam={(key, val) => {
            if (key === "code") setCode(String(val));
          }}
        />
      );
    }

    render(<StatefulHarness />);

    const select = screen.getByLabelText("Insertar plantilla JavaScript") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "read_dom_table" } });

    const host = screen.getByTestId("codemirror-js-host");
    expect(host.textContent).toContain("document.querySelectorAll");
  });

  it("respeta el modo solo lectura cuando la receta está publicada", () => {
    seedRecipeStore("published");
    const updateParam = vi.fn();
    const node = createJsNode();

    render(
      <JavascriptInspectorForm
        node={node}
        updateNode={vi.fn()}
        updateParam={updateParam}
      />
    );

    const outputInput = screen.getByPlaceholderText("ej. resultadoJs");
    expect(outputInput).toBeDisabled();
    expect(screen.queryByLabelText("Insertar plantilla JavaScript")).not.toBeInTheDocument();

    const cmContent = screen.getByTestId("codemirror-js-host").querySelector(".cm-content");
    expect(cmContent).toHaveAttribute("contenteditable", "false");

    fireEvent.click(screen.getByRole("tab", { name: /Página \(DOM\)/i }));
    expect(updateParam).not.toHaveBeenCalled();
  });
});
