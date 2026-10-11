"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useLayoutStore } from "@/stores/use-layout-store";

export function useSplitResizer() {
  const splitRatio = useLayoutStore((s) => s.splitRatio);
  const setSplitRatio = useLayoutStore((s) => s.setSplitRatio);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);

  const splitContainerRef = useRef<HTMLDivElement>(null);
  const splitAreaRef = useRef<HTMLDivElement>(null);

  const handleMouseDownSplit = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingSplit(true);
  }, []);

  useEffect(() => {
    if (!isDraggingSplit) return;

    const handleMouseMove = (e: MouseEvent) => {
      const area = splitAreaRef.current;
      if (!area) return;

      const rect = area.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const totalWidth = rect.width;

      if (totalWidth <= 0) return;

      const ratio = Math.max(20, Math.min(80, (currentX / totalWidth) * 100));
      setSplitRatio(Math.round(ratio));
    };

    const handleMouseUp = () => {
      setIsDraggingSplit(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingSplit, setSplitRatio]);

  return {
    splitRatio,
    setSplitRatio,
    isDraggingSplit,
    splitContainerRef,
    splitAreaRef,
    handleMouseDownSplit,
  };
}
