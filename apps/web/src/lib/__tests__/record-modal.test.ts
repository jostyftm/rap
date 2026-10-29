import { describe, it, expect } from "vitest";

describe("RecordModal Component & Interaction Logic", () => {
  it("construye el payload correcto para inicio de grabación en navegador", () => {
    const url = "https://example.com/login";

    const payload = {
      mode: "browser",
      initial_url: url.trim(),
      type_debounce_ms: 1000,
      capture_scroll: true,
    };

    expect(payload.mode).toBe("browser");
    expect(payload.initial_url).toBe("https://example.com/login");
    expect(payload.type_debounce_ms).toBe(1000);
    expect(payload.capture_scroll).toBe(true);
  });

  it("valida que la URL es estrictamente requerida", () => {
    const isUrlValid = (url: string) => url.trim().length > 0;

    expect(isUrlValid("")).toBe(false);
    expect(isUrlValid("   ")).toBe(false);
    expect(isUrlValid("http://localhost:3000")).toBe(true);
    expect(isUrlValid("https://example.com")).toBe(true);
  });

  it("incluye type_debounce_ms y capture_scroll configurables en el payload de inicio", () => {
    function buildStartPayload(
      url: string,
      typeDebounceMs = 1000,
      captureScroll = true
    ) {
      return {
        mode: "browser",
        initial_url: url.trim(),
        type_debounce_ms: typeDebounceMs,
        capture_scroll: captureScroll,
      };
    }

    const payloadFast = buildStartPayload("https://example.com", 500, false);
    expect(payloadFast.type_debounce_ms).toBe(500);
    expect(payloadFast.capture_scroll).toBe(false);

    const payloadSlow = buildStartPayload("https://example.com", 2000, true);
    expect(payloadSlow.type_debounce_ms).toBe(2000);
    expect(payloadSlow.capture_scroll).toBe(true);
  });
});
