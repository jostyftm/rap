import { S3Client, PutObjectCommand, CreateBucketCommand } from "@aws-sdk/client-s3";

const S3_ENDPOINT = process.env.S3_ENDPOINT || "http://127.0.0.1:9000";
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || "sail";
const S3_SECRET_KEY = process.env.S3_SECRET_KEY || "password";
const S3_BUCKET = process.env.S3_BUCKET || "rpa-artifacts";

const s3Client = new S3Client({
  endpoint: S3_ENDPOINT,
  region: "us-east-1",
  credentials: {
    accessKeyId: S3_ACCESS_KEY,
    secretAccessKey: S3_SECRET_KEY,
  },
  forcePathStyle: true,
  maxAttempts: 2,
});

let bucketChecked = false;
let s3UnavailableUntil = 0;
const S3_CONNECTION_COOLDOWN_MS = 5000;
const CONNECTION_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNRESET",
  "ETIMEDOUT",
]);

function isConnectionError(error: any): boolean {
  const code = error?.code || error?.cause?.code;
  return typeof code === "string" && CONNECTION_ERROR_CODES.has(code);
}

export async function ensureBucket(): Promise<void> {
  if (bucketChecked || Date.now() < s3UnavailableUntil) return;
  try {
    await s3Client.send(new CreateBucketCommand({ Bucket: S3_BUCKET }));
    bucketChecked = true;
  } catch (error: any) {
    if (
      error.name === "BucketAlreadyOwnedByYou" ||
      error.name === "BucketAlreadyExists" ||
      error.$metadata?.httpStatusCode === 409
    ) {
      bucketChecked = true;
      return;
    }
    if (isConnectionError(error)) {
      s3UnavailableUntil = Date.now() + S3_CONNECTION_COOLDOWN_MS;
    }
    // Si no está disponible aún, reintentará en la siguiente subida
  }
}

export function buildArtifactUrl(key: string): string {
  const cleanKey = key.replace(/^\/+/, "");
  const publicBase = (process.env.S3_PUBLIC_URL || "").trim().replace(/\/+$/, "");
  if (publicBase) {
    return `${publicBase}/${cleanKey}`;
  }
  const endpoint = (process.env.S3_ENDPOINT || S3_ENDPOINT).trim().replace(/\/+$/, "");
  const bucket = (process.env.S3_BUCKET || S3_BUCKET).trim();
  return `${endpoint}/${bucket}/${cleanKey}`;
}

export async function uploadArtifactWithStatus(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType = "image/png"
): Promise<{ key: string; bucket: string; url: string; uploaded: boolean }> {
  const bucket = (process.env.S3_BUCKET || S3_BUCKET).trim();
  const url = buildArtifactUrl(key);

  if (Date.now() < s3UnavailableUntil) {
    return { key, bucket, url, uploaded: false };
  }

  try {
    await ensureBucket();
    if (Date.now() < s3UnavailableUntil) {
      return { key, bucket, url, uploaded: false };
    }

    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: typeof body === "string" ? Buffer.from(body) : body,
        ContentType: contentType,
      })
    );
    return { key, bucket, url, uploaded: true };
  } catch (error) {
    if (isConnectionError(error)) {
      s3UnavailableUntil = Date.now() + S3_CONNECTION_COOLDOWN_MS;
    }
    console.error(`[S3] Error subiendo artefacto ${key}:`, error);
    return { key, bucket, url, uploaded: false };
  }
}

export async function uploadArtifact(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType = "image/png"
): Promise<string> {
  const { key: resolvedKey } = await uploadArtifactWithStatus(key, body, contentType);
  return resolvedKey; // Retornar la clave incluso si S3 no está disponible en testing local
}
