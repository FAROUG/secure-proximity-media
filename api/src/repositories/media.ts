import { query } from "../db.js";

export type MediaProcessingStatus =
  | "PENDING_UPLOAD"
  | "UPLOADED"
  | "PROCESSING"
  | "READY"
  | "FAILED";

export interface Media {
  id: string;
  owner_id: string;
  filename: string;
  storage_key: string | null;
  original_storage_key: string | null;
  media_type: string;
  processing_status: MediaProcessingStatus;
  processing_error: string | null;
  created_at: Date;
  processing_claim_id: string | null;
  processing_lease_expires_at: Date | null;
}

export async function createMedia(
  id: string,
  ownerId: string,
  filename: string,
  storageKey: string | null,
  mediaType: string
) {
  const result = await query<Media>(
    `
    INSERT INTO media (
      id,
      owner_id,
      filename,
      storage_key,
      media_type
    )
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
    `,
    [
      id,
      ownerId,
      filename,
      storageKey,
      mediaType
    ]
  );

  return result.rows[0];
}

export async function createPendingMediaUpload(
  id: string,
  ownerId: string,
  filename: string,
  originalStorageKey: string,
  mediaType: string
): Promise<Media> {
  const result = await query<Media>(
    `
    INSERT INTO media (
      id,
      owner_id,
      filename,
      storage_key,
      original_storage_key,
      media_type,
      processing_status
    )
    VALUES (
      $1,
      $2,
      $3,
      NULL,
      $4,
      $5,
      'PENDING_UPLOAD'
    )
    RETURNING *
    `,
    [
      id,
      ownerId,
      filename,
      originalStorageKey,
      mediaType
    ]
  );

  return result.rows[0];
}

export async function markMediaUploaded(
  mediaId: string,
  ownerId: string
): Promise<Media | null> {
  const result = await query<Media>(
    `
    UPDATE media
    SET processing_status = 'UPLOADED'
    WHERE id = $1
      AND owner_id = $2
      AND processing_status = 'PENDING_UPLOAD'
    RETURNING *
    `,
    [mediaId, ownerId]
  );

  return result.rows[0] ?? null;
}

export async function getMediaById(
  id: string
) {
  const result = await query<Media>(
    `
    SELECT *
    FROM media
    WHERE id = $1
    `,
    [id]
  );

  return result.rows[0] ?? null;
}
export interface ShareMedia {
  media_id: string;
  owner_id: string;
  filename: string;
  storage_key: string | null;
  media_type: string;
  processing_status: MediaProcessingStatus;
}

export async function getShareMedia(
  shareId: string
): Promise<ShareMedia | null> {
  const result =
    await query<ShareMedia>(
      `
      SELECT
        m.id AS media_id,
        m.owner_id,
        m.filename,
        m.storage_key,
        m.media_type,
        m.processing_status
      FROM shares s
      INNER JOIN media m
        ON m.id = s.media_id
      WHERE
        s.id = $1
        AND s.status = 'ACTIVE'
      LIMIT 1
      `,
      [
        shareId
      ]
    );

  return result.rows[0] ?? null;
}

const PROCESSING_LEASE_SECONDS = 300;

export async function claimMediaForProcessing(
  mediaId: string,
  claimId: string
): Promise<Media | null> {
  const result = await query<Media>(
    `
      UPDATE media
      SET
        processing_status = 'PROCESSING',
        processing_error = NULL,
        processing_claim_id = $2,
        processing_lease_expires_at =
          NOW() + ($3 * INTERVAL '1 second')
      WHERE id = $1
        AND original_storage_key IS NOT NULL
        AND (
          processing_status = 'UPLOADED'
          OR (
            processing_status = 'PROCESSING'
            AND processing_lease_expires_at < NOW()
          )
        )
      RETURNING *
    `,
    [mediaId, claimId, PROCESSING_LEASE_SECONDS]
  );

  return result.rows[0] ?? null;
}

export async function renewMediaProcessingLease(
  mediaId: string,
  claimId: string
): Promise<boolean> {
  const result = await query<Media>(
    `
      UPDATE media
      SET processing_lease_expires_at =
        NOW() + ($3 * INTERVAL '1 second')
      WHERE id = $1
        AND processing_claim_id = $2
        AND processing_status = 'PROCESSING'
        AND processing_lease_expires_at > NOW()
      RETURNING id
    `,
    [mediaId, claimId, PROCESSING_LEASE_SECONDS]
  );

  return result.rows.length === 1;
}

export async function releaseMediaProcessingClaim(
  mediaId: string,
  claimId: string
): Promise<boolean> {
  const result = await query<Media>(
    `
      UPDATE media
      SET
        processing_status = 'UPLOADED',
        processing_error = NULL,
        processing_claim_id = NULL,
        processing_lease_expires_at = NULL
      WHERE id = $1
        AND processing_claim_id = $2
        AND processing_status = 'PROCESSING'
        AND processing_lease_expires_at > NOW()
      RETURNING id
    `,
    [mediaId, claimId]
  );

  return result.rows.length === 1;
}

export async function markMediaReady(
  mediaId: string,
  claimId: string,
  hlsManifestKey: string
): Promise<Media | null> {
  const result = await query<Media>(
    `
      UPDATE media
      SET
        storage_key = $3,
        processing_status = 'READY',
        processing_error = NULL,
        processing_claim_id = NULL,
        processing_lease_expires_at = NULL
      WHERE id = $1
        AND processing_claim_id = $2
        AND processing_status = 'PROCESSING'
        AND processing_lease_expires_at > NOW()
      RETURNING *
    `,
    [mediaId, claimId, hlsManifestKey]
  );

  return result.rows[0] ?? null;
}

export async function markMediaProcessingFailed(
  mediaId: string,
  claimId: string,
  errorMessage: string
): Promise<Media | null> {
  const result = await query<Media>(
    `
      UPDATE media
      SET
        processing_status = 'FAILED',
        processing_error = $3,
        processing_claim_id = NULL,
        processing_lease_expires_at = NULL
      WHERE id = $1
        AND processing_claim_id = $2
        AND processing_status = 'PROCESSING'
        AND processing_lease_expires_at > NOW()
      RETURNING *
    `,
    [mediaId, claimId, errorMessage]
  );

  return result.rows[0] ?? null;
}

export async function getNextUploadedMedia(): Promise<Media | null> {
  const result = await query<Media>(
    `
      SELECT *
      FROM media
      WHERE original_storage_key IS NOT NULL
        AND (
          processing_status = 'UPLOADED'
          OR (
            processing_status = 'PROCESSING'
            AND processing_lease_expires_at < NOW()
          )
        )
      ORDER BY created_at ASC, id ASC
      LIMIT 1
    `
  );

  return result.rows[0] ?? null;
}
