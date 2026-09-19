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
        m.media_type
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
