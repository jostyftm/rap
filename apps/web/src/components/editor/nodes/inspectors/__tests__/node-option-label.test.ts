import { describe, expect, it } from "vitest";
import type { RecipeDsl } from "@rpa/dsl";
import "../../index";
import {
  formatBranchNodeOption,
  getNodeOptionDetail,
  sortBranchCandidateNodes,
} from "../node-option-label";

describe("node-option-label", () => {
  it("distingue dos nodos click con la misma descripción usando su id y locator primario", () => {
    const clickSave = {
      id: "n_click_save",
      type: "click" as const,
      description: "Hacer clic en elemento",
      locator: {
        primary: { strategy: "testid" as const, value: "btn-guardar", score: 95 },
        fallbacks: [],
      },
      params: { button: "left" as const },
    };

    const clickDelete = {
      id: "n_click_del",
      type: "click" as const,
      description: "Hacer clic en elemento",
      locator: {
        primary: { strategy: "css" as const, value: "#btn-eliminar", score: 80 },
        fallbacks: [],
      },
      params: { button: "left" as const },
    };

    const labelSave = formatBranchNodeOption(clickSave);
    const labelDelete = formatBranchNodeOption(clickDelete);

    expect(labelSave).toBe(
      "[n_click_save] Hacer clic en elemento (Clic) — testid: btn-guardar"
    );
    expect(labelDelete).toBe(
      "[n_click_del] Hacer clic en elemento (Clic) — css: #btn-eliminar"
    );
    expect(labelSave).not.toBe(labelDelete);
  });

  it("incluye el highlight de navigate y httpRequest y trunca textos largos", () => {
    const nav = {
      id: "n_nav",
      type: "navigate" as const,
      description: "Navegar a URL",
      params: {
        url: "https://ejemplo-muy-largo.com/ruta/con/muchos/segmentos/para/verificar/truncado",
        waitUntil: "domcontentloaded" as const,
      },
    };

    const http = {
      id: "n_http",
      type: "httpRequest" as const,
      description: "Llamada HTTP / API",
      params: {
        method: "POST" as const,
        url: "https://api.example.com/v1/alerts",
        pathParams: [],
        queryParams: [],
        headers: [],
        auth: { type: "none" as const },
        bodyType: "none" as const,
        responseType: "auto" as const,
        timeoutMs: 30000,
        followRedirects: true,
        failOnHttpError: true,
        outputVariable: "",
      },
    };

    const navDetail = getNodeOptionDetail(nav);
    expect(navDetail).toBeDefined();
    expect(navDetail!.length).toBeLessThanOrEqual(48);
    expect(navDetail!.endsWith("…")).toBe(true);

    expect(formatBranchNodeOption(http)).toBe(
      "[n_http] Llamada HTTP / API (Petición HTTP) — POST https://api.example.com/v1/alerts"
    );
  });

  it("excluye el nodo actual y ordena por recorrido desde entry antes que nodos desconectados", () => {
    const definition: RecipeDsl = {
      schema: "rpa/v1",
      entry: "n1",
      nodes: {
        n_orphan_b: {
          id: "n_orphan_b",
          type: "screenshot",
          description: "Captura error",
          params: { fullPage: false },
        },
        n_orphan_a: {
          id: "n_orphan_a",
          type: "setVariable",
          description: "Guardar error",
          params: { name: "errMsg", expression: "{{variables.error.message}}" },
        },
        n3: {
          id: "n3",
          type: "click",
          description: "Clic final",
          locator: {
            primary: { strategy: "css", value: ".done", score: 80 },
            fallbacks: [],
          },
          params: { button: "left" },
        },
        n2_try: {
          id: "n2_try",
          type: "tryCatch",
          description: "TryCatch",
          params: {
            tryEntryNodeId: "n_orphan_a",
            catchEntryNodeId: "n_orphan_b",
            errorVariable: "error",
            rethrow: false,
          },
          next: "n3",
        },
        n1: {
          id: "n1",
          type: "navigate",
          description: "Inicio",
          params: { url: "https://example.com", waitUntil: "domcontentloaded" },
          next: "n2_try",
        },
        n_disconnected: {
          id: "n_disconnected",
          type: "scroll",
          description: "Scroll suelto",
          params: { mode: "bottom" },
        },
      },
      edges: [],
    };

    const sorted = sortBranchCandidateNodes(definition, "n2_try");
    expect(sorted.map((n) => n.id)).toEqual([
      "n1",
      "n3",
      "n_orphan_a",
      "n_orphan_b",
      "n_disconnected",
    ]);
  });
});
