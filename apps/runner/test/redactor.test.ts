import { describe, expect, it } from "vitest";
import { SecretRedactor } from "../src/protocol/redactor.js";

describe("SecretRedactor", () => {
  it("enmascara los valores en textos y objetos anidados", () => {
    const redactor = new SecretRedactor({ PORTAL_PASSWORD: "Sup3rS3cret!" });

    expect(redactor.redactString("login con Sup3rS3cret! falló")).toBe("login con *** falló");
    expect(
      redactor.redactRecord({
        message: "Sup3rS3cret!",
        nested: { url: "https://x.test/?token=Sup3rS3cret!" },
        duration: 120,
      })
    ).toEqual({
      message: "***",
      nested: { url: "https://x.test/?token=***" },
      duration: 120,
    });
  });

  it("también redacta la variante codificada para URL", () => {
    const redactor = new SecretRedactor({ TOKEN: "a b+c/d" });

    expect(redactor.redactString("x=a%20b%2Bc%2Fd")).toBe("x=***");
  });

  it("ignora valores demasiado cortos", () => {
    const redactor = new SecretRedactor({ PIN: "12" });

    expect(redactor.redactString("paso 12 de 30")).toBe("paso 12 de 30");
    expect(redactor.hasSecrets).toBe(false);
  });
});
