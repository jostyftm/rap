"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { Layers, SlidersHorizontal, Database, ChevronLeft, ChevronRight } from "lucide-react";

interface ThreePanelLayoutProps {
  left: React.ReactNode;
  center: React.ReactNode;
  right: React.ReactNode;
}

export function ThreePanelLayout({ left, center, right }: ThreePanelLayoutProps) {
  // Proporciones porcentuales: Left (28%), Center (40%), Right (32%)
  const [leftWidth, setLeftWidth] = useState(28);
  const [rightWidth, setRightWidth] = useState(32);

  const [activeTabMobile, setActiveTabMobile] = useState<"left" | "center" | "right">("center");
  const [isMobile, setIsMobile] = useState(false);

  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
  const [isRightCollapsed, setIsRightCollapsed] = useState(false);

  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Detección responsive
  useEffect(() => {
    const checkSize = () => {
      const w = window.innerWidth;
      setIsMobile(w < 1180);
    };
    checkSize();
    window.addEventListener("resize", checkSize);
    return () => window.removeEventListener("resize", checkSize);
  }, []);

  // Redimensionador Izquierdo (Left <-> Center)
  useEffect(() => {
    if (!isDraggingLeft) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const totalWidth = rect.width;
      if (totalWidth <= 0) return;

      const pct = Math.max(18, Math.min(42, (currentX / totalWidth) * 100));
      setLeftWidth(Math.round(pct));
    };

    const handleMouseUp = () => setIsDraggingLeft(false);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingLeft]);

  // Redimensionador Derecho (Center <-> Right)
  useEffect(() => {
    if (!isDraggingRight) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const currentFromRight = rect.right - e.clientX;
      const totalWidth = rect.width;
      if (totalWidth <= 0) return;

      const pct = Math.max(20, Math.min(48, (currentFromRight / totalWidth) * 100));
      setRightWidth(Math.round(pct));
    };

    const handleMouseUp = () => setIsDraggingRight(false);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingRight]);

  const resetRatios = () => {
    setLeftWidth(28);
    setRightWidth(32);
    setIsLeftCollapsed(false);
    setIsRightCollapsed(false);
  };

  if (isMobile) {
    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Barra de pestañas móvil */}
        <div className="flex items-center justify-around p-2 border-b border-zinc-800 bg-zinc-900 text-xs font-mono shrink-0">
          <button
            type="button"
            onClick={() => setActiveTabMobile("left")}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded transition-colors ${
              activeTabMobile === "left"
                ? "bg-zinc-800 text-white font-semibold"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Entrada</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTabMobile("center")}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded transition-colors ${
              activeTabMobile === "center"
                ? "bg-zinc-800 text-white font-semibold"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Configuración</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTabMobile("right")}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded transition-colors ${
              activeTabMobile === "right"
                ? "bg-zinc-800 text-white font-semibold"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Salida / En vivo</span>
          </button>
        </div>

        {/* Panel Activo */}
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
    <div ref={containerRef} className="flex-1 flex h-full overflow-hidden relative">
      {/* 1. Panel Izquierdo: ENTRADA */}
      {!isLeftCollapsed && (
        <div
          style={{ width: `${effectiveLeft}%` }}
          className="h-full overflow-hidden flex flex-col shrink-0 min-w-0"
        >
          {left}
        </div>
      )}

      {/* Gutter 1: Separador Izquierdo */}
      <div
        onMouseDown={(e) => {
          e.preventDefault();
          setIsDraggingLeft(true);
        }}
        onDoubleClick={resetRatios}
        title="Arrastra para redimensionar (o doble clic para restaurar 28%)"
        className={`w-1.5 h-full cursor-col-resize flex items-center justify-center transition-colors z-20 shrink-0 ${
          isDraggingLeft
            ? "bg-amber-400"
            : "bg-zinc-900 border-x border-zinc-800 hover:bg-zinc-700"
        }`}
      >
        <div className="w-0.5 h-6 bg-zinc-600 rounded-full" />
      </div>

      {/* 2. Panel Central: CONFIGURACIÓN */}
      <div
        style={{ width: `${effectiveCenter}%` }}
        className="h-full overflow-hidden flex flex-col flex-1 min-w-0"
      >
        {center}
      </div>

      {/* Gutter 2: Separador Derecho */}
      <div
        onMouseDown={(e) => {
          e.preventDefault();
          setIsDraggingRight(true);
        }}
        onDoubleClick={resetRatios}
        title="Arrastra para redimensionar (o doble clic para restaurar 32%)"
        className={`w-1.5 h-full cursor-col-resize flex items-center justify-center transition-colors z-20 shrink-0 ${
          isDraggingRight
            ? "bg-amber-400"
            : "bg-zinc-900 border-x border-zinc-800 hover:bg-zinc-700"
        }`}
      >
        <div className="w-0.5 h-6 bg-zinc-600 rounded-full" />
      </div>

      {/* 3. Panel Derecho: SALIDA & NAVEGADOR EN VIVO */}
      {!isRightCollapsed && (
        <div
          style={{ width: `${effectiveRight}%` }}
          className="h-full overflow-hidden flex flex-col shrink-0 min-w-0"
        >
          {right}
        </div>
      )}

      {/* Overlay invisible mientras se arrastra */}
      {(isDraggingLeft || isDraggingRight) && (
        <div className="fixed inset-0 z-50 cursor-col-resize select-none pointer-events-auto" />
      )}
    </div>
  );
}
