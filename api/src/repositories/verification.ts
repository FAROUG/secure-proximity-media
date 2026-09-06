import crypto from "crypto";

import { query } from "../db.js";


/*
 * --------------------------------------------------
 * CONFIGURATION
 * --------------------------------------------------
 */

const CODE_EXPIRY_MINUTES = 10;

const MAX_ATTEMPTS = 5;


/*
 * --------------------------------------------------
 * GENERATE VERIFICATION CODE
 * --------------------------------------------------
 *
 * Generates a cryptographically secure
 * six-digit verification code.
 */
function generateCode(): string {

  const number =
    crypto.randomInt(
      100000,
      1000000
    );

  return number.toString();
}


/*
 * --------------------------------------------------
 * HASH VERIFICATION CODE
 * --------------------------------------------------
 *
 * We never store the actual verification
 * code in PostgreSQL.
 */
function hashCode(
  code: string
): string {

  return crypto
    .createHash("sha256")
    .update(code)
    .digest("hex");
}


/*
 * --------------------------------------------------
 * CREATE VERIFICATION CODE
 * --------------------------------------------------
 */
export async function createVerificationCode(
  shareId: string,
  userId: string
) {

  /*
   * Generate code.
   */
  const code =
    generateCode();


  /*
   * Hash code before storing it.
   */
  const codeHash =
    hashCode(code);


  /*
   * Verification code expires
   * after 10 minutes.
   */
  const expiresAt =
    new Date(
      Date.now() +
      CODE_EXPIRY_MINUTES *
      60 *
      1000
    );


  /*
   * Invalidate any previous
   * unused verification codes
   * for this share/user.
   */
  await query(
    `
    UPDATE email_verification_codes
    SET verified_at = NOW()
    WHERE
      share_id = $1
      AND user_id = $2
      AND verified_at IS NULL
      AND expires_at > NOW()
    `,
    [
      shareId,
      userId
    ]
  );


  /*
   * Create new verification record.
   *
   * PostgreSQL uuid generation is not
   * assumed, so generate the ID here.
   */
  const id =
    crypto.randomUUID();


  await query(
    `
    INSERT INTO email_verification_codes (
      id,
      share_id,
      user_id,
      code_hash,
      expires_at,
      attempts
    )
    VALUES (
      $1,
      $2,
      $3,
      $4,
      $5,
      0
    )
    `,
    [
      id,
      shareId,
      userId,
      codeHash,
      expiresAt
    ]
  );


  /*
   * IMPORTANT:
   *
   * This is intentionally returned
   * during local development so we can
   * see the code in the API terminal.
   *
   * In production this code will be
   * sent through Amazon SES instead.
   */
  return {
    code,
    expiresAt
  };
}


/*
 * --------------------------------------------------
 * VERIFY CODE
 * --------------------------------------------------
 */
export async function verifyCode(
  shareId: string,
  userId: string,
  code: string
) {

  /*
   * Get the most recent verification
   * record for this share/user.
   */
  const result =
    await query<{
      id: string;
      code_hash: string;
      expires_at: Date;
      attempts: number;
      verified_at: Date | null;
    }>(
      `
      SELECT
        id,
        code_hash,
        expires_at,
        attempts,
        verified_at
      FROM email_verification_codes
      WHERE
        share_id = $1
        AND user_id = $2
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [
        shareId,
        userId
      ]
    );


  const record =
    result.rows[0];


  /*
   * No verification code exists.
   */
  if (!record) {

    return {
      verified: false,
      reason:
        "Verification code not found"
    };
  }


  /*
   * Already verified.
   */
  if (record.verified_at) {

    return {
      verified: false,
      reason:
        "Verification code has already been used"
    };
  }


  /*
   * Expired.
   */
  if (
    new Date(record.expires_at)
      .getTime()
      <= Date.now()
  ) {

    return {
      verified: false,
      reason:
        "Verification code has expired"
    };
  }


  /*
   * Too many attempts.
   */
  if (
    record.attempts >= MAX_ATTEMPTS
  ) {

    return {
      verified: false,
      reason:
        "Too many verification attempts"
    };
  }


  /*
   * Increment attempt counter
   * before checking the code.
   *
   * This means incorrect attempts
   * are always counted.
   */
  await query(
    `
    UPDATE email_verification_codes
    SET attempts = attempts + 1
    WHERE id = $1
    `,
    [
      record.id
    ]
  );


  /*
   * Hash the submitted code.
   */
  const submittedHash =
    hashCode(code);


  /*
   * Compare hashes.
   */
  if (
    submittedHash !==
    record.code_hash
  ) {

    return {
      verified: false,
      reason:
        "Invalid verification code"
    };
  }


  /*
   * Code is valid.
   */
  await query(
    `
    UPDATE email_verification_codes
    SET verified_at = NOW()
    WHERE id = $1
    `,
    [
      record.id
    ]
  );


  return {
    verified: true,
    reason:
      "Email successfully verified"
  };
}