import { create } from "zustand";

export type EditorLayoutMode = "flow" | "split" | "full_site";
export type LiveViewportMode = "desktop" | "laptop" | "full_hd" | "mobile" | "fit";
export type ViewportScaleMode = "fit_scale" | "actual_size";

export interface ViewportDimensions {
  width: number;
  height: number;
  label: string;
}

export const VIEWPORT_PRESETS: Record<LiveViewportMode, ViewportDimensions | null> = {
  desktop: { width: 1280, height: 800, label: "Web Escritorio (1280×800)" },
  laptop: { width: 1366, height: 768, label: "Laptop Web (1366×768)" },
  full_hd: { width: 1920, height: 1080, label: "Full HD (1920×1080)" },
  mobile: { width: 390, height: 844, label: "Móvil (390×844)" },
  fit: null,
};

interface LayoutStoreState {
  mode: EditorLayoutMode;
  splitRatio: number; // 20 a 80 (%)
  viewportMode: LiveViewportMode;
  viewportScaleMode: ViewportScaleMode;
  isConsoleCollapsed: boolean;
  isPaletteCollapsed: boolean;
  setMode: (mode: EditorLayoutMode) => void;
  setSplitRatio: (ratio: number) => void;
  setViewportMode: (vp: LiveViewportMode) => void;
  setViewportScaleMode: (scaleMode: ViewportScaleMode) => void;
  toggleConsoleCollapsed: () => void;
  setPaletteCollapsed: (collapsed: boolean) => void;
  togglePaletteCollapsed: () => void;
  cycleLayoutMode: () => void;
}

const STORAGE_KEY_RATIO = "rpa:editor:split_ratio";
const STORAGE_KEY_MODE = "rpa:editor:layout_mode";
const STORAGE_KEY_VP = "rpa:editor:viewport_mode";
const STORAGE_KEY_SCALE = "rpa:editor:viewport_scale_mode";

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
  if (typeof window === "undefined") return "desktop";
  const val = localStorage.getItem(STORAGE_KEY_VP);
  return val === "desktop" || val === "laptop" || val === "full_hd" || val === "mobile" || val === "fit"
    ? val
    : "desktop";
}

function getInitialScaleMode(): ViewportScaleMode {
  if (typeof window === "undefined") return "fit_scale";
  const val = localStorage.getItem(STORAGE_KEY_SCALE);
  return val === "fit_scale" || val === "actual_size" ? val : "fit_scale";
}

export const useLayoutStore = create<LayoutStoreState>((set, get) => ({
  mode: getInitialMode(),
  splitRatio: getInitialRatio(),
  viewportMode: getInitialViewport(),
  viewportScaleMode: getInitialScaleMode(),
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

  setViewportScaleMode: (viewportScaleMode) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_SCALE, viewportScaleMode);
    }
    set({ viewportScaleMode });
  },

  toggleConsoleCollapsed: () => set((s) => ({ isConsoleCollapsed: !s.isConsoleCollapsed })),

  cycleLayoutMode: () => {
    const current = get().mode;
    const next: EditorLayoutMode =
      current === "flow" ? "split" : current === "split" ? "full_site" : "flow";
    get().setMode(next);
  },
}));
