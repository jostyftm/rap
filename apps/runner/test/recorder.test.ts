import { describe, it, expect, vi } from "vitest";
import { DesktopRecorderEngine } from "../src/recorder/desktop-recorder-engine.js";

describe("DesktopRecorderEngine (Macros de Escritorio)", () => {
  it("inicia una sesión de escritorio y emite evento con miniatura visual SVG", async () => {
    const xaddMock = vi.fn().mockResolvedValue("1-0");
    const fakeEventEmitter = {
      streamName: "rpa:events",
      redis: {
        xadd: xaddMock,
      },
    } as any;

    const desktopRecorder = new DesktopRecorderEngine(fakeEventEmitter);
    await desktopRecorder.start({
      sessionId: "sess_desk_123",
      recipeId: "rec_456",
      targetWindow: "Calculadora",
    });

    expect(xaddMock).toHaveBeenCalled();
    const calls = xaddMock.mock.calls;
    expect(calls.length).toBeGreaterThan(0);

    const callArgs = calls[0];
    const eventTypeIndex = callArgs.indexOf("event");
    expect(callArgs[eventTypeIndex + 1]).toBe("recorder.action");

    const actionIndex = callArgs.indexOf("action");
    const actionPayload = JSON.parse(callArgs[actionIndex + 1]);

    expect(actionPayload.type).toBe("click");
    expect(actionPayload.params.targetScope).toBe("desktop");
    expect(actionPayload.params.windowTitle).toBe("Calculadora");
    expect(actionPayload.preview).toBeDefined();
    expect(actionPayload.preview.targetScope).toBe("desktop");
    expect(actionPayload.preview.image).toContain("data:image/svg+xml;utf8");
  });

  it("registra acciones de tipeo macro y clics por coordenadas con preview", async () => {
    const xaddMock = vi.fn().mockResolvedValue("2-0");
    const fakeEventEmitter = {
      streamName: "rpa:events",
      redis: {
        xadd: xaddMock,
      },
    } as any;

    const desktopRecorder = new DesktopRecorderEngine(fakeEventEmitter);
    await desktopRecorder.start({
      sessionId: "sess_desk_test",
      recipeId: "rec_789",
      targetWindow: "Bloc de notas",
    });

    xaddMock.mockClear();

    // 1. Registrar clic en coordenadas
    await desktopRecorder.recordAction("sess_desk_test", {
      type: "click",
      coordinates: { x: 300, y: 150 },
      button: "left",
      windowTitle: "Bloc de notas",
    });

    expect(xaddMock).toHaveBeenCalledTimes(1);
    let action = JSON.parse(xaddMock.mock.calls[0][xaddMock.mock.calls[0].indexOf("action") + 1]);
    expect(action.type).toBe("click");
    expect(action.params.coordinates).toEqual({ x: 300, y: 150 });
    expect(action.preview.coordinates).toEqual({ x: 300, y: 150 });

    xaddMock.mockClear();

    // 2. Registrar tipeo con Enter
    await desktopRecorder.recordAction("sess_desk_test", {
      type: "type",
      text: "Texto automatizado",
      pressEnter: true,
      windowTitle: "Bloc de notas",
    });

    expect(xaddMock).toHaveBeenCalledTimes(1);
    action = JSON.parse(xaddMock.mock.calls[0][xaddMock.mock.calls[0].indexOf("action") + 1]);
    expect(action.type).toBe("type");
    expect(action.params.text).toBe("Texto automatizado");
    expect(action.params.pressEnter).toBe(true);
    expect(action.preview.targetScope).toBe("desktop");

    await desktopRecorder.stop("sess_desk_test");
  });
});
