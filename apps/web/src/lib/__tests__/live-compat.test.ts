import { describe, it, expect } from "vitest";
import { isProxyHostileHost } from "../live-compat";

describe("isProxyHostileHost", () => {
  it("detecta YouTube en diferentes formatos de URL y subdominios", () => {
    expect(isProxyHostileHost("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
    expect(isProxyHostileHost("https://youtube.com/")).toBe(true);
    expect(isProxyHostileHost("http://m.youtube.com")).toBe(true);
    expect(isProxyHostileHost("https://youtu.be/dQw4w9WgXcQ")).toBe(true);
    expect(isProxyHostileHost("youtube.com")).toBe(true);
    expect(isProxyHostileHost("www.youtube.com:8080")).toBe(true);
  });

  it("detecta otros servicios con fuertes restricciones anti-iframe/DRM", () => {
    expect(isProxyHostileHost("https://accounts.google.com/signin")).toBe(true);
    expect(isProxyHostileHost("https://www.netflix.com/browse")).toBe(true);
    expect(isProxyHostileHost("https://twitch.tv/streamer")).toBe(true);
  });

  it("devuelve false para sitios web normales o locales", () => {
    expect(isProxyHostileHost("https://example.com")).toBe(false);
    expect(isProxyHostileHost("https://github.com/trending")).toBe(false);
    expect(isProxyHostileHost("http://localhost:3000")).toBe(false);
    expect(isProxyHostileHost("")).toBe(false);
  });
});
