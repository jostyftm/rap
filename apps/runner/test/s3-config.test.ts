import { describe, it, expect } from "vitest";
import { buildArtifactUrl, resolveS3Config } from "../src/storage/s3.js";

describe("s3 config (MinIO / RustFS)", () => {
  it("prioriza variables S3_* para MinIO externo", () => {
    const cfg = resolveS3Config({
      S3_ENDPOINT: "http://minio.dokploy:9000 ",
      S3_ACCESS_KEY: "minio_user",
      S3_SECRET_KEY: "minio_pass",
      S3_BUCKET: "custom-bucket",
      S3_REGION: "eu-west-1",
      S3_FORCE_PATH_STYLE: "true",
    } as NodeJS.ProcessEnv);

    expect(cfg).toEqual({
      endpoint: "http://minio.dokploy:9000",
      accessKeyId: "minio_user",
      secretAccessKey: "minio_pass",
      bucket: "custom-bucket",
      region: "eu-west-1",
      forcePathStyle: true,
    });
  });

  it("hace fallback a variables AWS_* y permite desactivar path-style", () => {
    const cfg = resolveS3Config({
      AWS_ENDPOINT: "https://s3.amazonaws.com",
      AWS_ACCESS_KEY_ID: "aws_key",
      AWS_SECRET_ACCESS_KEY: "aws_secret",
      AWS_BUCKET: "aws-bucket",
      AWS_DEFAULT_REGION: "us-east-2",
      AWS_USE_PATH_STYLE_ENDPOINT: "false",
    } as NodeJS.ProcessEnv);

    expect(cfg).toEqual({
      endpoint: "https://s3.amazonaws.com",
      accessKeyId: "aws_key",
      secretAccessKey: "aws_secret",
      bucket: "aws-bucket",
      region: "us-east-2",
      forcePathStyle: false,
    });
  });

  it("construye URL de artefacto respetando S3_PUBLIC_URL o AWS_ENDPOINT", () => {
    expect(
      buildArtifactUrl("/runs/1/shot.png", {
        AWS_ENDPOINT: "http://minio:9000/",
        AWS_BUCKET: "rpa-prod",
      } as NodeJS.ProcessEnv)
    ).toBe("http://minio:9000/rpa-prod/runs/1/shot.png");

    expect(
      buildArtifactUrl("runs/1/shot.png", {
        S3_PUBLIC_URL: "https://cdn.example.com/rpa/",
      } as NodeJS.ProcessEnv)
    ).toBe("https://cdn.example.com/rpa/runs/1/shot.png");
  });

  it("resuelve S3_URL completo con credenciales codificadas, bucket y query params", () => {
    const cfg = resolveS3Config({
      S3_URL: "https://my%40key:sec%2Fret@minio.dokploy.internal:9000/rpa-prod?region=eu-central-1&pathStyle=false",
      S3_ENDPOINT: "http://ignored:9000",
      S3_BUCKET: "ignored-bucket",
    } as NodeJS.ProcessEnv);

    expect(cfg).toEqual({
      endpoint: "https://minio.dokploy.internal:9000",
      accessKeyId: "my@key",
      secretAccessKey: "sec/ret",
      bucket: "rpa-prod",
      region: "eu-central-1",
      forcePathStyle: false,
    });
  });

  it("usa variables discretas o defaults internos cuando S3_URL está vacío", () => {
    const cfg = resolveS3Config({
      S3_URL: "",
      S3_ENDPOINT: "http://rustfs:9000",
      S3_ACCESS_KEY: "localkey",
      S3_SECRET_KEY: "localsecret",
      S3_BUCKET: "rpa-artifacts",
    } as NodeJS.ProcessEnv);

    expect(cfg).toEqual({
      endpoint: "http://rustfs:9000",
      accessKeyId: "localkey",
      secretAccessKey: "localsecret",
      bucket: "rpa-artifacts",
      region: "us-east-1",
      forcePathStyle: true,
    });
  });
});
