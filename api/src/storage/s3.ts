import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";

import {
  getSignedUrl
} from "@aws-sdk/s3-request-presigner";

import { createWriteStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { pipeline } from "node:stream/promises";


const s3 =
  new S3Client({
    region:
      process.env.AWS_REGION ??
      "ap-southeast-2"
  });


const MEDIA_BUCKET =
  process.env.MEDIA_BUCKET_NAME;


export async function createMediaSignedUrl(
  storageKey: string
) {
  if (!MEDIA_BUCKET) {
    throw new Error(
      "MEDIA_BUCKET_NAME is not configured"
    );
  }

  const command =
    new GetObjectCommand({
      Bucket:
        MEDIA_BUCKET,
      Key:
        storageKey
    });

  return getSignedUrl(
    s3,
    command,
    {
      expiresIn: 60
    }
  );
}


export async function createMediaUploadUrl(
  storageKey: string,
  contentType: string
): Promise<string> {
  if (!MEDIA_BUCKET) {
    throw new Error(
      "MEDIA_BUCKET_NAME is not configured"
    );
  }

  const command = new PutObjectCommand({
    Bucket: MEDIA_BUCKET,
    Key: storageKey,
    ContentType: contentType
  });

  return getSignedUrl(s3, command, {
    expiresIn: 300
  });
}

export async function getUploadedMediaMetadata(
  storageKey: string
) {
  if (!MEDIA_BUCKET) {
    throw new Error(
      "MEDIA_BUCKET_NAME is not configured"
    );
  }

  const response = await s3.send(
    new HeadObjectCommand({
      Bucket: MEDIA_BUCKET,
      Key: storageKey
    })
  );

  return {
    contentType: response.ContentType ?? null,
    contentLength: response.ContentLength ?? null
  };
}

export async function downloadMediaObject(
  storageKey: string,
  destinationPath: string,
  signal?: AbortSignal
): Promise<void> {
  if (!MEDIA_BUCKET) {
    throw new Error("MEDIA_BUCKET_NAME is not configured");
  }

  signal?.throwIfAborted();

  const response = await s3.send(
    new GetObjectCommand({
      Bucket: MEDIA_BUCKET,
      Key: storageKey
    }),
    { abortSignal: signal }
  );

  if (!response.Body) {
    throw new Error(`S3 object has no body: ${storageKey}`);
  }

  await pipeline(
    response.Body as NodeJS.ReadableStream,
    createWriteStream(destinationPath),
    { signal }
  );
}

export async function uploadMediaObject(
  storageKey: string,
  sourcePath: string,
  contentType: string,
  signal?: AbortSignal
): Promise<void> {
  if (!MEDIA_BUCKET) {
    throw new Error("MEDIA_BUCKET_NAME is not configured");
  }

  signal?.throwIfAborted();

  const body = await readFile(sourcePath, { signal });

  signal?.throwIfAborted();

  await s3.send(
    new PutObjectCommand({
      Bucket: MEDIA_BUCKET,
      Key: storageKey,
      Body: body,
      ContentType: contentType
    }),
    { abortSignal: signal }
  );
}