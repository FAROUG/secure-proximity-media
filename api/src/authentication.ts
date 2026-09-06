import {
  getSession
} from "./repositories/sessions.js";


export async function getVerifiedUser(
  req: any,
  shareId: string
) {

  /*
   * MVP:
   *
   * The frontend sends the session token
   * using this HTTP header.
   */
  const sessionId =
    req.header(
      "x-session-id"
    );


  if (!sessionId) {

    return null;
  }


  /*
   * Get verified session from Redis.
   */
  const session =
    await getSession(
      sessionId
    );


  if (!session) {

    return null;
  }


  /*
   * IMPORTANT:
   *
   * A session generated for Share A
   * cannot be used for Share B.
   */
  if (
    session.shareId !== shareId
  ) {

    return null;
  }


  return session;
}