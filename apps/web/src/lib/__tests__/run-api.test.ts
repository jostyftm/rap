import { describe, it, expect } from "vitest";
import { resolveArtifactUrl } from "../run-api";

describe("run-api resolveArtifactUrl", () => {
  it("mantiene URLs http/https absolutas sin modificarlas", () => {
    expect(
      resolveArtifactUrl("http://localhost:8000/api/v1/artifacts/abc?expires=123&signature=xyz")
    ).toBe("http://localhost:8000/api/v1/artifacts/abc?expires=123&signature=xyz");
    expect(resolveArtifactUrl("https://cdn.example.com/shot.png")).toBe(
      "https://cdn.example.com/shot.png"
    );
  });

  it("resuelve rutas relativas /api/... contra API_BASE_URL", () => {
    expect(resolveArtifactUrl("/api/v1/artifacts/uuid-1?signature=sig")).toBe(
      "http://localhost:8000/api/v1/artifacts/uuid-1?signature=sig"
    );
  });

  it("mantiene fallback a S3 para claves s3 heredadas y retorna null si está vacío", () => {
    expect(resolveArtifactUrl("runs/1/screenshots/nav_1.png")).toBe(
      "http://localhost:9000/rpa-artifacts/runs/1/screenshots/nav_1.png"
    );
    expect(resolveArtifactUrl(null)).toBeNull();
    expect(resolveArtifactUrl("   ")).toBeNull();
  });
});
