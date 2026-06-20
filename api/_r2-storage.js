import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

export function isR2Configured() {
  return Boolean(
    process.env.R2_ACCOUNT_ID
    && process.env.R2_ACCESS_KEY_ID
    && process.env.R2_SECRET_ACCESS_KEY
    && process.env.R2_BUCKET_NAME,
  );
}

function getR2Client() {
  if (!isR2Configured()) {
    throw new Error('R2 is not configured (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME)');
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

export function r2PublicUrl(objectKey) {
  const base = String(process.env.R2_PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
  const key = String(objectKey || '').replace(/^\//, '');
  if (!base) throw new Error('R2_PUBLIC_BASE_URL is required when using R2');
  return `${base}/${key}`;
}

/** Upload to Cloudflare R2 (S3-compatible). objectKey e.g. TBAG91/1.jpg */
export async function uploadToR2({ buffer, contentType, objectKey }) {
  const Bucket = process.env.R2_BUCKET_NAME;
  const client = getR2Client();
  await client.send(new PutObjectCommand({
    Bucket,
    Key: objectKey,
    Body: buffer,
    ContentType: contentType || 'image/jpeg',
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  return {
    bucket: Bucket,
    objectKey,
    publicUrl: r2PublicUrl(objectKey),
  };
}

export function r2StorageLabel(objectKey) {
  return `${process.env.R2_BUCKET_NAME || 'proto-images'}/${objectKey}`;
}
