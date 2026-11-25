import { S3Client, PutObjectCommand, CreateBucketCommand } from "@aws-sdk/client-s3";

export interface ResolvedS3Config {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
  forcePathStyle: boolean;
}

export function resolveS3Config(env: NodeJS.ProcessEnv = process.env): ResolvedS3Config {
  const endpoint = (env.S3_ENDPOINT || env.AWS_ENDPOINT || "http://127.0.0.1:9000").trim();
  const accessKeyId = env.S3_ACCESS_KEY || env.AWS_ACCESS_KEY_ID || "sail";
  const secretAccessKey = env.S3_SECRET_KEY || env.AWS_SECRET_ACCESS_KEY || "password";
  const bucket = (env.S3_BUCKET || env.AWS_BUCKET || "rpa-artifacts").trim();
  const region = (env.S3_REGION || env.AWS_DEFAULT_REGION || "us-east-1").trim();
  const rawForcePathStyle = env.S3_FORCE_PATH_STYLE ?? env.AWS_USE_PATH_STYLE_ENDPOINT ?? "true";

  return {
    endpoint,
    accessKeyId,
    secretAccessKey,
    bucket,
    region,
    forcePathStyle: rawForcePathStyle.toLowerCase().trim() !== "false",
  };
}

const initialConfig = resolveS3Config(process.env);

const s3Client = new S3Client({
  endpoint: initialConfig.endpoint,
  region: initialConfig.region,
  credentials: {
    accessKeyId: initialConfig.accessKeyId,
    secretAccessKey: initialConfig.secretAccessKey,
  },
  forcePathStyle: initialConfig.forcePathStyle,
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
  const { bucket } = resolveS3Config(process.env);
  try {
    await s3Client.send(new CreateBucketCommand({ Bucket: bucket }));
    bucketChecked = true;
  } catch (error: any) {
    if (
      error.name === "BucketAlreadyOwnedByYou" ||
      error.name === "BucketAlreadyExists" ||
      error.name === "AccessDenied" ||
      error.$metadata?.httpStatusCode === 409 ||
      error.$metadata?.httpStatusCode === 403
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

export function buildArtifactUrl(key: string, env: NodeJS.ProcessEnv = process.env): string {
  const cleanKey = key.replace(/^\/+/, "");
  const publicBase = (env.S3_PUBLIC_URL || env.AWS_URL || "").trim().replace(/\/+$/, "");
  if (publicBase) {
    return `${publicBase}/${cleanKey}`;
  }
  const { endpoint, bucket } = resolveS3Config(env);
  return `${endpoint.replace(/\/+$/, "")}/${bucket}/${cleanKey}`;
}

export async function uploadArtifactWithStatus(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType = "image/png"
): Promise<{ key: string; bucket: string; url: string; uploaded: boolean }> {
  const { bucket } = resolveS3Config(process.env);
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
