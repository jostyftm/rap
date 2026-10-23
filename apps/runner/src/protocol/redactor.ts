const MASK = "***";
const MIN_SECRET_LENGTH = 4;

/**
 * Enmascara secretos en logs, errores y contexto antes de enviarlos a Redis.
 * Los valores nunca deben salir del runner en claro.
 */
export class SecretRedactor {
  private values: string[] = [];

  constructor(secrets: Record<string, string> | string[] = []) {
    this.setSecrets(secrets);
  }

  setSecrets(secrets: Record<string, string> | string[]): void {
    const source = Array.isArray(secrets) ? secrets : Object.values(secrets);
    const values = source
      .filter((value): value is string => typeof value === "string" && value.length >= MIN_SECRET_LENGTH)
      .sort((a, b) => b.length - a.length);

    this.values = [...new Set(values)];
  }

  redactString(value: string): string {
    if (this.values.length === 0 || value === "") {
      return value;
    }

    let output = value;
    for (const secret of this.values) {
      output = output.split(secret).join(MASK);
      output = output.split(encodeURIComponent(secret)).join(MASK);
    }

    return output;
  }

  redactRecord<T>(record: T): T {
    if (typeof record === "string") {
      return this.redactString(record) as T;
    }

    if (Array.isArray(record)) {
      return record.map((item) => this.redactRecord(item)) as T;
    }

    if (record !== null && typeof record === "object") {
      const output: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(record as Record<string, unknown>)) {
        output[key] = this.redactRecord(value);
      }
      return output as T;
    }

    return record;
  }

  get hasSecrets(): boolean {
    return this.values.length > 0;
  }
}
