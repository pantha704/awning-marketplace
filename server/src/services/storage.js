/**
 * Image storage with two drivers behind one interface:
 *   s3    - objects in an S3 bucket, read through S3_PUBLIC_URL (CloudFront) or the bucket URL
 *   local - files in server/storage/media, served by the API from /media
 * The database stores keys; urlFor() builds the public URL on read.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

export const mediaRoot = path.join(config.storageRoot, 'media');
fs.mkdirSync(mediaRoot, { recursive: true });

const isS3 = () => config.storageDriver === 's3';
const TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.txt': 'text/plain' };
export const contentTypeFor = (file) => TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';

let s3Client = null;
async function s3() {
  if (!s3Client) {
    const { S3Client } = await import('@aws-sdk/client-s3');
    const { accessKeyId, secretAccessKey, region } = config.aws;
    // Without explicit keys the SDK uses its default chain (instance role, SSO, ...).
    s3Client = new S3Client({ region, credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined });
  }
  return s3Client;
}

/** Public URL for a stored key. Absolute URLs (for example seeded remote photos) pass through. */
export function urlFor(key) {
  if (!key) return '';
  if (/^https?:\/\//.test(key)) return key;
  if (!isS3()) return `/media/${key}`;
  const base = config.aws.publicUrl || `https://${config.aws.bucket}.s3.${config.aws.region}.amazonaws.com`;
  return `${base}/${key}`;
}

export async function putBuffer(buffer, key) {
  if (isS3()) {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    await (await s3()).send(new PutObjectCommand({
      Bucket: config.aws.bucket, Key: key, Body: buffer, ContentType: contentTypeFor(key), CacheControl: 'public, max-age=31536000, immutable',
    }));
    return key;
  }
  const dest = path.join(mediaRoot, key);
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await fsp.writeFile(dest, buffer);
  return key;
}

export async function remove(key) {
  if (!key || /^https?:\/\//.test(key)) return;
  if (isS3()) {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    await (await s3()).send(new DeleteObjectCommand({ Bucket: config.aws.bucket, Key: key }));
    return;
  }
  await fsp.rm(path.join(mediaRoot, key), { force: true });
}

export async function exists(key) {
  if (isS3()) {
    const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
    try { await (await s3()).send(new HeadObjectCommand({ Bucket: config.aws.bucket, Key: key })); return true; } catch { return false; }
  }
  return fs.existsSync(path.join(mediaRoot, key));
}
