import { describe, expect, it } from "vitest";
import { parseRecipeJson, RECIPE_FILE_FORMAT, RECIPE_FORMAT_VERSION } from "../recipe-file";
import { useRecipeStore } from "@/stores/use-recipe-store";

describe("Recipe Portability (recipe-file)", () => {
  it("valida y parsea correctamente un archivo JSON con formato rpa-studio.recipe", () => {
    const rawValid = JSON.stringify({
      format: RECIPE_FILE_FORMAT,
      format_version: RECIPE_FORMAT_VERSION,
      exported_at: "2026-11-21T00:00:00Z",
      source: { version: 1 },
      recipe: { name: "Test Recipe" },
      definition: {
        schema: "rpa/v1",
        entry: "n1",
        nodes: {
          n1: { id: "n1", type: "navigate", description: "Ir", params: { url: "https://example.com" } },
        },
        edges: [],
      },
    });

    const result = parseRecipeJson(rawValid);
    expect(result.error).toBeUndefined();
    expect(result.data?.format).toBe(RECIPE_FILE_FORMAT);
    expect(result.data?.recipe.name).toBe("Test Recipe");
  });

  it("rechaza archivos con formato no reconocido o JSON mal formado", () => {
    const invalidFormat = JSON.stringify({
      format: "invalid-format",
      definition: {},
    });
    const res1 = parseRecipeJson(invalidFormat);
    expect(res1.error).toContain(RECIPE_FILE_FORMAT);

    const malformed = "{ invalid json ";
    const res2 = parseRecipeJson(malformed);
    expect(res2.error).toContain("JSON");
  });

  it("rechaza archivos sin bloque de definición DSL", () => {
    const noDef = JSON.stringify({
      format: RECIPE_FILE_FORMAT,
      format_version: 1,
      recipe: { name: "No Def" },
    });
    const res = parseRecipeJson(noDef);
    expect(res.error).toContain("definición DSL");
  });
});

describe("Recipe Store Read-Only Mode & Publishing", () => {
  it("impide mutaciones en el store cuando está en modo publicado", () => {
    const store = useRecipeStore.getState();
    store.resetRecipe();

    const initialNodesCount = Object.keys(store.definition.nodes).length;

    // Pasamos a modo publicado
    store.setEditorMode("published");
    expect(useRecipeStore.getState().editorMode).toBe("published");

    // Intentar agregar nodo debe retornar string vacío y no agregar nada
    const newId = store.addNode("navigate");
    expect(newId).toBe("");
    expect(Object.keys(useRecipeStore.getState().definition.nodes).length).toBe(initialNodesCount);

    // Volver a modo edición
    store.setEditorMode("edit");
    expect(useRecipeStore.getState().editorMode).toBe("edit");

    const validNewId = store.addNode("navigate");
    expect(validNewId).not.toBe("");
    expect(Object.keys(useRecipeStore.getState().definition.nodes).length).toBe(initialNodesCount + 1);
  });

  it("impide mutaciones en el store cuando se está inspeccionando una versión histórica (viewingVersion)", () => {
    const store = useRecipeStore.getState();
    store.resetRecipe();

    store.setViewingVersion({
      version: 2,
      definition: {
        schema: "rpa/v1",
        entry: "hist_1",
        nodes: {
          hist_1: { id: "hist_1", type: "navigate", description: "Hist", params: { url: "https://old.com" } },
        },
        edges: [],
      },
      changelog: "Versión histórica 2",
    });

    expect(useRecipeStore.getState().viewingVersion?.version).toBe(2);

    // Intentar mutar
    const newId = store.addNode("click");
    expect(newId).toBe("");

    // Limpiar visualización de versión histórica
    store.setViewingVersion(null);
    expect(useRecipeStore.getState().viewingVersion).toBeNull();
  });
});
