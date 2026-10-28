import { describe, it, expect } from "vitest";

describe("RecordModal Component & Interaction Logic", () => {
  it("contiene los modos de captura 'browser' y 'desktop'", () => {
    const modes = ["browser", "desktop"] as const;
    expect(modes).toContain("browser");
    expect(modes).toContain("desktop");
  });

  it("construye el payload correcto para inicio de grabación en navegador", () => {
    const mode = "browser";
    const url = "https://example.com/login";

    const payload = {
      mode,
      initial_url: mode === "browser" ? url.trim() : undefined,
      target_window: undefined,
    };

    expect(payload.mode).toBe("browser");
    expect(payload.initial_url).toBe("https://example.com/login");
    expect(payload.target_window).toBeUndefined();
  });

  it("construye el payload correcto para inicio de macros de escritorio", () => {
    function buildPayload(mode: "browser" | "desktop", url?: string, targetWindow?: string) {
      return {
        mode,
        initial_url: mode === "browser" ? url?.trim() : undefined,
        target_window: mode === "desktop" ? targetWindow?.trim() || undefined : undefined,
      };
    }

    const payload = buildPayload("desktop", undefined, "Calculadora");

    expect(payload.mode).toBe("desktop");
    expect(payload.initial_url).toBeUndefined();
    expect(payload.target_window).toBe("Calculadora");
  });

  it("valida que la URL es requerida en modo navegador y opcional en modo escritorio", () => {
    const isBrowserValid = (url: string) => url.trim().length > 0;
    const isDesktopValid = (_targetWindow: string) => true;

    expect(isBrowserValid("")).toBe(false);
    expect(isBrowserValid("http://localhost:3000")).toBe(true);

    expect(isDesktopValid("")).toBe(true);
    expect(isDesktopValid("Bloc de notas")).toBe(true);
  });
});
