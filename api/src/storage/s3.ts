import {
  GetObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";

import {
  getSignedUrl
} from "@aws-sdk/s3-request-presigner";


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