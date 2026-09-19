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
/*
 * --------------------------------------------------
 * OWNER SESSION
 * --------------------------------------------------
 *
 * Separate from share-recipient sessions.
 */

export interface OwnerSession {
  userId: string;
  role: "OWNER";
  createdAt: number;
}

function ownerSessionKey(
  sessionId: string
): string {
  return `owner-session:${sessionId}`;
}

export async function createOwnerSession(
  userId: string
) {
  const sessionId = crypto
    .randomBytes(32)
    .toString("hex");

  const session: OwnerSession = {
    userId,
    role: "OWNER",
    createdAt: Date.now()
  };

  await redis.set(
    ownerSessionKey(sessionId),
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

export async function getOwnerSession(
  sessionId: string
): Promise<OwnerSession | null> {
  const value = await redis.get(
    ownerSessionKey(sessionId)
  );

  if (!value) {
    return null;
  }

  const session = JSON.parse(value) as OwnerSession;

  if (
    session.role !== "OWNER" ||
    typeof session.userId !== "string"
  ) {
    return null;
  }

  return session;
}

export async function deleteOwnerSession(
  sessionId: string
) {
  await redis.del(
    ownerSessionKey(sessionId)
  );
}