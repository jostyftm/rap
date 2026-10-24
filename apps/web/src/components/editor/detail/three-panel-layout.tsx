"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  Layers,
  SlidersHorizontal,
  Database,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ThreePanelLayoutProps {
  left: React.ReactNode;
  center: React.ReactNode;
  right: React.ReactNode;
}

const DEFAULT_LEFT = 26;
const DEFAULT_RIGHT = 30;
const MIN_LEFT = 18;
const MAX_LEFT = 38;
const MIN_RIGHT = 22;
const MAX_RIGHT = 44;
const MIN_CENTER = 32;

const STORAGE = {
  left: "rpa:node-detail:left",
  right: "rpa:node-detail:right",
  leftCollapsed: "rpa:node-detail:left-collapsed",
  rightCollapsed: "rpa:node-detail:right-collapsed",
};

function readNumber(key: string, fallback: number, min: number, max: number): number {
  try {
    const raw = Number(localStorage.getItem(key));
    if (Number.isFinite(raw) && raw >= min && raw <= max) return raw;
  } catch {
    // ignore
  }
  return fallback;
}

function readBool(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function persist(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

export function ThreePanelLayout({ left, center, right }: ThreePanelLayoutProps) {
  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT);
  const [rightWidth, setRightWidth] = useState(DEFAULT_RIGHT);
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
  const [isRightCollapsed, setIsRightCollapsed] = useState(false);
  const [ready, setReady] = useState(false);

  const [activeTabMobile, setActiveTabMobile] = useState<"left" | "center" | "right">("center");
  const [isMobile, setIsMobile] = useState(false);

  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Preferencias persistidas
  useEffect(() => {
    // Restaurar preferencias tras montar evita desajustes de hidratación.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLeftWidth(readNumber(STORAGE.left, DEFAULT_LEFT, MIN_LEFT, MAX_LEFT));
    setRightWidth(readNumber(STORAGE.right, DEFAULT_RIGHT, MIN_RIGHT, MAX_RIGHT));
    setIsLeftCollapsed(readBool(STORAGE.leftCollapsed));
    setIsRightCollapsed(readBool(STORAGE.rightCollapsed));
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    persist(STORAGE.left, String(leftWidth));
    persist(STORAGE.right, String(rightWidth));
    persist(STORAGE.leftCollapsed, isLeftCollapsed ? "1" : "0");
    persist(STORAGE.rightCollapsed, isRightCollapsed ? "1" : "0");
  }, [ready, leftWidth, rightWidth, isLeftCollapsed, isRightCollapsed]);

  // Responsive
  useEffect(() => {
    const checkSize = () => setIsMobile(window.innerWidth < 1180);
    checkSize();
    window.addEventListener("resize", checkSize);
    return () => window.removeEventListener("resize", checkSize);
  }, []);

  const clampLeft = useCallback(
    (pct: number) => {
      const maxByCenter = 100 - rightWidth - MIN_CENTER;
      return Math.round(Math.max(MIN_LEFT, Math.min(MAX_LEFT, maxByCenter, pct)));
    },
    [rightWidth]
  );

  const clampRight = useCallback(
    (pct: number) => {
      const maxByCenter = 100 - leftWidth - MIN_CENTER;
      return Math.round(Math.max(MIN_RIGHT, Math.min(MAX_RIGHT, maxByCenter, pct)));
    },
    [leftWidth]
  );

  // Redimensionador izquierdo
  useEffect(() => {
    if (!isDraggingLeft) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;
      setLeftWidth(clampLeft(((e.clientX - rect.left) / rect.width) * 100));
    };

    const handleMouseUp = () => setIsDraggingLeft(false);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingLeft, clampLeft]);

  // Redimensionador derecho
  useEffect(() => {
    if (!isDraggingRight) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;
      setRightWidth(clampRight(((rect.right - e.clientX) / rect.width) * 100));
    };

    const handleMouseUp = () => setIsDraggingRight(false);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingRight, clampRight]);

  const resetRatios = () => {
    setLeftWidth(DEFAULT_LEFT);
    setRightWidth(DEFAULT_RIGHT);
    setIsLeftCollapsed(false);
    setIsRightCollapsed(false);
  };

  const handleGutterKeyDown = (
    e: React.KeyboardEvent<HTMLDivElement>,
    side: "left" | "right"
  ) => {
    if (e.key === "Home") {
      e.preventDefault();
      resetRatios();
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (side === "left") setIsLeftCollapsed((prev) => !prev);
      else setIsRightCollapsed((prev) => !prev);
      return;
    }
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const delta = e.key === "ArrowLeft" ? -2 : 2;
    if (side === "left") setLeftWidth((w) => clampLeft(w + delta));
    else setRightWidth((w) => clampRight(w - delta));
  };

  if (isMobile) {
    return (
      <div className="flex h-full flex-1 flex-col overflow-hidden bg-canvas">
        <div
          role="tablist"
          aria-label="Paneles del editor de nodo"
          className="flex shrink-0 items-center gap-1 border-b border-line bg-panel px-2 py-1.5"
        >
          {[
            { id: "left" as const, label: "Entrada", icon: Layers },
            { id: "center" as const, label: "Configuración", icon: SlidersHorizontal },
            { id: "right" as const, label: "Salida / En vivo", icon: Database },
          ].map(({ id, label, icon: Icon }) => {
            const active = activeTabMobile === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTabMobile(id)}
                className={cn(
                  "inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-control px-2 text-[11.5px] font-medium",
                  "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                  active
                    ? "bg-raised text-fg shadow-[var(--shadow-card)]"
                    : "text-fg-muted hover:bg-hover hover:text-fg"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="truncate">{label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-hidden">
          {activeTabMobile === "left" && left}
          {activeTabMobile === "center" && center}
          {activeTabMobile === "right" && right}
        </div>
      </div>
    );
  }

  const effectiveLeft = isLeftCollapsed ? 0 : leftWidth;
  const effectiveRight = isRightCollapsed ? 0 : rightWidth;
  const effectiveCenter = 100 - effectiveLeft - effectiveRight;

  return (
    <div
      ref={containerRef}
      className="relative flex h-full flex-1 overflow-hidden bg-canvas"
    >
      {/* Panel izquierdo */}
      {isLeftCollapsed ? (
        <button
          type="button"
          onClick={() => setIsLeftCollapsed(false)}
          aria-label="Mostrar panel de entrada"
          title="Mostrar entrada"
          className="group flex h-full w-9 shrink-0 flex-col items-center justify-center gap-2 border-r border-line bg-panel text-fg-subtle transition-colors hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40"
        >
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="rotate-180 text-[10px] uppercase tracking-[0.14em] [writing-mode:vertical-rl]">
            Entrada
          </span>
        </button>
      ) : (
        <>
          <div
            style={{ width: `${effectiveLeft}%` }}
            className="flex h-full min-w-0 shrink-0 flex-col overflow-hidden"
          >
            {left}
          </div>

          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Redimensionar panel de entrada"
            aria-valuemin={MIN_LEFT}
            aria-valuemax={MAX_LEFT}
            aria-valuenow={leftWidth}
            tabIndex={0}
            onMouseDown={(e) => {
              e.preventDefault();
              setIsDraggingLeft(true);
            }}
            onDoubleClick={resetRatios}
            onKeyDown={(e) => handleGutterKeyDown(e, "left")}
            title="Arrastra para redimensionar · doble clic para restaurar"
            className="group relative h-full w-1.5 shrink-0 cursor-col-resize bg-canvas outline-none focus-visible:bg-accent/10"
          >
            <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-line transition-colors group-hover:bg-accent/50 group-focus-visible:bg-accent" />
            <span className="absolute left-1/2 top-1/2 h-8 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-line-strong opacity-0 transition-opacity group-hover:opacity-100" />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setIsLeftCollapsed(true)}
              aria-label="Ocultar panel de entrada"
              title="Ocultar entrada"
              className="absolute left-1/2 top-14 flex h-9 w-4 -translate-x-1/2 items-center justify-center rounded-full border border-line bg-raised text-fg-subtle opacity-0 shadow-sm transition-opacity hover:text-fg group-hover:opacity-100 group-focus-visible:opacity-100"
            >
              <ChevronLeft className="h-3 w-3" />
            </button>
          </div>
        </>
      )}

      {/* Panel central */}
      <div
        style={{ width: `${effectiveCenter}%` }}
        className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-raised"
      >
        {center}
      </div>

      {/* Separador derecho */}
      {!isRightCollapsed && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Redimensionar panel de salida"
          aria-valuemin={MIN_RIGHT}
          aria-valuemax={MAX_RIGHT}
          aria-valuenow={rightWidth}
          tabIndex={0}
          onMouseDown={(e) => {
            e.preventDefault();
            setIsDraggingRight(true);
          }}
          onDoubleClick={resetRatios}
          onKeyDown={(e) => handleGutterKeyDown(e, "right")}
          title="Arrastra para redimensionar · doble clic para restaurar"
          className="group relative h-full w-1.5 shrink-0 cursor-col-resize bg-canvas outline-none focus-visible:bg-accent/10"
        >
          <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-line transition-colors group-hover:bg-accent/50 group-focus-visible:bg-accent" />
          <span className="absolute left-1/2 top-1/2 h-8 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-line-strong opacity-0 transition-opacity group-hover:opacity-100" />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setIsRightCollapsed(true)}
            aria-label="Ocultar panel de salida"
            title="Ocultar salida"
            className="absolute left-1/2 top-14 flex h-9 w-4 -translate-x-1/2 items-center justify-center rounded-full border border-line bg-raised text-fg-subtle opacity-0 shadow-sm transition-opacity hover:text-fg group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Panel derecho */}
      {isRightCollapsed ? (
        <button
          type="button"
          onClick={() => setIsRightCollapsed(false)}
          aria-label="Mostrar panel de salida"
          title="Mostrar salida"
          className="group flex h-full w-9 shrink-0 flex-col items-center justify-center gap-2 border-l border-line bg-panel text-fg-subtle transition-colors hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span className="rotate-180 text-[10px] uppercase tracking-[0.14em] [writing-mode:vertical-rl]">
            Salida
          </span>
        </button>
      ) : (
        <div
          style={{ width: `${effectiveRight}%` }}
          className="flex h-full min-w-0 shrink-0 flex-col overflow-hidden"
        >
          {right}
        </div>
      )}

      {/* Overlay durante el arrastre */}
      {(isDraggingLeft || isDraggingRight) && (
        <div className="fixed inset-0 z-50 cursor-col-resize select-none" />
      )}
    </div>
  );
}
