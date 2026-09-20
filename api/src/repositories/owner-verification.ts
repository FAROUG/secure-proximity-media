import crypto from "crypto";

import { query } from "../db.js";

const CODE_EXPIRY_MINUTES = 10;
const MAX_ATTEMPTS = 5;

function generateCode(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

function hashCode(code: string): string {
  return crypto
    .createHash("sha256")
    .update(code)
    .digest("hex");
}

/*
 * Generate an owner verification code.
 *
 * The caller must first confirm that userId belongs
 * to an account authorized to manage media.
 */
export async function createOwnerVerificationCode(
  userId: string
) {
  const code = generateCode();
  const codeHash = hashCode(code);

  const expiresAt = new Date(
    Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000
  );

  await query(
    `
    UPDATE owner_email_verification_codes
    SET verified_at = NOW()
    WHERE user_id = $1
      AND verified_at IS NULL
      AND expires_at > NOW()
    `,
    [userId]
  );

  const id = crypto.randomUUID();

  await query(
    `
    INSERT INTO owner_email_verification_codes (
      id,
      user_id,
      code_hash,
      expires_at,
      attempts
    )
    VALUES ($1, $2, $3, $4, 0)
    `,
    [id, userId, codeHash, expiresAt]
  );

  return {
    code,
    expiresAt
  };
}

/*
 * Validate an owner verification code.
 *
 * A successful code can be used only once.
 */
export async function verifyOwnerCode(
  userId: string,
  code: string
) {
  if (!/^\d{6}$/.test(code)) {
    return {
      verified: false,
      reason: "Invalid verification code"
    };
  }

  const submittedHash = hashCode(code);

  /*
   * Atomically consume the code.
   *
   * PostgreSQL checks the attempt limit and code
   * validity in the UPDATE itself. This prevents
   * two simultaneous requests from successfully
   * using the same verification code.
   */
  const result = await query<{
    id: string;
    verified_at: Date | null;
  }>(
    `
    WITH latest AS (
      SELECT id
      FROM owner_email_verification_codes
      WHERE user_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    )
    UPDATE owner_email_verification_codes AS codes
    SET
      attempts = codes.attempts + 1,
      verified_at = CASE
        WHEN codes.code_hash = $2
        THEN NOW()
        ELSE codes.verified_at
      END
    FROM latest
    WHERE codes.id = latest.id
      AND codes.verified_at IS NULL
      AND codes.expires_at > NOW()
      AND codes.attempts < $3
    RETURNING
      codes.id,
      codes.verified_at
    `,
    [userId, submittedHash, MAX_ATTEMPTS]
  );

  const record = result.rows[0];

  if (!record || !record.verified_at) {
    return {
      verified: false,
      reason: "Invalid or expired verification code"
    };
  }

  return {
    verified: true,
    reason: "Email successfully verified"
  };
}