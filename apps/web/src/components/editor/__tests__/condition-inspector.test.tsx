import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ConditionNode, RecipeDsl } from "@rpa/dsl";
import { ConditionInspectorForm } from "../nodes/inspectors/condition-inspector";
import { useRecipeStore } from "@/stores/use-recipe-store";

function createConditionNode(
  overrides?: Partial<ConditionNode["params"]>
): ConditionNode {
  return {
    id: "cond_1",
    type: "condition",
    description: "Validar dato",
    params: {
      dataType: "string",
      operator: "contains",
      leftOperand: "{{variables.campo}}",
      rightOperand: "ok",
      expression: '$contains(variables.campo, "ok")',
      thenNodeId: "then_1",
      ...overrides,
    },
  };
}

function seedStore() {
  const node = createConditionNode();
  const definition: RecipeDsl = {
    schema: "rpa/v1",
    name: "Condition Test",
    variables: [{ name: "campo", type: "string", defaultValue: "" }],
    secrets: [],
    entry: "cond_1",
    edges: [],
    nodes: { cond_1: node },
  };
  useRecipeStore.setState({
    definition,
    editorMode: "edit",
    viewingVersion: null,
    activeDetailNodeId: null,
    nodeOutputs: {},
  });
}

describe("ConditionInspectorForm", () => {
  beforeEach(() => {
    seedStore();
  });

  it("expone operadores de nulos y vacíos en Texto y oculta Valor esperado para operadores unarios", () => {
    const updateNode = vi.fn();
    const node = createConditionNode();

    const { rerender } = render(
      <ConditionInspectorForm
        node={node}
        updateNode={updateNode}
        updateParam={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Valor esperado")).toBeInTheDocument();

    const opSelect = screen.getByLabelText("Operación") as HTMLSelectElement;
    const optionValues = Array.from(opSelect.options).map((o) => o.value);
    expect(optionValues).toEqual(
      expect.arrayContaining([
        "is_null",
        "is_not_null",
        "is_empty",
        "is_not_empty",
        "is_null_or_empty",
        "is_not_null_or_empty",
      ])
    );

    fireEvent.change(opSelect, { target: { value: "is_null" } });

    expect(updateNode).toHaveBeenCalledWith({
      params: expect.objectContaining({
        dataType: "string",
        operator: "is_null",
        rightOperand: undefined,
        expression: "variables.campo = null",
      }),
    });

    rerender(
      <ConditionInspectorForm
        node={createConditionNode({ operator: "is_null", rightOperand: undefined })}
        updateNode={updateNode}
        updateParam={vi.fn()}
      />
    );

    expect(screen.queryByLabelText("Valor esperado")).not.toBeInTheDocument();
  });

  it("permite seleccionar la naturaleza Nulo / Vacío y cambiar entre operadores", () => {
    const updateNode = vi.fn();
    const node = createConditionNode({
      dataType: "exists",
      operator: "is_null_or_empty",
      rightOperand: undefined,
    });

    render(
      <ConditionInspectorForm
        node={node}
        updateNode={updateNode}
        updateParam={vi.fn()}
      />
    );

    expect(screen.queryByLabelText("Valor esperado")).not.toBeInTheDocument();
    expect(screen.getByText(/Nulo\/indefinido:/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Operación"), {
      target: { value: "is_not_empty" },
    });

    expect(updateNode).toHaveBeenCalledWith({
      params: expect.objectContaining({
        dataType: "exists",
        operator: "is_not_empty",
        rightOperand: undefined,
        expression: 'Boolean(variables.campo) and variables.campo != ""',
      }),
    });
  });
});
