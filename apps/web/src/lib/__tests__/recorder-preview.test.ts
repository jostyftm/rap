import { describe, it, expect, beforeEach } from "vitest";
import { useRecipeStore } from "@/stores/use-recipe-store";

describe("Macro Action Recorder Store & Previews", () => {
  beforeEach(() => {
    useRecipeStore.getState().setRecipe({
      id: "rec_test",
      name: "Test Recipe",
      definition: { schema: "rpa/v1", name: "Test Recipe", entry: "", nodes: {}, edges: [] },
      version: 1,
    });
    useRecipeStore.getState().stopRecording();
  });

  it("inicia la sesión en modo navegador o escritorio correctamente", () => {
    const store = useRecipeStore.getState();

    // 1. Modo navegador
    store.startRecording("sess_web_1", "browser");
    expect(useRecipeStore.getState().isRecording).toBe(true);
    expect(useRecipeStore.getState().recordingSessionId).toBe("sess_web_1");
    expect(useRecipeStore.getState().recordingMode).toBe("browser");
    expect(useRecipeStore.getState().recordedActionsCount).toBe(0);

    // 2. Modo escritorio
    store.startRecording("sess_desk_1", "desktop");
    expect(useRecipeStore.getState().isRecording).toBe(true);
    expect(useRecipeStore.getState().recordingSessionId).toBe("sess_desk_1");
    expect(useRecipeStore.getState().recordingMode).toBe("desktop");

    store.stopRecording();
    expect(useRecipeStore.getState().isRecording).toBe(false);
    expect(useRecipeStore.getState().recordingSessionId).toBeNull();
  });

  it("agrega acciones de navegador con previsualización visual (preview) y la enlaza en el flujo", () => {
    const store = useRecipeStore.getState();
    store.startRecording("sess_1", "browser");

    store.appendRecordedAction({
      type: "click",
      locator: { primary: { strategy: "css", value: "#login-btn", score: 90 }, fallbacks: [] },
      params: { button: "left" },
      description: "Clic en Botón Ingresar",
      preview: {
        image: "data:image/jpeg;base64,mockWebThumbnail",
        targetScope: "browser",
        capturedAt: Date.now(),
        elementSnippet: "#login-btn",
      },
    });

    const state = useRecipeStore.getState();
    expect(state.recordedActionsCount).toBe(1);

    const nodeIds = Object.keys(state.definition.nodes);
    expect(nodeIds.length).toBe(1);
    const node = state.definition.nodes[nodeIds[0]];

    expect(node.type).toBe("click");
    expect(node.description).toBe("Clic en Botón Ingresar");
    expect(node.preview).toBeDefined();
    expect(node.preview?.image).toBe("data:image/jpeg;base64,mockWebThumbnail");
    expect(node.preview?.targetScope).toBe("browser");
    expect(state.selectedNodeId).toBe(node.id);
  });

  it("agrega macros de escritorio con coordenadas, ventana y miniatura visual", () => {
    const store = useRecipeStore.getState();
    store.startRecording("sess_desk_2", "desktop");

    // Acción 1: Clic en coordenadas
    store.appendRecordedAction({
      type: "click",
      locator: { primary: { strategy: "vision", value: "x: 420, y: 180", score: 85 }, fallbacks: [] },
      params: {
        button: "left",
        clickCount: 1,
        targetScope: "desktop",
        coordinates: { x: 420, y: 180 },
        windowTitle: "Calculadora",
      },
      description: "Macro: Clic en Calculadora",
      preview: {
        image: "data:image/svg+xml;utf8,mockDesktopSvg",
        targetScope: "desktop",
        coordinates: { x: 420, y: 180 },
        windowTitle: "Calculadora",
        capturedAt: Date.now(),
      },
    });

    // Acción 2: Tipeo con Enter
    store.appendRecordedAction({
      type: "type",
      locator: { primary: { strategy: "vision", value: "x: 420, y: 180", score: 85 }, fallbacks: [] },
      params: {
        text: "99 * 2",
        pressEnter: true,
        targetScope: "desktop",
        windowTitle: "Calculadora",
      },
      description: "Macro: Escribir operación",
      preview: {
        targetScope: "desktop",
        windowTitle: "Calculadora",
      },
    });

    const state = useRecipeStore.getState();
    expect(state.recordedActionsCount).toBe(2);

    const nodeIds = Object.keys(state.definition.nodes);
    expect(nodeIds.length).toBe(2);

    const firstNode = state.definition.nodes[nodeIds[0]];
    const secondNode = state.definition.nodes[nodeIds[1]];

    expect((firstNode.params as any).targetScope).toBe("desktop");
    expect((firstNode.params as any).coordinates).toEqual({ x: 420, y: 180 });
    expect(firstNode.preview?.image).toBe("data:image/svg+xml;utf8,mockDesktopSvg");
    expect(firstNode.next).toBe(secondNode.id);

    expect(secondNode.type).toBe("type");
    expect((secondNode.params as any).pressEnter).toBe(true);
    expect((secondNode.params as any).text).toBe("99 * 2");
  });

  it("fusiona tipeos consecutivos sobre el mismo campo actualizando el texto en un solo nodo type", () => {
    const store = useRecipeStore.getState();
    store.startRecording("sess_typing", "browser");

    // Primera ráfaga: 'usuario'
    store.appendRecordedAction({
      type: "type",
      locator: { primary: { strategy: "css", value: "#username", score: 90 }, fallbacks: [] },
      params: { text: "usuario", clear: true },
      description: "Escribir en #username",
    });

    let state = useRecipeStore.getState();
    expect(state.recordedActionsCount).toBe(1);
    let nodeIds = Object.keys(state.definition.nodes);
    expect(nodeIds.length).toBe(1);
    expect((state.definition.nodes[nodeIds[0]].params as any).text).toBe("usuario");

    // Segunda ráfaga pausada: 'usuario@empresa.com' en el mismo campo
    store.appendRecordedAction({
      type: "type",
      locator: { primary: { strategy: "css", value: "#username", score: 90 }, fallbacks: [] },
      params: { text: "usuario@empresa.com", clear: true, pressEnter: true },
      description: "Escribir y pulsar Enter en #username",
    });

    state = useRecipeStore.getState();
    // No debe haber creado un segundo nodo redundante
    nodeIds = Object.keys(state.definition.nodes);
    expect(nodeIds.length).toBe(1);
    const mergedNode = state.definition.nodes[nodeIds[0]];
    expect((mergedNode.params as any).text).toBe("usuario@empresa.com");
    expect((mergedNode.params as any).pressEnter).toBe(true);
  });

  it("crea un nuevo nodo type al cambiar a un campo diferente", () => {
    const store = useRecipeStore.getState();
    store.startRecording("sess_fields", "browser");

    store.appendRecordedAction({
      type: "type",
      locator: { primary: { strategy: "css", value: "#user", score: 90 }, fallbacks: [] },
      params: { text: "admin", clear: true },
      description: "Escribir en #user",
    });

    store.appendRecordedAction({
      type: "type",
      locator: { primary: { strategy: "css", value: "#password", score: 90 }, fallbacks: [] },
      params: { text: "secret123", clear: true },
      description: "Escribir en #password",
    });

    const state = useRecipeStore.getState();
    const nodeIds = Object.keys(state.definition.nodes);
    expect(nodeIds.length).toBe(2);
    expect((state.definition.nodes[nodeIds[0]].params as any).text).toBe("admin");
    expect((state.definition.nodes[nodeIds[1]].params as any).text).toBe("secret123");
  });

  it("registra y fusiona desplazamientos de scroll consecutivos por coordenadas", () => {
    const store = useRecipeStore.getState();
    store.startRecording("sess_scroll", "browser");

    // Primer movimiento de rueda
    store.appendRecordedAction({
      type: "scroll",
      params: { mode: "coordinates", y: 350, behavior: "smooth" },
      description: "Desplazar hacia abajo (350px)",
      preview: { image: "data:image/jpeg;base64,thumb1" },
    });

    let state = useRecipeStore.getState();
    let nodeIds = Object.keys(state.definition.nodes);
    expect(nodeIds.length).toBe(1);
    expect((state.definition.nodes[nodeIds[0]].params as any).y).toBe(350);

    // Segundo movimiento de rueda en la misma dirección
    store.appendRecordedAction({
      type: "scroll",
      params: { mode: "coordinates", y: 200, behavior: "smooth" },
      description: "Desplazar hacia abajo (200px)",
      preview: { image: "data:image/jpeg;base64,thumb2" },
    });

    state = useRecipeStore.getState();
    nodeIds = Object.keys(state.definition.nodes);
    expect(nodeIds.length).toBe(1); // Mismo nodo con distancia acumulada
    const scrollNode = state.definition.nodes[nodeIds[0]];
    expect(scrollNode.type).toBe("scroll");
    expect((scrollNode.params as any).y).toBe(550);
    expect(scrollNode.description).toContain("550px");
  });

  it("registra scroll al fondo (bottom) y al inicio (top)", () => {
    const store = useRecipeStore.getState();
    store.startRecording("sess_scroll_edge", "browser");

    store.appendRecordedAction({
      type: "scroll",
      params: { mode: "bottom", behavior: "smooth" },
      description: "Desplazar al final de la página",
    });

    store.appendRecordedAction({
      type: "scroll",
      params: { mode: "top", behavior: "smooth" },
      description: "Desplazar al inicio de la página",
    });

    const state = useRecipeStore.getState();
    const nodeIds = Object.keys(state.definition.nodes);
    expect(nodeIds.length).toBe(2);
    expect((state.definition.nodes[nodeIds[0]].params as any).mode).toBe("bottom");
    expect((state.definition.nodes[nodeIds[1]].params as any).mode).toBe("top");
  });
});
