"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
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
  Maximize2,
  Layout,
  Columns,
} from "lucide-react";
import { useLiveStore } from "../../stores/use-live-store";
import { useRecipeStore } from "../../stores/use-recipe-store";
import { useLayoutStore, VIEWPORT_PRESETS, type LiveViewportMode } from "../../stores/use-layout-store";
import { apiFetch } from "../../lib/api-client";
import { getEcho } from "../../lib/echo";

function initialUrl(): string {
  const { definition } = useRecipeStore.getState();
  const entry = definition.nodes[definition.entry];
  const nav: any =
    entry?.type === "navigate"
      ? entry
      : Object.values(definition.nodes).find((n) => n.type === "navigate");
  return nav?.params?.url || "http://localhost:8099/index.html";
}

export function LiveSitePanel() {
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

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [urlInput, setUrlInput] = useState("");
  const [scale, setScale] = useState(1);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });

  // Arranque automático al abrir el panel
  useEffect(() => {
    const url = initialUrl();
    setUrlInput(url);
    if (recipeId && useLiveStore.getState().status === "idle") {
      startEmbedded(recipeId, url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeId]);

  useEffect(() => {
    if (currentUrl) setUrlInput(currentUrl);
  }, [currentUrl]);

  // Medir contenedor para el auto-escalado responsive
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

  // Calcular escala según preset y dimensiones del contenedor
  useEffect(() => {
    const preset = VIEWPORT_PRESETS[viewportMode];
    if (!preset) {
      setScale(1);
      return;
    }

    const { width: cW, height: cH } = containerSize;
    if (cW <= 0 || cH <= 0) return;

    // Calcular factor de escala para que quepa completamente sin scroll
    const scaleX = (cW - 16) / preset.width;
    const scaleY = (cH - 16) / preset.height;
    const newScale = Math.min(scaleX, scaleY, 1);
    setScale(Math.max(0.2, newScale));
  }, [viewportMode, containerSize]);

  // Emisor hacia el sitio: iframe (postMessage) o Chromium externo (API -> Runner)
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

  // Mensajes desde el iframe embebido
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (kind !== "embedded") return;
      if (e.source !== iframeRef.current?.contentWindow) return;
      if (!e.data || !e.data.__rpa) return;
      handleMessage(e.data);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [kind, handleMessage]);

  // Mensajes desde Chromium externo (Reverb)
  useEffect(() => {
    if (kind !== "external" || !recipeId || !sessionId) return;
    const echo = getEcho();
    if (!echo) return;
    const channel = echo.channel(`recipe.${recipeId}`);
    channel.listen(".live.event", (e: { session_id: string; message: any }) => {
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
    startExternal(recipeId, urlInput.trim() || initialUrl());
  };

  const currentPreset = VIEWPORT_PRESETS[viewportMode];

  return (
    <section className="flex-1 min-w-[320px] h-full flex flex-col bg-[#09090b] overflow-hidden">
      {/* Barra de navegador */}
      <div className="h-10 px-2 flex items-center space-x-2 bg-[#0c0c0e] border-b border-zinc-800">
        <Globe className="w-4 h-4 text-zinc-400 shrink-0" />
        <input
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && go()}
          placeholder="https://sitio.com"
          className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs font-mono text-zinc-200 focus:outline-none focus:border-zinc-600"
        />
        <button
          onClick={go}
          title="Cargar URL"
          className="p-1.5 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>

        {/* Selector de Presets de Viewport con Escala */}
        <div className="flex items-center space-x-0.5 bg-zinc-950 border border-zinc-800 rounded p-0.5">
          <button
            onClick={() => setViewportMode("fit")}
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
              viewportMode === "fit" ? "bg-zinc-800 text-zinc-100 font-medium" : "text-zinc-400 hover:text-white"
            }`}
            title="Ajustar al tamaño del panel"
          >
            Ajustar
          </button>
          <button
            onClick={() => setViewportMode("desktop")}
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
              viewportMode === "desktop" ? "bg-zinc-800 text-zinc-100 font-medium" : "text-zinc-400 hover:text-white"
            }`}
            title="Escritorio 1280x800"
          >
            <Monitor className="w-3 h-3" />
          </button>
          <button
            onClick={() => setViewportMode("mobile")}
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
              viewportMode === "mobile" ? "bg-zinc-800 text-zinc-100 font-medium" : "text-zinc-400 hover:text-white"
            }`}
            title="Móvil 390x844"
          >
            <Smartphone className="w-3 h-3" />
          </button>
        </div>

        {/* Toggle para ocultar el flujo o ver dividido */}
        <button
          onClick={() => setLayoutMode(layoutMode === "full_site" ? "split" : "full_site")}
          title={layoutMode === "full_site" ? "Mostrar flujo (modo dividido)" : "Ocultar flujo (sitio completo)"}
          className={`p-1.5 rounded transition-colors ${
            layoutMode === "full_site" ? "bg-blue-600 text-white" : "text-neutral-300 hover:bg-neutral-800"
          }`}
        >
          {layoutMode === "full_site" ? <Columns className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>

        <button
          onClick={openExternal}
          title="Abrir en Chromium externo (ventana real de escritorio)"
          className={`p-1.5 rounded hover:bg-neutral-800 transition-colors ${
            kind === "external" ? "text-emerald-400" : "text-neutral-300"
          }`}
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => close(recipeId)}
          title="Cerrar sitio en vivo"
          className="p-1.5 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Estado / selección */}
      <div className="h-7 px-3 flex items-center justify-between text-[11px] bg-neutral-900/60 border-b border-neutral-800 select-none">
        <span className="truncate text-neutral-400 flex items-center space-x-1.5">
          <span>{kind === "external" ? "🖥️ Chromium externo" : "🌐 Embebido"}</span>
          <span>·</span>
          <span className="truncate max-w-[200px]">{pageTitle || "—"}</span>
          {currentPreset && scale < 1 && (
            <span className="text-[10px] text-blue-400 font-mono">({Math.round(scale * 100)}% escala)</span>
          )}
        </span>
        {armedNodeId ? (
          <button
            onClick={disarm}
            className="flex items-center space-x-1 text-amber-300 hover:text-amber-200"
          >
            <MousePointerClick className="w-3 h-3 animate-pulse" />
            <span>Haz clic en un elemento del sitio… (Esc cancela)</span>
          </button>
        ) : (
          <span className="text-neutral-500">
            {status === "ready" ? "Listo" : status === "starting" ? "Cargando…" : ""}
          </span>
        )}
      </div>

      {/* Contenido con Auto-Escalado Responsive */}
      <div
        ref={containerRef}
        className="flex-1 relative bg-neutral-900/40 overflow-hidden flex items-center justify-center p-2"
      >
        {status === "starting" && (
          <div className="absolute inset-0 bg-neutral-950 flex items-center justify-center text-neutral-400 z-10">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          </div>
        )}

        {status === "error" && (
          <div className="absolute inset-0 bg-neutral-950 flex flex-col items-center justify-center text-center p-6 space-y-2 z-10">
            <AlertCircle className="w-7 h-7 text-rose-400" />
            <p className="text-xs text-rose-300">{error}</p>
            <button onClick={go} className="text-xs px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700">
              Reintentar
            </button>
          </div>
        )}

        {kind === "external" && status === "ready" && (
          <div className="absolute inset-0 bg-neutral-950 flex flex-col items-center justify-center text-center p-6 space-y-2 text-neutral-300">
            <ExternalLink className="w-8 h-8 text-emerald-400" />
            <p className="text-sm font-semibold">Sitio abierto en una ventana de Chromium</p>
            <p className="text-xs text-neutral-500 max-w-xs">
              Selecciona un nodo y pulsa “Seleccionar en el sitio”; luego haz clic en el elemento dentro de esa ventana.
            </p>
          </div>
        )}

        {kind === "embedded" && proxyUrl && (
          <div
            className="transition-all duration-150 flex items-center justify-center shadow-2xl rounded-md overflow-hidden bg-white"
            style={{
              width: currentPreset ? `${currentPreset.width}px` : "100%",
              height: currentPreset ? `${currentPreset.height}px` : "100%",
              transform: currentPreset && scale < 1 ? `scale(${scale})` : undefined,
              transformOrigin: "center center",
            }}
          >
            <iframe
              ref={iframeRef}
              name="rpa-live-frame"
              key={proxyUrl}
              src={proxyUrl}
              className="w-full h-full border-0 bg-white"
              title="Sitio en vivo"
            />
          </div>
        )}
      </div>
    </section>
  );
}
