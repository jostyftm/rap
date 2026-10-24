"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Globe,
  ExternalLink,
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
import { useLiveStore } from "../../stores/use-live-store";
import { useRecipeStore } from "../../stores/use-recipe-store";
import {
  useLayoutStore,
  VIEWPORT_PRESETS,
  type LiveViewportMode,
} from "../../stores/use-layout-store";
import { apiFetch } from "../../lib/api-client";
import { getEcho } from "../../lib/echo";
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
  const sessionId = useLiveStore((s) => s.sessionId);
  const currentUrl = useLiveStore((s) => s.currentUrl);
  const pageTitle = useLiveStore((s) => s.pageTitle);
  const armedNodeId = useLiveStore((s) => s.armedNodeId);
  const error = useLiveStore((s) => s.error);
  const startEmbedded = useLiveStore((s) => s.startEmbedded);
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

  // Mientras el usuario no edite, la barra sigue la URL real del navegador.
  const urlInput = urlDraft ?? currentUrl ?? initialUrlValue;

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
    if (kind === "embedded") {
      setSender((msg) => iframeRef.current?.contentWindow?.postMessage(msg, "*"));
    } else if (kind === "external" && recipeId && sessionId) {
      setSender((msg) => {
        apiFetch(`/api/v1/recipes/${recipeId}/live/command`, {
          method: "POST",
          body: JSON.stringify({ session_id: sessionId, message: msg }),
        }).catch(() => undefined);
      });
    }
    return () => setSender(null);
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

  const go = useCallback(() => {
    if (!recipeId || !urlInput.trim()) return;
    let url = urlInput.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    if (kind === "external") startExternal(recipeId, url);
    else startEmbedded(recipeId, url);
  }, [recipeId, urlInput, kind, startEmbedded, startExternal]);

  const openExternal = () => {
    if (!recipeId) return;
    startExternal(recipeId, urlInput.trim() || initialUrlValue);
  };

  const currentPreset = VIEWPORT_PRESETS[viewportMode];
  const isPlaywrightParity = viewportMode === "desktop";

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
          <IconButton
            label="Abrir en Chromium externo"
            onClick={openExternal}
            className={cn(kind === "external" && "text-success-text")}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </IconButton>
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
            {kind === "external" ? "Chromium externo" : "Embebido"}
          </span>

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
                Error al cargar en el visor embebido
              </h4>
              <p className="text-[11px] leading-relaxed text-fg-muted">{error}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={go}>
                Reintentar
              </Button>
              <Button size="sm" variant="primary" onClick={openExternal}>
                <ExternalLink className="h-3.5 w-3.5" />
                Abrir en Chromium externo
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

        {kind === "embedded" && proxyUrl && (
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
                <div className="mx-1 flex min-w-0 flex-1 items-center gap-1 rounded-[5px] border border-line bg-input px-1.5 py-0.5">
                  <Lock className="h-2.5 w-2.5 shrink-0 text-success-text" aria-hidden="true" />
                  <span className="truncate font-mono text-[9.5px] text-fg-muted">
                    {urlInput}
                  </span>
                </div>
              </div>

              <iframe
                ref={iframeRef}
                name="rpa-live-frame"
                key={proxyUrl}
                src={proxyUrl}
                className="h-[calc(100%-1.75rem)] w-full flex-1 border-0 bg-white"
                title="Sitio en vivo"
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
