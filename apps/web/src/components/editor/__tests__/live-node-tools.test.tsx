import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { RecipeDsl } from "@rpa/dsl";
import { LiveNodeTools } from "../live-node-tools";
import { useRecipeStore } from "@/stores/use-recipe-store";
import { useLiveStore } from "@/stores/use-live-store";

function createTryCatchRecipe(): RecipeDsl {
  return {
    schema: "rpa/v1",
    name: "Receta TryCatch UI",
    entry: "try_block",
    nodes: {
      try_block: {
        id: "try_block",
        type: "tryCatch",
        description: "Bloque protegido",
        params: {
          tryEntryNodeId: "click_table",
          catchEntryNodeId: "extract_toast",
          errorVariable: "error",
          rethrow: false,
        },
      },
      click_table: {
        id: "click_table",
        type: "click",
        description: "Clic fila tabla",
        locator: {
          primary: { strategy: "css", value: ".row-btn", score: 80 },
          fallbacks: [],
        },
        params: { button: "left" },
      },
      extract_toast: {
        id: "extract_toast",
        type: "extract",
        description: "Extraer toast",
        locator: {
          primary: { strategy: "css", value: "p-toast .p-toast-detail", score: 80 },
          fallbacks: [],
        },
        params: { extractType: "text", variable: "toastText" },
      },
    },
    edges: [],
  };
}

describe("LiveNodeTools", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    const def = createTryCatchRecipe();
    useRecipeStore.getState().setRecipe({
      id: "recipe-ui-1",
      name: def.name || "Test",
      version: 1,
      definition: def,
    });
    useLiveStore.setState({
      isOpen: true,
      status: "ready",
      proxyUrl: "http://localhost:8099/__rpa_proxy",
      kind: "embedded",
    });
  });

  it("muestra el botón 'Probar este paso' en nodos tryCatch y renderiza su resultado", async () => {
    const def = useRecipeStore.getState().definition;
    vi.spyOn(useLiveStore.getState(), "exec").mockImplementation(async (node) => {
      if (node.id === "click_table") {
        return { ok: false, nodeId: node.id, error: "Botón no visible" };
      }
      if (node.id === "extract_toast") {
        return { ok: true, nodeId: node.id, output: "El servicio no disponible" };
      }
      return { ok: true, nodeId: node.id };
    });

    render(<LiveNodeTools node={def.nodes.try_block} />);

    const btn = screen.getByRole("button", { name: /Probar este paso/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(screen.getByText(/✓ Salida disponible/i)).toBeTruthy();
      expect(screen.getByText(/El servicio no disponible/)).toBeTruthy();
    });

    expect(useRecipeStore.getState().nodeExecStatuses.click_table).toBe("error");
    expect(useRecipeStore.getState().nodeExecStatuses.extract_toast).toBe("success");
    expect(useRecipeStore.getState().nodeExecStatuses.try_block).toBe("success");
  });

  it("muestra acceso directo 'Probar bloque TryCatch' en nodos del try y actualiza nodeExecStatuses al probar paso", async () => {
    const def = useRecipeStore.getState().definition;
    vi.spyOn(useLiveStore.getState(), "exec").mockResolvedValue({
      ok: false,
      nodeId: "click_table",
      error: "Elemento no encontrado",
    });

    render(<LiveNodeTools node={def.nodes.click_table} />);

    expect(
      screen.getByRole("button", { name: /Probar bloque TryCatch/i })
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^Probar paso$/i }));

    await waitFor(() => {
      expect(useRecipeStore.getState().nodeExecStatuses.click_table).toBe("error");
      expect(useRecipeStore.getState().nodeExecErrors.click_table).toBe(
        "Elemento no encontrado"
      );
      expect(screen.getByText("Elemento no encontrado")).toBeTruthy();
    });
  });
});
