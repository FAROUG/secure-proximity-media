import crypto from "crypto";

import { redis } from "./presence.js";

const SESSION_TTL_SECONDS = 3600;

export interface VerifiedSession {
  userId: string;
  shareId: string;
  createdAt: number;
}

function sessionKey(
  sessionId: string
): string {
  return `session:${sessionId}`;
}

export async function createSession(
  userId: string,
  shareId: string
) {
  const sessionId =
    crypto.randomBytes(32).toString("hex");

  const session: VerifiedSession = {
    userId,
    shareId,
    createdAt: Date.now()
  };

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

export async function deleteSession(
  sessionId: string
) {
  await redis.del(
    sessionKey(sessionId)
  );
}