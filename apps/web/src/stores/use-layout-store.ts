import { create } from "zustand";

export type EditorLayoutMode = "flow" | "split" | "full_site";
export type LiveViewportMode = "fit" | "desktop" | "full_hd" | "mobile";

export interface ViewportDimensions {
  width: number;
  height: number;
}

export const VIEWPORT_PRESETS: Record<LiveViewportMode, ViewportDimensions | null> = {
  fit: null,
  desktop: { width: 1280, height: 800 },
  full_hd: { width: 1920, height: 1080 },
  mobile: { width: 390, height: 844 },
};

interface LayoutStoreState {
  mode: EditorLayoutMode;
  splitRatio: number; // 20 a 80 (%)
  viewportMode: LiveViewportMode;
  isConsoleCollapsed: boolean;
  isPaletteCollapsed: boolean;
  setMode: (mode: EditorLayoutMode) => void;
  setSplitRatio: (ratio: number) => void;
  setViewportMode: (vp: LiveViewportMode) => void;
  toggleConsoleCollapsed: () => void;
  setPaletteCollapsed: (collapsed: boolean) => void;
  togglePaletteCollapsed: () => void;
  cycleLayoutMode: () => void;
}

const STORAGE_KEY_RATIO = "rpa:editor:split_ratio";
const STORAGE_KEY_MODE = "rpa:editor:layout_mode";
const STORAGE_KEY_VP = "rpa:editor:viewport_mode";

function getInitialRatio(): number {
  if (typeof window === "undefined") return 50;
  const val = Number(localStorage.getItem(STORAGE_KEY_RATIO));
  return val >= 25 && val <= 75 ? val : 50;
}

function getInitialMode(): EditorLayoutMode {
  if (typeof window === "undefined") return "flow";
  const val = localStorage.getItem(STORAGE_KEY_MODE);
  return val === "flow" || val === "split" || val === "full_site" ? val : "flow";
}

function getInitialViewport(): LiveViewportMode {
  if (typeof window === "undefined") return "fit";
  const val = localStorage.getItem(STORAGE_KEY_VP);
  return val === "fit" || val === "desktop" || val === "full_hd" || val === "mobile"
    ? val
    : "fit";
}

export const useLayoutStore = create<LayoutStoreState>((set, get) => ({
  mode: getInitialMode(),
  splitRatio: getInitialRatio(),
  viewportMode: getInitialViewport(),
  isConsoleCollapsed: false,
  isPaletteCollapsed: false,

  setPaletteCollapsed: (isPaletteCollapsed) => set({ isPaletteCollapsed }),
  togglePaletteCollapsed: () => set((s) => ({ isPaletteCollapsed: !s.isPaletteCollapsed })),

  setMode: (mode) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_MODE, mode);
    }
    set({ mode });
  },

  setSplitRatio: (ratio) => {
    const clamped = Math.max(25, Math.min(75, ratio));
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_RATIO, String(clamped));
    }
    set({ splitRatio: clamped });
  },

  setViewportMode: (viewportMode) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_VP, viewportMode);
    }
    set({ viewportMode });
  },

  toggleConsoleCollapsed: () => set((s) => ({ isConsoleCollapsed: !s.isConsoleCollapsed })),

  cycleLayoutMode: () => {
    const current = get().mode;
    const next: EditorLayoutMode =
      current === "flow" ? "split" : current === "split" ? "full_site" : "flow";
    get().setMode(next);
  },
}));
