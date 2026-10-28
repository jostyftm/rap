import { describe, expect, it, vi, beforeEach } from "vitest";
import type { RecipeDsl } from "@rpa/dsl";
import {
  sortNodesInExecutionOrder,
  testSequentialNodes,
  stopSequentialTesting,
} from "../node-tester";
import { useRecipeStore } from "@/stores/use-recipe-store";
import { useLiveStore } from "@/stores/use-live-store";

function createMockRecipe(): RecipeDsl {
  return {
    schema: "rpa/v1",
    name: "Receta Test Secuencial",
    entry: "step_nav",
    nodes: {
      step_nav: {
        id: "step_nav",
        type: "navigate",
        description: "Ir a login",
        params: { url: "https://example.com/login" },
        next: "step_user",
      },
      step_user: {
        id: "step_user",
        type: "type",
        description: "Escribir usuario",
        locator: {
          primary: { strategy: "testid", value: "username", score: 90 },
          fallbacks: [],
        },
        params: { text: "admin", clear: true },
        next: "step_pass",
      },
      step_pass: {
        id: "step_pass",
        type: "type",
        description: "Escribir contraseña",
        locator: {
          primary: { strategy: "testid", value: "password", score: 90 },
          fallbacks: [],
        },
        params: { text: "secret", clear: true },
        next: "step_click",
      },
      step_click: {
        id: "step_click",
        type: "click",
        description: "Hacer click",
        locator: {
          primary: { strategy: "testid", value: "submit", score: 90 },
          fallbacks: [],
        },
        params: { button: "left" },
      },
      step_detached: {
        id: "step_detached",
        type: "screenshot",
        description: "Paso desconectado",
        params: { fullPage: true },
      },
    },
    edges: [
      { from: "step_nav", to: "step_user" },
      { from: "step_user", to: "step_pass" },
      { from: "step_pass", to: "step_click" },
    ],
  };
}

describe("Multi-Step Tester & Selection Store", () => {
  describe("sortNodesInExecutionOrder", () => {
    it("ordena los nodos seleccionados según el flujo natural de ejecución (topológico)", () => {
      const recipe = createMockRecipe();

      // Selección en orden inverso o desordenado
      const selectedIds = ["step_click", "step_nav", "step_user"];
      const ordered = sortNodesInExecutionOrder(recipe, selectedIds);

      expect(ordered.map((n) => n.id)).toEqual([
        "step_nav",
        "step_user",
        "step_click",
      ]);
    });

    it("ubica los nodos desconectados al final de la secuencia ordenada", () => {
      const recipe = createMockRecipe();

      const selectedIds = ["step_detached", "step_user", "step_nav"];
      const ordered = sortNodesInExecutionOrder(recipe, selectedIds);

      expect(ordered.map((n) => n.id)).toEqual([
        "step_nav",
        "step_user",
        "step_detached",
      ]);
    });

    it("retorna un arreglo vacío si no hay nodos seleccionados coincidentes", () => {
      const recipe = createMockRecipe();
      const ordered = sortNodesInExecutionOrder(recipe, ["inexistente_1", "inexistente_2"]);
      expect(ordered).toEqual([]);
    });
  });

  describe("useRecipeStore multi-selection actions", () => {
    beforeEach(() => {
      useRecipeStore.getState().clearSelection();
    });

    it("setSelectedNodeId actualiza selectedNodeId y sincroniza selectedNodeIds con un solo elemento", () => {
      const store = useRecipeStore.getState();
      store.setSelectedNodeId("node_a");

      expect(useRecipeStore.getState().selectedNodeId).toBe("node_a");
      expect(useRecipeStore.getState().selectedNodeIds).toEqual(["node_a"]);

      store.setSelectedNodeId(null);
      expect(useRecipeStore.getState().selectedNodeId).toBeNull();
      expect(useRecipeStore.getState().selectedNodeIds).toEqual([]);
    });

    it("setSelectedNodeIds actualiza la lista y define selectedNodeId como el último elemento", () => {
      const store = useRecipeStore.getState();
      store.setSelectedNodeIds(["node_1", "node_2", "node_3"]);

      expect(useRecipeStore.getState().selectedNodeIds).toEqual([
        "node_1",
        "node_2",
        "node_3",
      ]);
      expect(useRecipeStore.getState().selectedNodeId).toBe("node_3");
    });

    it("toggleNodeSelection alterna selección simple y múltiple", () => {
      const store = useRecipeStore.getState();

      // Selección simple
      store.toggleNodeSelection("step_1", false);
      expect(useRecipeStore.getState().selectedNodeIds).toEqual(["step_1"]);

      // Selección aditiva con multi=true (Shift o Cmd/Ctrl)
      store.toggleNodeSelection("step_2", true);
      expect(useRecipeStore.getState().selectedNodeIds).toEqual(["step_1", "step_2"]);
      expect(useRecipeStore.getState().selectedNodeId).toBe("step_2");

      // Deseleccionar elemento existente con multi=true
      store.toggleNodeSelection("step_1", true);
      expect(useRecipeStore.getState().selectedNodeIds).toEqual(["step_2"]);
      expect(useRecipeStore.getState().selectedNodeId).toBe("step_2");
    });

    it("clearSelection vacía ambas propiedades de selección", () => {
      const store = useRecipeStore.getState();
      store.setSelectedNodeIds(["step_1", "step_2"]);
      store.clearSelection();

      expect(useRecipeStore.getState().selectedNodeId).toBeNull();
      expect(useRecipeStore.getState().selectedNodeIds).toEqual([]);
    });

    it("setIsTestingSteps actualiza el estado y el progreso de la prueba", () => {
      const store = useRecipeStore.getState();
      store.setIsTestingSteps(true, { current: 2, total: 4, nodeId: "step_2" });

      expect(useRecipeStore.getState().isTestingSteps).toBe(true);
      expect(useRecipeStore.getState().testingStepsProgress).toEqual({
        current: 2,
        total: 4,
        nodeId: "step_2",
      });

      store.setIsTestingSteps(false, null);
      expect(useRecipeStore.getState().isTestingSteps).toBe(false);
      expect(useRecipeStore.getState().testingStepsProgress).toBeNull();
    });

    it("setEntryNode posiciona un nodo como entry y garantiza que no quede vacío", () => {
      const store = useRecipeStore.getState();
      const webhookId = store.addNode("webhook");

      store.setEntryNode(webhookId);
      expect(useRecipeStore.getState().definition.entry).toBe(webhookId);
      expect(useRecipeStore.getState().selectedNodeId).toBe(webhookId);
    });

    it("deleteNode sobre el entry node reasigna entry a un nodo existente en vez de dejarlo vacío", () => {
      const store = useRecipeStore.getState();
      const currentEntry = store.definition.entry;
      expect(currentEntry).toBeTruthy();

      store.deleteNode(currentEntry);
      const newDef = useRecipeStore.getState().definition;
      const remainingKeys = Object.keys(newDef.nodes);
      if (remainingKeys.length > 0) {
        expect(newDef.entry).toBe(remainingKeys[0]);
        expect(newDef.nodes[newDef.entry]).toBeDefined();
      }
    });
  });

  describe("testSequentialNodes execution & cancellation", () => {
    beforeEach(() => {
      const recipe = createMockRecipe();
      useRecipeStore.getState().setRecipe({
        id: "recipe-test",
        name: recipe.name || "Test",
        version: 1,
        definition: recipe,
      });
      useRecipeStore.getState().clearSelection();

      // Mockear estado de live store para simular sesión en vivo lista sin red
      useLiveStore.setState({
        isOpen: true,
        status: "ready",
        proxyUrl: "http://localhost:8099/__rpa_proxy",
        kind: "embedded",
      });
    });

    it("retorna resultado inmediato si no hay nodos a ejecutar", async () => {
      const result = await testSequentialNodes([]);
      expect(result.completed).toBe(true);
      expect(result.executedCount).toBe(0);
      expect(result.totalCount).toBe(0);
    });

    it("permite cancelar con stopSequentialTesting", async () => {
      const live = useLiveStore.getState();
      vi.spyOn(live, "exec").mockImplementation(async (node) => {
        // Simular retardo breve
        await new Promise((r) => setTimeout(r, 20));
        return { ok: true, nodeId: node.id, output: "done" };
      });

      const promise = testSequentialNodes(["step_user", "step_pass"], {
        delayMs: 20,
      });

      // Detener
      stopSequentialTesting();

      const result = await promise;
      expect(useRecipeStore.getState().isTestingSteps).toBe(false);
      expect(useRecipeStore.getState().runningNodeId).toBeNull();
      expect(result.completed).toBe(false);
    });

    it("ejecuta todos los pasos secuencialmente si no hay errores", async () => {
      const live = useLiveStore.getState();
      const executed: string[] = [];
      vi.spyOn(live, "exec").mockImplementation(async (node) => {
        executed.push(node.id);
        return { ok: true, nodeId: node.id, output: `result-${node.id}` };
      });

      const result = await testSequentialNodes(["step_user", "step_pass"], {
        delayMs: 10,
      });

      expect(result.completed).toBe(true);
      expect(result.executedCount).toBe(2);
      expect(executed).toEqual(["step_user", "step_pass"]);
      expect(useRecipeStore.getState().isTestingSteps).toBe(false);
    });

    it("se detiene en el paso que falla cuando un paso devuelve error", async () => {
      const live = useLiveStore.getState();
      const executed: string[] = [];
      vi.spyOn(live, "exec").mockImplementation(async (node) => {
        executed.push(node.id);
        if (node.id === "step_pass") {
          return { ok: false, nodeId: node.id, error: "Input no encontrado" };
        }
        return { ok: true, nodeId: node.id };
      });

      const result = await testSequentialNodes(["step_user", "step_pass", "step_click"], {
        delayMs: 10,
      });

      expect(result.completed).toBe(false);
      expect(result.executedCount).toBe(1);
      expect(result.failedNodeId).toBe("step_pass");
      expect(result.error).toBe("Input no encontrado");
      expect(executed).toEqual(["step_user", "step_pass"]);
      expect(executed).not.toContain("step_click");
    });
  });
});
