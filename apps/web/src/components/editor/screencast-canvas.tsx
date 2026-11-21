"use client";

import React, { useEffect, useRef, useState } from "react";
import { RefreshCw, WifiOff } from "lucide-react";

export interface ScreencastStats {
  fps: number;
  latencyMs: number | null;
  connected: boolean;
}

export interface ScreencastCanvasProps {
  wsUrl: string;
  viewportWidth: number;
  viewportHeight: number;
  armedNodeId?: string | null;
  onMessage: (msg: any) => void;
  onSenderReady: (fn: ((msg: Record<string, unknown>) => void) | null) => void;
  onStatsChange?: (stats: ScreencastStats) => void;
  onReconnect?: () => void;
}

export function mapClientToViewportCoords(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  viewportWidth: number,
  viewportHeight: number
): { x: number; y: number } {
  if (rect.width <= 0 || rect.height <= 0) {
    return { x: 0, y: 0 };
  }
  const rx = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  const ry = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
  return {
    x: Math.round(rx * viewportWidth),
    y: Math.round(ry * viewportHeight),
  };
}

export function getCdpModifiers(e: {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}): number {
  return (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0);
}

export function mapMouseButton(button: number): "left" | "middle" | "right" | "none" {
  switch (button) {
    case 0:
      return "left";
    case 1:
      return "middle";
    case 2:
      return "right";
    default:
      return "none";
  }
}

export function buildCdpKeyPayload(
  action: "keyDown" | "keyUp",
  e: {
    key: string;
    code: string;
    keyCode?: number;
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
  }
): Record<string, unknown> {
  const modifiers = getCdpModifiers(e);
  const hasSystemMod = e.ctrlKey || e.metaKey || e.altKey;
  let text: string | undefined;

  if (action === "keyDown") {
    if (e.key === "Enter") {
      text = "\r";
    } else if (e.key.length === 1 && !hasSystemMod) {
      text = e.key;
    }
  }

  const payload: Record<string, unknown> = {
    type: "input:key",
    action,
    key: e.key,
    code: e.code,
    windowsVirtualKeyCode: e.keyCode || 0,
    modifiers,
  };
  if (text !== undefined) {
    payload.text = text;
  }
  return payload;
}

const MOUSE_MOVE_THROTTLE_MS = 25;

export function ScreencastCanvas({
  wsUrl,
  viewportWidth,
  viewportHeight,
  armedNodeId,
  onMessage,
  onSenderReady,
  onStatsChange,
  onReconnect,
}: ScreencastCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  const onSenderReadyRef = useRef(onSenderReady);
  const onStatsChangeRef = useRef(onStatsChange);
  const lastMoveTsRef = useRef(0);
  const lastViewportRef = useRef({ width: viewportWidth, height: viewportHeight });

  const [connected, setConnected] = useState(false);
  const [hasFrame, setHasFrame] = useState(false);
  const [disconnected, setDisconnected] = useState(false);
  const [stats, setStats] = useState<{ fps: number; latencyMs: number | null }>({
    fps: 0,
    latencyMs: null,
  });

  useEffect(() => {
    onMessageRef.current = onMessage;
    onSenderReadyRef.current = onSenderReady;
    onStatsChangeRef.current = onStatsChange;
  });

  const sendWs = (msg: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  };

  useEffect(() => {
    if (!wsUrl) return;

    let cancelled = false;
    let decoding = false;
    let queuedFrame: ArrayBuffer | null = null;
    let frameTimes: number[] = [];
    let latestLatency: number | null = null;

    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    const flushStats = (isConn: boolean, fpsVal: number) => {
      const next = { fps: fpsVal, latencyMs: latestLatency };
      setStats(next);
      onStatsChangeRef.current?.({ ...next, connected: isConn });
    };

    const drawFrame = async (buf: ArrayBuffer) => {
      if (cancelled) return;
      if (decoding) {
        queuedFrame = buf;
        return;
      }
      decoding = true;

      try {
        const blob = new Blob([buf], { type: "image/jpeg" });
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");

        if (canvas && ctx) {
          if (typeof createImageBitmap === "function") {
            const bitmap = await createImageBitmap(blob);
            if (!cancelled) {
              ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
              setHasFrame(true);
            }
            if (typeof bitmap.close === "function") bitmap.close();
          } else if (typeof URL.createObjectURL === "function") {
            await new Promise<void>((resolve) => {
              const url = URL.createObjectURL(blob);
              const img = new Image();
              img.onload = () => {
                if (!cancelled) {
                  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                  setHasFrame(true);
                }
                URL.revokeObjectURL(url);
                resolve();
              };
              img.onerror = () => {
                URL.revokeObjectURL(url);
                resolve();
              };
              img.src = url;
            });
          }
        }

        if (!cancelled && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "screencast:ack" }));
        }

        const now = Date.now();
        frameTimes = frameTimes.filter((t) => now - t <= 1000);
        frameTimes.push(now);
        if (!cancelled) {
          flushStats(true, frameTimes.length);
        }
      } catch {
        // Ignorar fotograma corrupto transitorio
      } finally {
        decoding = false;
        if (queuedFrame && !cancelled) {
          const next = queuedFrame;
          queuedFrame = null;
          void drawFrame(next);
        }
      }
    };

    ws.onopen = () => {
      if (cancelled) return;
      setConnected(true);
      setDisconnected(false);
      onSenderReadyRef.current((msg) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(msg));
        }
      });
      onStatsChangeRef.current?.({ fps: 0, latencyMs: null, connected: true });
      ws.send(JSON.stringify({ type: "screencast:ping", ts: Date.now() }));
    };

    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "screencast:ping", ts: Date.now() }));
      }
    }, 2000);

    ws.onmessage = (event) => {
      if (cancelled) return;
      if (typeof event.data === "string") {
        let msg: any;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        if (msg?.type === "screencast:pong" && typeof msg.ts === "number") {
          latestLatency = Math.max(0, Date.now() - msg.ts);
          flushStats(true, frameTimes.length);
          return;
        }
        onMessageRef.current(msg);
        return;
      }

      if (event.data instanceof ArrayBuffer) {
        void drawFrame(event.data);
      } else if (event.data instanceof Blob) {
        void event.data.arrayBuffer().then((buf) => {
          if (!cancelled) void drawFrame(buf);
        });
      }
    };

    ws.onclose = () => {
      if (cancelled) return;
      setConnected(false);
      setDisconnected(true);
      onSenderReadyRef.current(null);
      onStatsChangeRef.current?.({ fps: 0, latencyMs: latestLatency, connected: false });
    };

    ws.onerror = () => {
      if (cancelled) return;
      setDisconnected(true);
    };

    return () => {
      cancelled = true;
      clearInterval(pingInterval);
      onSenderReadyRef.current(null);
      wsRef.current = null;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };
  }, [wsUrl]);

  // Sincronizar cambios de preset de viewport con el navegador remoto
  useEffect(() => {
    const prev = lastViewportRef.current;
    if (prev.width === viewportWidth && prev.height === viewportHeight) return;
    lastViewportRef.current = { width: viewportWidth, height: viewportHeight };

    const timer = setTimeout(() => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "browser:resize",
            width: viewportWidth,
            height: viewportHeight,
          })
        );
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [viewportWidth, viewportHeight]);

  // Wheel no pasivo para evitar scroll del contenedor padre y desplazar la página remota
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const { x, y } = mapClientToViewportCoords(
        e.clientX,
        e.clientY,
        rect,
        viewportWidth,
        viewportHeight
      );
      sendWs({
        type: "input:mouse",
        action: "mouseWheel",
        x,
        y,
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        modifiers: getCdpModifiers(e),
      });
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [viewportWidth, viewportHeight]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    canvasRef.current?.focus();
    const rect = e.currentTarget.getBoundingClientRect();
    const { x, y } = mapClientToViewportCoords(
      e.clientX,
      e.clientY,
      rect,
      viewportWidth,
      viewportHeight
    );
    sendWs({
      type: "input:mouse",
      action: "mousePressed",
      x,
      y,
      button: mapMouseButton(e.button),
      buttons: e.buttons,
      clickCount: Math.max(1, e.detail || 1),
      modifiers: getCdpModifiers(e),
    });
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const { x, y } = mapClientToViewportCoords(
      e.clientX,
      e.clientY,
      rect,
      viewportWidth,
      viewportHeight
    );
    sendWs({
      type: "input:mouse",
      action: "mouseReleased",
      x,
      y,
      button: mapMouseButton(e.button),
      buttons: e.buttons,
      clickCount: Math.max(1, e.detail || 1),
      modifiers: getCdpModifiers(e),
    });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const now = Date.now();
    if (now - lastMoveTsRef.current < MOUSE_MOVE_THROTTLE_MS) return;
    lastMoveTsRef.current = now;
    const rect = e.currentTarget.getBoundingClientRect();
    const { x, y } = mapClientToViewportCoords(
      e.clientX,
      e.clientY,
      rect,
      viewportWidth,
      viewportHeight
    );
    sendWs({
      type: "input:mouse",
      action: "mouseMoved",
      x,
      y,
      button: e.buttons ? mapMouseButton(e.button) : "none",
      buttons: e.buttons,
      modifiers: getCdpModifiers(e),
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    // Permitir Ctrl/Cmd+V para que dispare onPaste con el texto del portapapeles
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    sendWs(buildCdpKeyPayload("keyDown", e));
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.stopPropagation();
    sendWs(buildCdpKeyPayload("keyUp", e));
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLCanvasElement>) => {
    const text = e.clipboardData?.getData("text/plain");
    if (!text) return;
    e.preventDefault();
    sendWs({ type: "input:text", text });
  };

  return (
    <div className="relative h-[calc(100%-1.75rem)] w-full flex-1 select-none bg-black">
      <canvas
        ref={canvasRef}
        width={viewportWidth}
        height={viewportHeight}
        tabIndex={0}
        aria-label="Navegador remoto interactivo"
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onPaste={handlePaste}
        className={`h-full w-full block outline-none ${
          armedNodeId ? "cursor-crosshair" : "cursor-default"
        }`}
      />

      {/* HUD sutil de métricas en tiempo real */}
      {connected && hasFrame && (
        <div className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[9.5px] text-zinc-200 backdrop-blur-sm">
          {stats.fps} fps{stats.latencyMs !== null ? ` · ${stats.latencyMs} ms` : ""}
        </div>
      )}

      {!hasFrame && !disconnected && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-panel/85 text-[11px] text-fg-muted">
          Conectando transmisión del navegador remoto…
        </div>
      )}

      {disconnected && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-panel/90 p-4 text-center backdrop-blur-sm">
          <WifiOff className="h-5 w-5 text-warning-text" />
          <p className="text-[11.5px] font-medium text-fg">
            Conexión con el navegador remoto cerrada
          </p>
          {onReconnect && (
            <button
              type="button"
              onClick={onReconnect}
              className="inline-flex items-center gap-1.5 rounded bg-accent px-2.5 py-1 text-[11px] font-medium text-accent-ink hover:bg-accent-hover transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              Reconectar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
