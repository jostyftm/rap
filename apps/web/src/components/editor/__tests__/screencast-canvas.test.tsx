import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act, screen } from "@testing-library/react";
import {
  ScreencastCanvas,
  mapClientToViewportCoords,
  getCdpModifiers,
  mapMouseButton,
  buildCdpKeyPayload,
} from "../screencast-canvas";

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readyState = MockWebSocket.CONNECTING;
  binaryType = "blob";
  sent: string[] = [];
  url: string;
  onopen: ((ev: any) => void) | null = null;
  onmessage: ((ev: { data: any }) => void) | null = null;
  onclose: ((ev: any) => void) | null = null;
  onerror: ((ev: any) => void) | null = null;
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({});
  });

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send = vi.fn((data: string) => {
    this.sent.push(data);
  });

  triggerOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.({});
  }

  triggerMessage(data: any) {
    this.onmessage?.({ data });
  }
}

describe("ScreencastCanvas helpers & component", () => {
  const OriginalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    MockWebSocket.instances = [];
    (globalThis as any).WebSocket = MockWebSocket;
  });

  afterEach(() => {
    (globalThis as any).WebSocket = OriginalWebSocket;
  });

  it("mapea correctamente coordenadas escaladas al viewport remoto", () => {
    const rect = { left: 100, top: 50, width: 640, height: 400 };
    expect(mapClientToViewportCoords(420, 250, rect, 1280, 800)).toEqual({ x: 640, y: 400 });
    expect(mapClientToViewportCoords(50, 10, rect, 1280, 800)).toEqual({ x: 0, y: 0 });
    expect(mapClientToViewportCoords(900, 900, rect, 1280, 800)).toEqual({ x: 1280, y: 800 });
  });

  it("calcula bitmask de modificadores CDP y botones de ratón", () => {
    expect(getCdpModifiers({ altKey: true, ctrlKey: true, metaKey: false, shiftKey: true })).toBe(11);
    expect(mapMouseButton(0)).toBe("left");
    expect(mapMouseButton(1)).toBe("middle");
    expect(mapMouseButton(2)).toBe("right");
  });

  it("construye payloads CDP de teclado para caracteres, Enter y atajos", () => {
    expect(
      buildCdpKeyPayload("keyDown", {
        key: "a",
        code: "KeyA",
        keyCode: 65,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
      })
    ).toEqual({
      type: "input:key",
      action: "keyDown",
      key: "a",
      code: "KeyA",
      windowsVirtualKeyCode: 65,
      modifiers: 0,
      text: "a",
    });

    expect(
      buildCdpKeyPayload("keyDown", {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
      })
    ).toMatchObject({ text: "\r", code: "Enter" });

    expect(
      buildCdpKeyPayload("keyDown", {
        key: "c",
        code: "KeyC",
        keyCode: 67,
        altKey: false,
        ctrlKey: true,
        metaKey: false,
        shiftKey: false,
      })
    ).not.toHaveProperty("text");
  });

  it("envía ack en frames binarios, despacha mouse/teclado y reenvía mensajes rpa:*", async () => {
    const onMessage = vi.fn();
    const onSenderReady = vi.fn();

    const { unmount } = render(
      <ScreencastCanvas
        wsUrl="ws://localhost:8085/live/ws/sc_1?token=abc"
        viewportWidth={1280}
        viewportHeight={800}
        armedNodeId="node_1"
        onMessage={onMessage}
        onSenderReady={onSenderReady}
      />
    );

    expect(MockWebSocket.instances).toHaveLength(1);
    const ws = MockWebSocket.instances[0];
    expect(ws.binaryType).toBe("arraybuffer");

    act(() => {
      ws.triggerOpen();
    });

    expect(onSenderReady).toHaveBeenCalledTimes(1);
    expect(typeof onSenderReady.mock.calls[0][0]).toBe("function");

    // Frame binario -> debe enviar screencast:ack
    await act(async () => {
      ws.triggerMessage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer);
      await Promise.resolve();
    });
    expect(ws.sent.some((s) => JSON.parse(s).type === "screencast:ack")).toBe(true);

    // Mensaje JSON rpa:pick -> debe reenviarse a onMessage
    act(() => {
      ws.triggerMessage(JSON.stringify({ type: "rpa:pick", nodeId: "node_1", candidates: [] }));
    });
    expect(onMessage).toHaveBeenCalledWith({ type: "rpa:pick", nodeId: "node_1", candidates: [] });

    // Interacciones de ratón sobre el canvas
    const canvas = screen.getByLabelText("Navegador remoto interactivo");
    (canvas as any).getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 400 });

    fireEvent.mouseDown(canvas, { clientX: 320, clientY: 200, button: 0, buttons: 1 });
    fireEvent.mouseUp(canvas, { clientX: 320, clientY: 200, button: 0, buttons: 0 });
    fireEvent.keyDown(canvas, { key: "k", code: "KeyK", keyCode: 75 });

    const sentPayloads = ws.sent.map((s) => JSON.parse(s));
    expect(sentPayloads).toContainEqual(
      expect.objectContaining({ type: "input:mouse", action: "mousePressed", x: 640, y: 400, clickCount: 1 })
    );
    expect(sentPayloads).toContainEqual(
      expect.objectContaining({ type: "input:mouse", action: "mouseReleased", x: 640, y: 400, clickCount: 1 })
    );
    expect(sentPayloads).toContainEqual(
      expect.objectContaining({ type: "input:key", action: "keyDown", key: "k", text: "k" })
    );

    unmount();
    expect(onSenderReady).toHaveBeenLastCalledWith(null);
    expect(ws.close).toHaveBeenCalled();
  });
});
