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
});

let bucketChecked = false;

export async function ensureBucket(): Promise<void> {
  if (bucketChecked) return;
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
    // Si no está disponible aún, reintentará en la siguiente subida
  }
}

export async function uploadArtifact(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType = "image/png"
): Promise<string> {
  try {
    await ensureBucket();
    await s3Client.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: typeof body === "string" ? Buffer.from(body) : body,
        ContentType: contentType,
      })
    );
    return key;
  } catch (error) {
    console.error(`[S3] Error subiendo artefacto ${key}:`, error);
    return key; // Retornar la clave incluso si S3 no está disponible en testing local
  }
}
