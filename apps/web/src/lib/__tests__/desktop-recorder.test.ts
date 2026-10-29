import { describe, it, expect, beforeEach } from "vitest";
import { useRecipeStore } from "@/stores/use-recipe-store";
import { validateRecipeDslDetailed } from "@rpa/dsl";

describe("Desktop Screen Macro Recorder Actions", () => {
  beforeEach(() => {
    useRecipeStore.getState().setRecipe({
      id: "rec_desktop_test",
      name: "Desktop Test Recipe",
      definition: { schema: "rpa/v1", name: "Desktop Test Recipe", entry: "", nodes: {}, edges: [] },
      version: 1,
    });
    useRecipeStore.getState().stopRecording();
  });

  it("registra un clic de escritorio en coordenadas con previsualización visual", () => {
    const store = useRecipeStore.getState();
    store.startRecording("sess_desk_test", "desktop");

    store.appendRecordedAction({
      type: "click",
      locator: { primary: { strategy: "vision", value: "x: 540, y: 320", score: 85 }, fallbacks: [] },
      params: {
        button: "left",
        clickCount: 1,
        targetScope: "desktop",
        coordinates: { x: 540, y: 320 },
        windowTitle: "Calculadora",
      },
      preview: {
        image: "data:image/jpeg;base64,mockDesktopCrop",
        targetScope: "desktop",
        coordinates: { x: 540, y: 320 },
        windowTitle: "Calculadora",
        capturedAt: Date.now(),
        elementSnippet: "Clic en (540, 320)",
      },
      description: "Macro Escritorio: Clic en (540, 320) [Calculadora]",
      url: "desktop://screen",
    });

    const state = useRecipeStore.getState();
    expect(state.recordedActionsCount).toBe(1);

    const nodeIds = Object.keys(state.definition.nodes);
    expect(nodeIds.length).toBe(1);
    const node = state.definition.nodes[nodeIds[0]];

    expect(node.type).toBe("click");
    expect((node.params as any).targetScope).toBe("desktop");
    expect((node.params as any).coordinates).toEqual({ x: 540, y: 320 });
    expect(node.preview?.image).toBe("data:image/jpeg;base64,mockDesktopCrop");

    const validation = validateRecipeDslDetailed(state.definition);
    expect(validation.success).toBe(true);
  });

  it("registra tipeo en coordenadas de escritorio con tecla Enter", () => {
    const store = useRecipeStore.getState();
    store.startRecording("sess_desk_type", "desktop");

    store.appendRecordedAction({
      type: "type",
      locator: { primary: { strategy: "vision", value: "Coordenadas (200, 150)", score: 85 }, fallbacks: [] },
      params: {
        text: "echo 'Hola Mundo'",
        clear: false,
        pressEnter: true,
        targetScope: "desktop",
        coordinates: { x: 200, y: 150 },
        windowTitle: "Terminal",
      },
      preview: {
        image: "data:image/jpeg;base64,terminalCrop",
        targetScope: "desktop",
        coordinates: { x: 200, y: 150 },
        windowTitle: "Terminal",
        elementSnippet: 'Escribir: "echo \'Hola Mundo\'"',
      },
      description: "Macro Escritorio: Escribir en Terminal",
      url: "desktop://screen",
    });

    const state = useRecipeStore.getState();
    const nodeIds = Object.keys(state.definition.nodes);
    expect(nodeIds.length).toBe(1);
    const node = state.definition.nodes[nodeIds[0]];

    expect(node.type).toBe("type");
    expect((node.params as any).targetScope).toBe("desktop");
    expect((node.params as any).pressEnter).toBe(true);
    expect((node.params as any).text).toBe("echo 'Hola Mundo'");

    const validation = validateRecipeDslDetailed(state.definition);
    expect(validation.success).toBe(true);
  });

  it("registra desplazamiento (scroll) en coordenadas de escritorio", () => {
    const store = useRecipeStore.getState();
    store.startRecording("sess_desk_scroll", "desktop");

    store.appendRecordedAction({
      type: "scroll",
      locator: { primary: { strategy: "vision", value: "x: 600, y: 400", score: 85 }, fallbacks: [] },
      params: {
        mode: "coordinates",
        y: 400,
        behavior: "smooth",
        targetScope: "desktop",
        coordinates: { x: 600, y: 400 },
        windowTitle: "Excel",
      },
      preview: {
        image: "data:image/jpeg;base64,excelCrop",
        targetScope: "desktop",
        coordinates: { x: 600, y: 400 },
        windowTitle: "Excel",
        elementSnippet: "Scroll abajo (400px)",
      },
      description: "Macro Escritorio: Scroll abajo en (600, 400)",
      url: "desktop://screen",
    });

    const state = useRecipeStore.getState();
    const nodeIds = Object.keys(state.definition.nodes);
    expect(nodeIds.length).toBe(1);
    const node = state.definition.nodes[nodeIds[0]];

    expect(node.type).toBe("scroll");
    expect((node.params as any).targetScope).toBe("desktop");
    expect((node.params as any).y).toBe(400);

    const validation = validateRecipeDslDetailed(state.definition);
    expect(validation.success).toBe(true);
  });
});
