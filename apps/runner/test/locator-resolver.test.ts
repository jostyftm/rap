import { describe, it, expect, vi } from "vitest";
import type { Page } from "playwright";
import type { LocatorGroup } from "@rpa/dsl";
import { resolveLocator } from "../src/engine/locator-resolver.js";

describe("resolveLocator", () => {
  it("usa el timeout completo configurado cuando hay un solo candidato (sin tope de 2500ms)", async () => {
    const waitFor = vi.fn().mockResolvedValue(undefined);
    const mockLocator = {
      first: vi.fn().mockReturnThis(),
      waitFor,
    };
    const page = {
      locator: vi.fn().mockReturnValue(mockLocator),
    } as unknown as Page;

    const group: LocatorGroup = {
      primary: { strategy: "css", value: ".login-logo", score: 70 },
      fallbacks: [],
    };

    const res = await resolveLocator(page, group, 20000);
    expect(res.strategy).toBe("css");
    expect(waitFor).toHaveBeenCalledTimes(1);
    const arg = waitFor.mock.calls[0][0];
    expect(arg.state).toBe("visible");
    expect(arg.timeout).toBeGreaterThan(19000);
    expect(arg.timeout).toBeLessThanOrEqual(20000);
  });

  it("prefija 'xpath=' para selectores xpath con barra simple y no duplica si ya existe", async () => {
    const waitFor = vi.fn().mockResolvedValue(undefined);
    const mockLocator = {
      first: vi.fn().mockReturnThis(),
      waitFor,
    };
    const page = {
      locator: vi.fn().mockReturnValue(mockLocator),
    } as unknown as Page;

    await resolveLocator(
      page,
      {
        primary: {
          strategy: "xpath",
          value: "/html[1]/body[1]/app-root[1]/app-login[1]/div[1]/img[1]",
          score: 5,
        },
        fallbacks: [],
      },
      10000
    );
    expect(page.locator).toHaveBeenCalledWith(
      "xpath=/html[1]/body[1]/app-root[1]/app-login[1]/div[1]/img[1]"
    );

    await resolveLocator(
      page,
      {
        primary: {
          strategy: "xpath",
          value: "xpath=//button[@id='submit']",
          score: 20,
        },
        fallbacks: [],
      },
      10000
    );
    expect(page.locator).toHaveBeenCalledWith("xpath=//button[@id='submit']");
  });

  it("descarta inmediatamente un candidato con error de sintaxis y espera el resto del timeout en el fallback válido", async () => {
    const primaryWaitFor = vi
      .fn()
      .mockRejectedValue(new Error("Unexpected token \"/\" while parsing css selector"));
    const fallbackWaitFor = vi.fn().mockResolvedValue(undefined);

    const page = {
      locator: vi.fn((selector: string) => {
        if (selector === "bad//selector") {
          return {
            first: () => ({
              isVisible: vi.fn().mockResolvedValue(false),
              waitFor: primaryWaitFor,
            }),
          };
        }
        return {
          first: () => ({
            isVisible: vi.fn().mockResolvedValue(false),
            waitFor: fallbackWaitFor,
          }),
        };
      }),
    } as unknown as Page;

    const res = await resolveLocator(
      page,
      {
        primary: { strategy: "css", value: "bad//selector", score: 50 },
        fallbacks: [
          {
            strategy: "xpath",
            value: "/html[1]/body[1]/app-root[1]/app-login[1]/div[1]/img[1]",
            score: 5,
          },
        ],
      },
      15000
    );

    expect(res.strategy).toBe("xpath");
    expect(primaryWaitFor).toHaveBeenCalledTimes(1);
    expect(fallbackWaitFor).toHaveBeenCalledTimes(1);
    expect(fallbackWaitFor.mock.calls[0][0].timeout).toBeLessThanOrEqual(2500);
  });

  it("reintenta el candidato primario lento en rondas sucesivas hasta que aparece dentro del timeout", async () => {
    let calls = 0;
    const primaryWaitFor = vi.fn().mockImplementation(async () => {
      calls++;
      if (calls === 1) {
        await new Promise((r) => setTimeout(r, 60));
        const err = new Error("locator.waitFor: Timeout 500ms exceeded.");
        err.name = "TimeoutError";
        throw err;
      }
      return undefined;
    });
    const fallbackWaitFor = vi.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 60));
      const err = new Error("locator.waitFor: Timeout 500ms exceeded.");
      err.name = "TimeoutError";
      throw err;
    });

    const page = {
      locator: vi.fn((selector: string) => ({
        first: () => ({
          isVisible: vi.fn().mockResolvedValue(false),
          waitFor: selector === ".slow-el" ? primaryWaitFor : fallbackWaitFor,
        }),
      })),
    } as unknown as Page;

    const res = await resolveLocator(
      page,
      {
        primary: { strategy: "css", value: ".slow-el", score: 80 },
        fallbacks: [{ strategy: "xpath", value: "/html[1]/body[1]/div[1]", score: 5 }],
      },
      4000
    );

    expect(res.strategy).toBe("css");
    expect(primaryWaitFor).toHaveBeenCalledTimes(2);
    expect(fallbackWaitFor).toHaveBeenCalledTimes(1);
  });
});
