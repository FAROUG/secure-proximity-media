import crypto from "crypto";

import { redis } from "./presence.js";


/*
 * --------------------------------------------------
 * SESSION CONFIGURATION
 * --------------------------------------------------
 */

const SESSION_TTL_SECONDS = 3600;


/*
 * --------------------------------------------------
 * SESSION DATA
 * --------------------------------------------------
 */

export interface VerifiedSession {
  userId: string;
  shareId: string;
  createdAt: number;
}


/*
 * --------------------------------------------------
 * REDIS KEY
 * --------------------------------------------------
 */

function sessionKey(
  sessionId: string
): string {
  return `session:${sessionId}`;
}


/*
 * --------------------------------------------------
 * CREATE SESSION
 * --------------------------------------------------
 */

export async function createSession(
  userId: string,
  shareId: string
) {

  /*
   * Generate a cryptographically
   * secure session token.
   */
  const sessionId =
    crypto
      .randomBytes(32)
      .toString("hex");


  const session: VerifiedSession = {
    userId,
    shareId,
    createdAt: Date.now()
  };


  /*
   * Store the verified identity
   * in Redis.
   */
  await redis.set(
    sessionKey(sessionId),
    JSON.stringify(session),
    {
      EX: SESSION_TTL_SECONDS
    }
  );

  return {
    sessionId,
    expiresIn: SESSION_TTL_SECONDS
  };
}


/*
 * --------------------------------------------------
 * GET SESSION
 * --------------------------------------------------
 */

export async function getSession(
  sessionId: string
): Promise<VerifiedSession | null> {
  const value =
    await redis.get(
      sessionKey(sessionId)
    );

  if (!value) {
    return null;
  }

  return JSON.parse(value);
}


/*
 * --------------------------------------------------
 * DELETE SESSION
 * --------------------------------------------------
 */

export async function deleteSession(
  sessionId: string
) {
  await redis.del(
    sessionKey(sessionId)
  );
}