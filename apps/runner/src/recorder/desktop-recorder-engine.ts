import type { RedisEventEmitter } from "../protocol/event-emitter.js";

export interface DesktopRecorderOptions {
  sessionId: string;
  recipeId: string;
  targetWindow?: string;
  typeDebounceMs?: number;
  captureScroll?: boolean;
}

export interface DesktopActionInput {
  type: "click" | "type" | "scroll";
  coordinates?: { x: number; y: number };
  button?: "left" | "right" | "middle";
  text?: string;
  pressEnter?: boolean;
  direction?: "up" | "down";
  amount?: number;
  windowTitle?: string;
  description?: string;
}

export class DesktopRecorderEngine {
  private activeSessions: Map<string, { recipeId: string; targetWindow?: string }> = new Map();

  constructor(private eventEmitter: RedisEventEmitter) {}

  async start(options: DesktopRecorderOptions): Promise<void> {
    const { sessionId, recipeId, targetWindow } = options;
    this.activeSessions.set(sessionId, { recipeId, targetWindow });

    console.log(
      `[DesktopRecorderEngine] Grabación de macros de escritorio iniciada para sesión ${sessionId} (Ventana: ${
        targetWindow || "Cualquiera"
      })`
    );

    // Generar captura inicial de bienvenida / estado de inicio
    const initialThumb = this.generateDesktopThumbnail(
      { x: 100, y: 100 },
      targetWindow || "Escritorio del Sistema"
    );

    // Emitir paso inicial indicando foco / preparación del entorno
    await (this.eventEmitter as any).redis.xadd(
      (this.eventEmitter as any).streamName,
      "*",
      "event",
      "recorder.action",
      "session_id",
      sessionId,
      "recipe_id",
      recipeId,
      "action",
      JSON.stringify({
        type: "click",
        locator: {
          primary: {
            strategy: "vision",
            value: `Ventana [${targetWindow || "Escritorio Activo"}]`,
            score: 90,
          },
          fallbacks: [],
        },
        params: {
          button: "left",
          clickCount: 1,
          targetScope: "desktop",
          coordinates: { x: 100, y: 100 },
          windowTitle: targetWindow || "Escritorio del Sistema",
        },
        preview: {
          image: initialThumb,
          targetScope: "desktop",
          capturedAt: Date.now(),
          windowTitle: targetWindow || "Escritorio del Sistema",
          coordinates: { x: 100, y: 100 },
          elementSnippet: `Foco en ${targetWindow || "Escritorio Activo"}`,
        },
        description: `Macro: Enfocar ${targetWindow || "Ventana Activa"}`,
        url: "desktop://screen",
      }),
      "timestamp",
      Date.now().toString()
    );
  }

  async recordAction(sessionId: string, input: DesktopActionInput): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      console.warn(`[DesktopRecorderEngine] Sesión desconocida ${sessionId}`);
      return;
    }

    const { recipeId, targetWindow } = session;
    const effectiveWindow = input.windowTitle || targetWindow || "Escritorio Activo";
    const coords = input.coordinates || { x: 250, y: 250 };
    const thumbnail = this.generateDesktopThumbnail(coords, effectiveWindow);

    let actionPayload: any;

    if (input.type === "type") {
      actionPayload = {
        type: "type",
        locator: {
          primary: {
            strategy: "vision",
            value: `Coordenadas (${coords.x}, ${coords.y})`,
            score: 85,
          },
          fallbacks: [],
        },
        params: {
          text: input.text || "",
          clear: false,
          pressEnter: Boolean(input.pressEnter),
          targetScope: "desktop",
          coordinates: coords,
          windowTitle: effectiveWindow,
        },
        preview: {
          image: thumbnail,
          targetScope: "desktop",
          capturedAt: Date.now(),
          windowTitle: effectiveWindow,
          coordinates: coords,
          elementSnippet: `Escribir: "${input.text || ""}"`,
        },
        description:
          input.description ||
          `Macro Escritorio: Escribir "${input.text || ""}"${
            input.pressEnter ? " y pulsar Enter" : ""
          } en [${effectiveWindow}]`,
        url: "desktop://screen",
      };
    } else if (input.type === "scroll") {
      const isDown = input.direction !== "up";
      const deltaY = (input.amount || 300) * (isDown ? 1 : -1);
      actionPayload = {
        type: "scroll",
        locator: {
          primary: {
            strategy: "vision",
            value: `Ventana [${effectiveWindow}]`,
            score: 85,
          },
          fallbacks: [],
        },
        params: {
          mode: "coordinates",
          y: deltaY,
          behavior: "smooth",
          targetScope: "desktop",
          coordinates: coords,
          windowTitle: effectiveWindow,
        },
        preview: {
          image: thumbnail,
          targetScope: "desktop",
          capturedAt: Date.now(),
          windowTitle: effectiveWindow,
          coordinates: coords,
          elementSnippet: `Scroll ${isDown ? "abajo" : "arriba"} (${Math.abs(deltaY)}px)`,
        },
        description:
          input.description ||
          `Macro Escritorio: Scroll ${isDown ? "abajo" : "arriba"} (${Math.abs(deltaY)}px) en [${effectiveWindow}]`,
        url: "desktop://screen",
      };
    } else {
      actionPayload = {
        type: "click",
        locator: {
          primary: {
            strategy: "vision",
            value: `x: ${coords.x}, y: ${coords.y}`,
            score: 85,
          },
          fallbacks: [],
        },
        params: {
          button: input.button || "left",
          clickCount: 1,
          targetScope: "desktop",
          coordinates: coords,
          windowTitle: effectiveWindow,
        },
        preview: {
          image: thumbnail,
          targetScope: "desktop",
          capturedAt: Date.now(),
          windowTitle: effectiveWindow,
          coordinates: coords,
          elementSnippet: `Clic en (${coords.x}, ${coords.y})`,
        },
        description:
          input.description ||
          `Macro Escritorio: Clic en (${coords.x}, ${coords.y}) [${effectiveWindow}]`,
        url: "desktop://screen",
      };
    }

    await (this.eventEmitter as any).redis.xadd(
      (this.eventEmitter as any).streamName,
      "*",
      "event",
      "recorder.action",
      "session_id",
      sessionId,
      "recipe_id",
      recipeId,
      "action",
      JSON.stringify(actionPayload),
      "timestamp",
      Date.now().toString()
    );
  }

  generateDesktopThumbnail(coordinates: { x: number; y: number }, windowTitle: string): string {
    const { x, y } = coordinates;
    // Generar SVG nítido y estilizado que muestra la retícula sobre el área de escritorio
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="135" viewBox="0 0 240 135">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#18181b"/>
          <stop offset="100%" stop-color="#09090b"/>
        </linearGradient>
        <pattern id="grid" width="16" height="16" patternUnits="userSpaceOnUse">
          <path d="M 16 0 L 0 0 0 16" fill="none" stroke="#27272a" stroke-width="0.5"/>
        </pattern>
      </defs>
      <rect width="240" height="135" fill="url(#bg)"/>
      <rect width="240" height="135" fill="url(#grid)"/>
      <rect x="0" y="0" width="240" height="22" fill="#27272a" fill-opacity="0.8"/>
      <circle cx="10" cy="11" r="3" fill="#ef4444"/>
      <circle cx="19" cy="11" r="3" fill="#f59e0b"/>
      <circle cx="28" cy="11" r="3" fill="#10b981"/>
      <text x="40" y="14" fill="#a1a1aa" font-family="system-ui, sans-serif" font-size="9" font-weight="500">${escapeXml(
        windowTitle
      )}</text>
      
      <!-- Retícula del cursor -->
      <g transform="translate(120, 75)">
        <circle cx="0" cy="0" r="16" fill="none" stroke="#3b82f6" stroke-width="1.5" stroke-dasharray="3,3" opacity="0.8"/>
        <circle cx="0" cy="0" r="4" fill="#3b82f6"/>
        <line x1="-22" y1="0" x2="22" y2="0" stroke="#60a5fa" stroke-width="1.5"/>
        <line x1="0" y1="-22" x2="0" y2="22" stroke="#60a5fa" stroke-width="1.5"/>
        <rect x="8" y="8" width="60" height="16" rx="3" fill="#1e293b" stroke="#3b82f6" stroke-width="0.75"/>
        <text x="12" y="19" fill="#93c5fd" font-family="monospace" font-size="8">X:${x} Y:${y}</text>
      </g>
    </svg>`;

    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  async stop(sessionId: string): Promise<void> {
    if (this.activeSessions.has(sessionId)) {
      this.activeSessions.delete(sessionId);
      console.log(`[DesktopRecorderEngine] Sesión de escritorio ${sessionId} finalizada.`);
    }
  }

  async closeAll(): Promise<void> {
    this.activeSessions.clear();
  }
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
