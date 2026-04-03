import {
  S3Client,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

function getR2Client(): S3Client {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 credentials not configured (CLOUDFLARE_R2_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY)");
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

/**
 * Upload a snapshot (screenshot/PDF) to Cloudflare R2.
 * Returns the object key for retrieval.
 */
export async function uploadSnapshot(
  key: string,
  body: Buffer,
  contentType: string = "image/png",
): Promise<string> {
  const client = getR2Client();
  const bucket = process.env.CLOUDFLARE_R2_BUCKET ?? "deepmint-snapshots";

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );

  return key;
}

/**
 * Get the public URL for a snapshot.
 */
export function getSnapshotUrl(key: string): string {
  const publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL ?? "https://snapshots.deepmint.com";
  return `${publicUrl}/${key}`;
}

/**
 * Generate the R2 key for a snapshot.
 * Format: snapshots/{YYYY-MM-DD}/{contentHash}.png
 */
export function snapshotKey(date: Date, contentHash: string): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `snapshots/${yyyy}-${mm}-${dd}/${contentHash}.png`;
}
