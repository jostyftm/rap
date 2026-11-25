import { afterEach, describe, expect, it, vi } from "vitest";
import { copyToClipboard } from "../clipboard";

describe("copyToClipboard", () => {
  const originalClipboard = navigator.clipboard;
  const originalExecCommand = document.execCommand;

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
    });
    document.execCommand = originalExecCommand;
  });

  it("usa navigator.clipboard.writeText cuando está disponible", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    const ok = await copyToClipboard("http://172.16.30.114:8050/api/v1/webhooks/test");

    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith(
      "http://172.16.30.114:8050/api/v1/webhooks/test"
    );
  });

  it("usa el fallback de execCommand cuando navigator.clipboard es undefined (HTTP por IP)", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });
    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand;

    const ok = await copyToClipboard("http://172.16.30.114:8050/api/v1/webhooks/ip");

    expect(ok).toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("usa el fallback cuando navigator.clipboard.writeText rechaza con error", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("NotAllowedError"));
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand;

    const ok = await copyToClipboard("https://example.com/hook");

    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalled();
    expect(execCommand).toHaveBeenCalledWith("copy");
  });
});
