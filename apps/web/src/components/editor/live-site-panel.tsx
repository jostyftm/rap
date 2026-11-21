"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Globe,
  ExternalLink,
  MonitorPlay,
  ArrowLeft,
  ArrowRight,
  RotateCw,
  X,
  Loader2,
  MousePointerClick,
  RefreshCw,
  AlertCircle,
  Smartphone,
  Monitor,
  Laptop,
  Tv,
  Maximize2,
  Columns,
  Shrink,
  ZoomIn,
  ShieldCheck,
  Lock,
} from "lucide-react";
import type { RecipeNode } from "@rpa/dsl";
import { useLiveStore, type LiveKind } from "../../stores/use-live-store";
import { useRecipeStore } from "../../stores/use-recipe-store";
import {
  useLayoutStore,
  VIEWPORT_PRESETS,
  type LiveViewportMode,
} from "../../stores/use-layout-store";
import { apiFetch } from "../../lib/api-client";
import { getEcho } from "../../lib/echo";
import { isProxyHostileHost } from "../../lib/live-compat";
import { ScreencastCanvas, type ScreencastStats } from "./screencast-canvas";
import { Badge, Button, IconButton } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

function initialUrl(): string {
  const { definition } = useRecipeStore.getState();
  const entry = definition.nodes[definition.entry];
  const nav =
    entry?.type === "navigate"
      ? entry
      : Object.values(definition.nodes).find(
          (n): n is Extract<RecipeNode, { type: "navigate" }> => n.type === "navigate"
        );
  return nav?.params?.url || "http://localhost:8099/index.html";
}

const VIEWPORT_OPTIONS: Array<{
  value: LiveViewportMode;
  label: string;
  icon: React.ReactNode;
}> = [
  { value: "desktop", label: "Web (1280)", icon: <Monitor className="h-3.5 w-3.5" /> },
  { value: "laptop", label: "Laptop", icon: <Laptop className="h-3.5 w-3.5" /> },
  { value: "full_hd", label: "Full HD", icon: <Tv className="h-3.5 w-3.5" /> },
  { value: "mobile", label: "Móvil", icon: <Smartphone className="h-3.5 w-3.5" /> },
  { value: "fit", label: "Fluido", icon: <Shrink className="h-3.5 w-3.5" /> },
];

interface LiveSitePanelProps {
  /** En el modal de nodo el layout del editor no es visible. */
  showLayoutToggle?: boolean;
}

export function LiveSitePanel({ showLayoutToggle = true }: LiveSitePanelProps) {
  const recipeId = useRecipeStore((s) => s.recipeId);
  const status = useLiveStore((s) => s.status);
  const kind = useLiveStore((s) => s.kind);
  const proxyUrl = useLiveStore((s) => s.proxyUrl);
  const wsUrl = useLiveStore((s) => s.wsUrl);
  const remoteViewport = useLiveStore((s) => s.viewport);
  const sessionId = useLiveStore((s) => s.sessionId);
  const currentUrl = useLiveStore((s) => s.currentUrl);
  const pageTitle = useLiveStore((s) => s.pageTitle);
  const armedNodeId = useLiveStore((s) => s.armedNodeId);
  const error = useLiveStore((s) => s.error);
  const sender = useLiveStore((s) => s.sender);
  const startEmbedded = useLiveStore((s) => s.startEmbedded);
  const startScreencast = useLiveStore((s) => s.startScreencast);
  const startExternal = useLiveStore((s) => s.startExternal);
  const handleMessage = useLiveStore((s) => s.handleMessage);
  const setSender = useLiveStore((s) => s.setSender);
  const close = useLiveStore((s) => s.close);
  const disarm = useLiveStore((s) => s.disarm);

  const layoutMode = useLayoutStore((s) => s.mode);
  const setLayoutMode = useLayoutStore((s) => s.setMode);
  const viewportMode = useLayoutStore((s) => s.viewportMode);
  const setViewportMode = useLayoutStore((s) => s.setViewportMode);
  const viewportScaleMode = useLayoutStore((s) => s.viewportScaleMode);
  const setViewportScaleMode = useLayoutStore((s) => s.setViewportScaleMode);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [initialUrlValue] = useState(initialUrl);
  const [urlDraft, setUrlDraft] = useState<string | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });
  const [dismissedNoticeHost, setDismissedNoticeHost] = useState<string | null>(null);
  const [screencastStats, setScreencastStats] = useState<ScreencastStats>({
    fps: 0,
    latencyMs: null,
    connected: false,
  });

  // Mientras el usuario no edite, la barra sigue la URL real del navegador.
  const urlInput = urlDraft ?? currentUrl ?? initialUrlValue;

  const activeHost = useMemo(() => {
    try {
      const u = urlInput || currentUrl;
      if (!u) return "";
      return new URL(u.includes("://") ? u : `https://${u}`).hostname.toLowerCase();
    } catch {
      return "";
    }
  }, [urlInput, currentUrl]);

  const showHostileNotice =
    kind === "embedded" &&
    status === "ready" &&
    isProxyHostileHost(activeHost) &&
    dismissedNoticeHost !== activeHost;

  useEffect(() => {
    // El iframe confirma la navegación: descartamos el borrador local.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrlDraft(null);
  }, [currentUrl]);

  useEffect(() => {
    if (recipeId && useLiveStore.getState().status === "idle") {
      startEmbedded(recipeId, initialUrlValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeId]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerSize({ width, height });
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Escala calculada (sin estado) para ajustar el preset al panel.
  const scale = useMemo(() => {
    const preset = VIEWPORT_PRESETS[viewportMode];
    if (!preset || viewportScaleMode === "actual_size") return 1;

    const { width: cW, height: cH } = containerSize;
    if (cW <= 0 || cH <= 0) return 1;

    const scaleX = (cW - 24) / preset.width;
    const scaleY = (cH - 24) / preset.height;
    return Math.max(0.15, Math.min(scaleX, scaleY, 1));
  }, [viewportMode, viewportScaleMode, containerSize]);

  useEffect(() => {
    if (kind === "screencast") {
      // ScreencastCanvas registra y limpia su propio sender por WebSocket
      return;
    }
    let activeFn: ((msg: Record<string, unknown>) => void) | null = null;
    if (kind === "embedded") {
      activeFn = (msg) => iframeRef.current?.contentWindow?.postMessage(msg, "*");
      setSender(activeFn);
    } else if (kind === "external" && recipeId && sessionId) {
      activeFn = (msg) => {
        apiFetch(`/api/v1/recipes/${recipeId}/live/command`, {
          method: "POST",
          body: JSON.stringify({ session_id: sessionId, message: msg }),
        }).catch(() => undefined);
      };
      setSender(activeFn);
    }
    return () => {
      if (activeFn && useLiveStore.getState().sender === activeFn) {
        setSender(null);
      }
    };
  }, [kind, recipeId, sessionId, proxyUrl, setSender]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (kind !== "embedded") return;
      if (!e.data || !e.data.__rpa) return;
      handleMessage(e.data);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [kind, handleMessage]);

  useEffect(() => {
    if (kind !== "external" || !recipeId || !sessionId) return;
    const echo = getEcho();
    if (!echo) return;
    const channel = echo.channel(`recipe.${recipeId}`);
    channel.listen(".live.event", (e: { session_id: string; message: unknown }) => {
      if (e.session_id === sessionId) handleMessage(e.message);
    });
    return () => {
      channel.stopListening(".live.event");
    };
  }, [kind, recipeId, sessionId, handleMessage]);

  const currentPreset = VIEWPORT_PRESETS[viewportMode];
  const isPlaywrightParity = viewportMode === "desktop";
  const desiredViewport = useMemo(
    () =>
      currentPreset
        ? { width: currentPreset.width, height: currentPreset.height }
        : { width: 1280, height: 800 },
    [currentPreset]
  );

  const launchInMode = useCallback(
    (targetKind: LiveKind, targetUrl?: string) => {
      if (!recipeId) return;
      let url = (targetUrl ?? urlInput).trim() || initialUrlValue;
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
      if (targetKind === "external") {
        void startExternal(recipeId, url);
      } else if (targetKind === "screencast") {
        void startScreencast(recipeId, url, desiredViewport);
      } else {
        void startEmbedded(recipeId, url);
      }
    },
    [recipeId, urlInput, initialUrlValue, desiredViewport, startEmbedded, startScreencast, startExternal]
  );

  const go = useCallback(() => {
    if (!urlInput.trim()) return;
    launchInMode(kind, urlInput);
  }, [kind, urlInput, launchInMode]);

  const openExternal = () => launchInMode("external");
  const openScreencast = () => launchInMode("screencast");

  const handleScreencastSender = useCallback(
    (fn: ((msg: Record<string, unknown>) => void) | null) => {
      setSender(fn);
    },
    [setSender]
  );

  const handleScreencastReconnect = useCallback(() => {
    if (!recipeId) return;
    const url = (urlInput || currentUrl || initialUrlValue).trim();
    if (!url) return;
    // Forzar nueva sesión screencast reiniciando kind/sessionId
    useLiveStore.setState({ status: "idle", sessionId: null, wsUrl: null, sender: null });
    void startScreencast(recipeId, url, desiredViewport);
  }, [recipeId, urlInput, currentUrl, initialUrlValue, desiredViewport, startScreencast]);

  const hasVisualStage =
    (kind === "embedded" && Boolean(proxyUrl)) || (kind === "screencast" && Boolean(wsUrl));

  return (
    <section className="@container flex h-full min-w-[320px] flex-1 flex-col overflow-hidden bg-panel text-fg transition-colors">
      {/* Barra de navegación */}
      <div className="shrink-0 space-y-2 border-b border-line px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <div className="relative min-w-0 flex-1">
            <Globe className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" />
            <input
              value={urlInput}
              onChange={(e) => setUrlDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && go()}
              placeholder="https://sitio.com"
              aria-label="URL del sitio en vivo"
              className="h-8 w-full truncate rounded-control border border-line bg-input pl-8 pr-2.5 font-mono text-[11.5px] text-fg placeholder:text-fg-subtle transition-[border-color,box-shadow] hover:border-line-strong focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15"
            />
          </div>

          <IconButton label="Cargar URL" onClick={go}>
            <RefreshCw className="h-3.5 w-3.5" />
          </IconButton>

          {/* Selector de modo: Embebido / Remoto (CDP) / Externo */}
          <div
            role="group"
            aria-label="Modo de visualización en vivo"
            className="flex shrink-0 items-center gap-0.5 rounded-control border border-line bg-card p-0.5"
          >
            <button
              type="button"
              onClick={() => launchInMode("embedded")}
              aria-pressed={kind === "embedded"}
              title="Visor Embebido (Proxy HTTP)"
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-[6px] px-2 text-[10.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                kind === "embedded"
                  ? "bg-raised text-fg shadow-[var(--shadow-card)]"
                  : "text-fg-muted hover:bg-hover hover:text-fg"
              )}
            >
              <Globe className="h-3 w-3" />
              <span className="hidden @[480px]:inline">Embebido</span>
            </button>
            <button
              type="button"
              onClick={() => launchInMode("screencast")}
              aria-pressed={kind === "screencast"}
              title="Navegador Remoto por Screencast (Chromium real en panel)"
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-[6px] px-2 text-[10.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                kind === "screencast"
                  ? "bg-raised text-accent-text shadow-[var(--shadow-card)]"
                  : "text-fg-muted hover:bg-hover hover:text-fg"
              )}
            >
              <MonitorPlay className="h-3 w-3" />
              <span className="hidden @[480px]:inline">Remoto</span>
            </button>
            <button
              type="button"
              onClick={openExternal}
              aria-pressed={kind === "external"}
              title="Abrir en ventana Chromium externa"
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-[6px] px-2 text-[10.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                kind === "external"
                  ? "bg-raised text-success-text shadow-[var(--shadow-card)]"
                  : "text-fg-muted hover:bg-hover hover:text-fg"
              )}
            >
              <ExternalLink className="h-3 w-3" />
              <span className="hidden @[620px]:inline">Externo</span>
            </button>
          </div>

          <IconButton label="Cerrar sitio en vivo" onClick={() => close(recipeId)}>
            <X className="h-3.5 w-3.5" />
          </IconButton>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Presets de viewport */}
          <div
            role="group"
            aria-label="Tamaño del viewport"
            className="flex min-w-0 items-center gap-0.5 overflow-x-auto rounded-control border border-line bg-card p-0.5"
          >
            {VIEWPORT_OPTIONS.map((option) => {
              const active = viewportMode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setViewportMode(option.value)}
                  aria-pressed={active}
                  title={
                    option.value === "desktop"
                      ? "Web escritorio 1280×800 · coincide con Playwright"
                      : option.label
                  }
                  className={cn(
                    "inline-flex h-6 shrink-0 items-center gap-1 rounded-[6px] px-1.5 text-[10px] font-medium",
                    "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                    active
                      ? "bg-raised text-fg shadow-[var(--shadow-card)]"
                      : "text-fg-muted hover:bg-hover hover:text-fg"
                  )}
                >
                  {option.icon}
                  <span className="hidden @[560px]:inline">{option.label}</span>
                </button>
              );
            })}
          </div>

          {currentPreset && (
            <div
              role="group"
              aria-label="Modo de escala"
              className="flex shrink-0 items-center gap-0.5 rounded-control border border-line bg-card p-0.5"
            >
              <button
                type="button"
                onClick={() => setViewportScaleMode("fit_scale")}
                aria-pressed={viewportScaleMode === "fit_scale"}
                title="Ajustar al panel (auto-escalado)"
                className={cn(
                  "inline-flex h-6 w-6 items-center justify-center rounded-[6px] transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                  viewportScaleMode === "fit_scale"
                    ? "bg-raised text-fg shadow-[var(--shadow-card)]"
                    : "text-fg-muted hover:bg-hover hover:text-fg"
                )}
              >
                <Shrink className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => setViewportScaleMode("actual_size")}
                aria-pressed={viewportScaleMode === "actual_size"}
                title="Tamaño real 1:1 con scroll"
                className={cn(
                  "inline-flex h-6 w-6 items-center justify-center rounded-[6px] transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                  viewportScaleMode === "actual_size"
                    ? "bg-raised text-fg shadow-[var(--shadow-card)]"
                    : "text-fg-muted hover:bg-hover hover:text-fg"
                )}
              >
                <ZoomIn className="h-3 w-3" />
              </button>
            </div>
          )}

          {showLayoutToggle && (
            <div className="ml-auto flex shrink-0 items-center gap-0.5">
              <IconButton
                label={
                  layoutMode === "full_site"
                    ? "Mostrar flujo (modo dividido)"
                    : "Ocultar flujo (sitio completo)"
                }
                onClick={() => setLayoutMode(layoutMode === "full_site" ? "split" : "full_site")}
                className={cn(layoutMode === "full_site" && "bg-accent-soft text-accent-text")}
              >
                {layoutMode === "full_site" ? (
                  <Columns className="h-3.5 w-3.5" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" />
                )}
              </IconButton>
            </div>
          )}
        </div>
      </div>

      {/* Barra de estado */}
      <div className="flex h-7 shrink-0 select-none items-center justify-between gap-2 border-b border-line bg-card px-3 text-[10.5px] text-fg-muted">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex shrink-0 items-center gap-1">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                status === "ready"
                  ? "bg-success"
                  : status === "starting"
                    ? "animate-pulse bg-warning"
                    : status === "error"
                      ? "bg-danger"
                      : "bg-fg-subtle/50"
              )}
            />
            {kind === "external"
              ? "Chromium externo"
              : kind === "screencast"
                ? "Remoto (CDP)"
                : "Embebido"}
          </span>

          {kind === "screencast" && screencastStats.connected && (
            <span className="shrink-0 font-mono text-[10px] text-success-text">
              {screencastStats.fps} fps
              {screencastStats.latencyMs !== null ? ` · ${screencastStats.latencyMs}ms` : ""}
            </span>
          )}

          {isPlaywrightParity && (
            <Badge
              tone="success"
              className="h-5 shrink-0 whitespace-nowrap px-1.5 text-[9.5px]"
            >
              <ShieldCheck className="h-2.5 w-2.5" />
              Paridad 1280×800
            </Badge>
          )}

          <span className="max-w-[160px] truncate text-fg" title={pageTitle || undefined}>
            {pageTitle || "—"}
          </span>

          {currentPreset && viewportScaleMode === "fit_scale" && scale < 1 && (
            <span className="shrink-0 font-mono text-[10px] text-info-text">
              {Math.round(scale * 100)} %
            </span>
          )}
          {currentPreset && viewportScaleMode === "actual_size" && (
            <span className="shrink-0 font-mono text-[10px] text-fg-subtle">100 %</span>
          )}
        </div>

        {armedNodeId ? (
          <button
            type="button"
            onClick={disarm}
            className="flex shrink-0 items-center gap-1 font-medium text-accent-text transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <MousePointerClick className="h-3 w-3 animate-pulse" />
            <span>Haz clic en un elemento… (Esc)</span>
          </button>
        ) : (
          <span className="shrink-0 text-fg-subtle">
            {status === "ready" ? "Listo" : status === "starting" ? "Cargando…" : ""}
          </span>
        )}
      </div>

      {/* Lienzo */}
      <div
        ref={containerRef}
        className={cn(
          "relative flex-1 bg-canvas p-2",
          viewportScaleMode === "actual_size" && currentPreset
            ? "flex items-start justify-start overflow-auto"
            : "flex items-center justify-center overflow-hidden"
        )}
      >
        {status === "starting" && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-panel/90 backdrop-blur-sm">
            <Loader2 className="h-5 w-5 animate-spin text-accent" />
            <span className="text-[11px] text-fg-muted">Cargando sitio…</span>
          </div>
        )}

        {status === "error" && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-panel/95 p-6 text-center backdrop-blur-sm">
            <div className="grid h-11 w-11 place-items-center rounded-full border border-danger/25 bg-danger-soft">
              <AlertCircle className="h-5 w-5 text-danger-text" />
            </div>
            <div className="max-w-sm space-y-1">
              <h4 className="text-[12.5px] font-semibold text-fg">
                {kind === "screencast"
                  ? "Error en el navegador remoto"
                  : kind === "external"
                    ? "Error al abrir Chromium externo"
                    : "Error al cargar en el visor embebido"}
              </h4>
              <p className="text-[11px] leading-relaxed text-fg-muted">{error}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={go}>
                Reintentar
              </Button>
              {kind === "embedded" && (
                <Button size="sm" variant="primary" onClick={openScreencast}>
                  <MonitorPlay className="h-3.5 w-3.5" />
                  Usar navegador remoto
                </Button>
              )}
              <Button size="sm" variant={kind === "embedded" ? "secondary" : "primary"} onClick={openExternal}>
                <ExternalLink className="h-3.5 w-3.5" />
                Chromium externo
              </Button>
            </div>
          </div>
        )}

        {kind === "external" && status === "ready" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-panel p-6 text-center">
            <div className="grid h-11 w-11 place-items-center rounded-full border border-success/25 bg-success-soft">
              <ExternalLink className="h-5 w-5 text-success-text" />
            </div>
            <p className="text-[12.5px] font-semibold text-fg">
              Sitio abierto en una ventana de Chromium
            </p>
            <p className="max-w-xs text-[11px] leading-relaxed text-fg-muted">
              Selecciona un nodo y pulsa “Seleccionar en el sitio”; luego haz clic en el
              elemento dentro de esa ventana.
            </p>
          </div>
        )}

        {hasVisualStage && (
          <div
            className="shrink-0 overflow-hidden rounded-[10px] border border-line-strong bg-raised shadow-[var(--shadow-modal)]"
            style={{
              width: currentPreset ? `${currentPreset.width * scale}px` : "100%",
              height: currentPreset ? `${currentPreset.height * scale}px` : "100%",
            }}
          >
            {/* Escenario a tamaño real; se escala visualmente sin ocupar el layout */}
            <div
              className="flex flex-col bg-raised"
              style={
                currentPreset
                  ? {
                      width: `${currentPreset.width}px`,
                      height: `${currentPreset.height}px`,
                      transform: `scale(${scale})`,
                      transformOrigin: "top left",
                    }
                  : { width: "100%", height: "100%" }
              }
            >
              {/* Chrome del navegador */}
              <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-line bg-card px-2">
                <span className="flex shrink-0 items-center gap-1" aria-hidden="true">
                  <span className="h-2 w-2 rounded-full bg-danger/70" />
                  <span className="h-2 w-2 rounded-full bg-warning/70" />
                  <span className="h-2 w-2 rounded-full bg-success/70" />
                </span>
                {kind === "screencast" && (
                  <div className="flex shrink-0 items-center gap-0.5 text-fg-muted">
                    <button
                      type="button"
                      onClick={() => sender?.({ type: "browser:back" })}
                      className="rounded p-0.5 hover:bg-hover hover:text-fg"
                      title="Atrás"
                      aria-label="Atrás"
                    >
                      <ArrowLeft className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => sender?.({ type: "browser:forward" })}
                      className="rounded p-0.5 hover:bg-hover hover:text-fg"
                      title="Adelante"
                      aria-label="Adelante"
                    >
                      <ArrowRight className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => sender?.({ type: "browser:reload" })}
                      className="rounded p-0.5 hover:bg-hover hover:text-fg"
                      title="Recargar página remota"
                      aria-label="Recargar página remota"
                    >
                      <RotateCw className="h-3 w-3" />
                    </button>
                  </div>
                )}
                <div className="mx-1 flex min-w-0 flex-1 items-center gap-1 rounded-[5px] border border-line bg-input px-1.5 py-0.5">
                  <Lock className="h-2.5 w-2.5 shrink-0 text-success-text" aria-hidden="true" />
                  <span className="truncate font-mono text-[9.5px] text-fg-muted">
                    {urlInput}
                  </span>
                </div>
              </div>

              {showHostileNotice && (
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-warning/30 bg-warning-soft px-3 py-1.5 text-[11px] text-warning-text">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 text-warning-text" />
                    <span className="truncate">
                      Este sitio limita la reproducción multimedia en visores embebidos.
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={openScreencast}
                      className="inline-flex items-center gap-1 rounded bg-accent px-2 py-0.5 font-medium text-accent-ink hover:bg-accent-hover transition-colors"
                    >
                      <MonitorPlay className="h-3 w-3" />
                      Cambiar a Remoto
                    </button>
                    <button
                      type="button"
                      onClick={openExternal}
                      className="inline-flex items-center gap-1 rounded bg-warning/20 px-2 py-0.5 font-medium hover:bg-warning/30 transition-colors"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Chromium externo
                    </button>
                    <button
                      type="button"
                      onClick={() => setDismissedNoticeHost(activeHost)}
                      className="rounded p-0.5 hover:bg-warning/20 transition-colors"
                      aria-label="Cerrar aviso"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )}

              {kind === "screencast" && wsUrl ? (
                <ScreencastCanvas
                  key={wsUrl}
                  wsUrl={wsUrl}
                  viewportWidth={desiredViewport.width || remoteViewport.width}
                  viewportHeight={desiredViewport.height || remoteViewport.height}
                  armedNodeId={armedNodeId}
                  onMessage={handleMessage}
                  onSenderReady={handleScreencastSender}
                  onStatsChange={setScreencastStats}
                  onReconnect={handleScreencastReconnect}
                />
              ) : (
                <iframe
                  ref={iframeRef}
                  name="rpa-live-frame"
                  key={proxyUrl}
                  src={proxyUrl!}
                  className="h-[calc(100%-1.75rem)] w-full flex-1 border-0 bg-white"
                  title="Sitio en vivo"
                  allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write; web-share"
                  allowFullScreen
                />
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
