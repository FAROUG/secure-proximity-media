import type {
  Request
} from "express";

import {
  getOwnerSession
} from "./repositories/sessions.js";

export async function getAuthenticatedOwner(
  req: Request
) {
  const sessionId =
    req.header("x-owner-session-id");

  if (!sessionId) {
    return null;
  }

  return getOwnerSession(sessionId);
}