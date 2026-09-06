import { query } from "../db.js";

export interface ShareRecipient {
  id: string;
  share_id: string;
  user_id: string;
  access_type: "UNRESTRICTED" | "PROXIMITY";
  reference_user_id: string | null;
  max_distance_meters: number | null;
  max_location_age_seconds: number | null;
  status: string;
}

export async function createShare(
  id: string,
  mediaId: string,
  ownerId: string
) {
  const result = await query(
    `
    INSERT INTO shares (
      id,
      media_id,
      owner_id
    )
    VALUES ($1, $2, $3)
    RETURNING *
    `,
    [
      id,
      mediaId,
      ownerId
    ]
  );

  return result.rows[0];
}

export async function addRecipient(
  id: string,
  shareId: string,
  userId: string,
  accessType: "UNRESTRICTED" | "PROXIMITY",
  referenceUserId: string | null,
  maxDistanceMeters: number | null
) {
  const result = await query(
    `
    INSERT INTO share_recipients (
      id,
      share_id,
      user_id,
      access_type,
      reference_user_id,
      max_distance_meters
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
    `,
    [
      id,
      shareId,
      userId,
      accessType,
      referenceUserId,
      maxDistanceMeters
    ]
  );

  return result.rows[0];
}

export async function getRecipientAccess(
  shareId: string,
  userId: string
) {
  const result =
    await query<ShareRecipient>(
      `
      SELECT *
      FROM share_recipients
      WHERE
        share_id = $1
        AND user_id = $2
        AND status = 'ACTIVE'
      `,
      [
        shareId,
        userId
      ]
    );

  return result.rows[0] ?? null;
}