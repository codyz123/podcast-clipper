import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";

// Lazy initialization to avoid errors when env vars aren't set
let r2Client: S3Client | null = null;

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME &&
    process.env.R2_PUBLIC_URL
  );
}

function getR2Client(): S3Client {
  if (!r2Client) {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new Error(
        "R2 storage not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY"
      );
    }

    r2Client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }
  return r2Client;
}

function getBucketName(): string {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) {
    throw new Error("R2_BUCKET_NAME environment variable is required");
  }
  return bucket;
}

/**
 * Get the public URL for an R2 object
 */
export function getR2PublicUrl(key: string): string {
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!publicUrl) {
    throw new Error("R2_PUBLIC_URL environment variable is required");
  }
  return `${publicUrl}/${key}`;
}

/**
 * Extract the key from an R2 public URL
 */
export function getKeyFromR2Url(url: string): string | null {
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!publicUrl || !url.startsWith(publicUrl)) {
    return null;
  }
  return url.slice(publicUrl.length + 1); // +1 for the trailing slash
}

/**
 * Upload a file to R2
 */
export async function uploadToR2(
  key: string,
  body: Buffer,
  contentType: string
): Promise<{ url: string; size: number }> {
  const client = getR2Client();
  const bucket = getBucketName();

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );

  return {
    url: getR2PublicUrl(key),
    size: body.length,
  };
}

/**
 * Delete a file from R2
 */
export async function deleteFromR2(key: string): Promise<void> {
  const client = getR2Client();
  const bucket = getBucketName();

  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
}

/**
 * Delete a file from R2 by its public URL
 */
export async function deleteFromR2ByUrl(url: string): Promise<void> {
  const key = getKeyFromR2Url(url);
  if (key) {
    await deleteFromR2(key);
  }
}

/**
 * List objects in R2
 */
export async function listR2Objects(
  prefix?: string
): Promise<Array<{ key: string; size: number; url: string }>> {
  const client = getR2Client();
  const bucket = getBucketName();

  const response = await client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
    })
  );

  return (response.Contents || []).map((obj) => ({
    key: obj.Key!,
    size: obj.Size || 0,
    url: getR2PublicUrl(obj.Key!),
  }));
}

// ============ Multipart Upload Support ============

/**
 * Initialize a multipart upload
 */
export async function createMultipartUpload(
  key: string,
  contentType: string
): Promise<{ uploadId: string; key: string }> {
  const client = getR2Client();
  const bucket = getBucketName();

  const response = await client.send(
    new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    })
  );

  if (!response.UploadId) {
    throw new Error("Failed to create multipart upload");
  }

  return {
    uploadId: response.UploadId,
    key,
  };
}

/**
 * Upload a part of a multipart upload
 */
export async function uploadPart(
  key: string,
  uploadId: string,
  partNumber: number,
  body: Buffer
): Promise<{ etag: string; partNumber: number }> {
  const client = getR2Client();
  const bucket = getBucketName();

  const response = await client.send(
    new UploadPartCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
      Body: body,
    })
  );

  if (!response.ETag) {
    throw new Error(`Failed to upload part ${partNumber}`);
  }

  return {
    etag: response.ETag,
    partNumber,
  };
}

/**
 * Complete a multipart upload
 */
export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: Array<{ etag: string; partNumber: number }>
): Promise<{ url: string }> {
  const client = getR2Client();
  const bucket = getBucketName();

  await client.send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts.map((p) => ({
          ETag: p.etag,
          PartNumber: p.partNumber,
        })),
      },
    })
  );

  return {
    url: getR2PublicUrl(key),
  };
}

/**
 * Abort a multipart upload
 */
export async function abortMultipartUpload(key: string, uploadId: string): Promise<void> {
  const client = getR2Client();
  const bucket = getBucketName();

  await client.send(
    new AbortMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
    })
  );
}
