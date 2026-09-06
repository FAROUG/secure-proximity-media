import { query } from "../db.js";

export interface Media {
  id: string;
  owner_id: string;
  filename: string;
  storage_key: string | null;
  media_type: string;
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