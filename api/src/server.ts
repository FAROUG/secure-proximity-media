import "dotenv/config";

import express from "express";
import cors from "cors";
import https from "https";
import fs from "fs";

import {
  query
} from "./db.js";

import {
  getRecipientAccess
} from "./repositories/shares.js";

import {
  connectRedis,
  setPresence,
  getPresence
} from "./repositories/presence.js";

import {
  authorize
} from "./authorization.js";

import {
  createVerificationCode,
  verifyCode
} from "./repositories/verification.js";

import {
  createSession
} from "./repositories/sessions.js";

import {
  getVerifiedUser
} from "./authentication.js";

const app = express();

app.use(
  cors()
);

app.use(
  express.json()
);

/*
 * Health check
 */
app.get(
  "/health",
  async (_req, res) => {
    return res.json({
      status: "ok"
    });
  }
);
/*
 * --------------------------------------------------
 * EMAIL VERIFICATION - REQUEST CODE
 * --------------------------------------------------
 */
app.post(
  "/share/:shareId/verify/request",
  async (req, res) => {
    try {
      const {
        shareId
      } = req.params;

      const {
        email
      } = req.body;

      if (
        typeof email !== "string" ||
        !email.trim()
      ) {
        return res.status(400).json({
          error:
            "Email is required"
        });
      }

      const normalizedEmail =
        email
          .trim()
          .toLowerCase();

      const result =
        await query<{
          user_id: string;
          email: string;
        }>(
          `
          SELECT
            u.id AS user_id,
            u.email
          FROM users u
          INNER JOIN share_recipients sr
            ON sr.user_id = u.id
          WHERE
            sr.share_id = $1
            AND sr.status = 'ACTIVE'
            AND LOWER(u.email) = $2
          LIMIT 1
          `,
          [
            shareId,
            normalizedEmail
          ]
        );

      const recipient =
        result.rows[0];

      /*
       * Do not reveal whether an email
       * is registered for the share.
       */
      if (!recipient) {
        return res.status(200).json({
          success: true,
          message:
            "If this email is authorized, a verification code has been sent."
        });
      }

      const verification =
        await createVerificationCode(
          shareId,
          recipient.user_id
        );

      /*
       * LOCAL DEVELOPMENT ONLY
       *
       * Production will send this
       * through Amazon SES.
       */
      console.log(
        "========================================"
      );

      console.log(
        "EMAIL VERIFICATION CODE"
      );

      console.log(
        `Share ID: ${shareId}`
      );

      console.log(
        `Email: ${recipient.email}`
      );

      console.log(
        `Code: ${verification.code}`
      );

      console.log(
        `Expires: ${verification.expiresAt.toISOString()}`
      );

      console.log(
        "========================================"
      );

      return res.status(200).json({
        success: true,
        message:
          "If this email is authorized, a verification code has been sent."
      });

    } catch (error) {
      console.error(
        "Verification request error:",
        error
      );

      return res.status(500).json({
        error:
          "Failed to request verification code"
      });
    }
  }
);
/*
 * --------------------------------------------------
 * EMAIL VERIFICATION - CONFIRM CODE
 * --------------------------------------------------
 */
app.post(
  "/share/:shareId/verify/confirm",
  async (req, res) => {

    try {

      const {
        shareId
      } = req.params;

      const {
        email,
        code
      } = req.body;


      /*
       * --------------------------------------------------
       * VALIDATE REQUEST
       * --------------------------------------------------
       */

      if (
        typeof email !== "string" ||
        !email.trim()
      ) {

        return res.status(400).json({
          error:
            "Email is required"
        });
      }


      if (
        typeof code !== "string" ||
        !/^\d{6}$/.test(code)
      ) {

        return res.status(400).json({
          error:
            "A valid 6-digit verification code is required"
        });
      }


      const normalizedEmail =
        email
          .trim()
          .toLowerCase();


      /*
       * --------------------------------------------------
       * FIND AUTHORIZED RECIPIENT
       * --------------------------------------------------
       *
       * We deliberately verify that:
       *
       * 1. The user exists.
       * 2. The user is an ACTIVE recipient
       *    of THIS share.
       *
       * A valid code for another share
       * cannot be used here.
       */
      const userResult =
        await query<{
          user_id: string;
        }>(
          `
          SELECT
            u.id AS user_id
          FROM users u
          INNER JOIN share_recipients sr
            ON sr.user_id = u.id
          WHERE
            sr.share_id = $1
            AND sr.status = 'ACTIVE'
            AND LOWER(u.email) = $2
          LIMIT 1
          `,
          [
            shareId,
            normalizedEmail
          ]
        );


      const recipient =
        userResult.rows[0];


      /*
       * Do not reveal whether the email
       * is authorized.
       */
      if (!recipient) {

        return res.status(403).json({
          verified: false,
          error:
            "Verification failed"
        });
      }


      /*
       * --------------------------------------------------
       * VERIFY THE CODE
       * --------------------------------------------------
       */

      const verification =
        await verifyCode(
          shareId,
          recipient.user_id,
          code
        );


      if (!verification.verified) {

        return res.status(403).json({
          verified: false,
          reason:
            verification.reason
        });
      }


      /*
       * --------------------------------------------------
       * CREATE VERIFIED SESSION
       * --------------------------------------------------
       */

      const session =
        await createSession(
          recipient.user_id,
          shareId
        );


      /*
       * --------------------------------------------------
       * SUCCESS
       * --------------------------------------------------
       *
       * The frontend will temporarily
       * store this token during the MVP.
       *
       * Later we will move this to
       * a Secure + HttpOnly cookie.
       */
      return res.status(200).json({

        verified: true,

        sessionId:
          session.sessionId,

        expiresIn:
          session.expiresIn

      });

    } catch (error) {

      console.error(
        "Verification confirmation error:",
        error
      );

      return res.status(500).json({
        verified: false,
        error:
          "Verification failed"
      });

    }
  }
);
/*
 * --------------------------------------------------
 * PRESENCE
 * --------------------------------------------------
 *
 * Stores the VERIFIED user's current
 * location in Redis.
 *
 * The browser no longer sends userId.
 *
 * Identity comes from:
 *
 * x-session-id
 *       ↓
 * Redis session
 *       ↓
 * verified userId
 */
app.post(
  "/shares/:shareId/presence",
  async (req, res) => {

    try {

      const {
        shareId
      } = req.params;

      /*
       * --------------------------------------------------
       * AUTHENTICATE VERIFIED SESSION
       * --------------------------------------------------
       */

      const session =
        await getVerifiedUser(
          req,
          shareId
        );


      if (!session) {

        return res.status(401).json({
          error:
            "Valid verification session is required"
        });
      }


      /*
       * --------------------------------------------------
       * LOCATION DATA
       * --------------------------------------------------
       */

      const {
        latitude,
        longitude,
        accuracy
      } = req.body;


      /*
       * Validate coordinates.
       */
      if (
        typeof latitude !== "number" ||
        typeof longitude !== "number" ||
        typeof accuracy !== "number"
      ) {

        return res.status(400).json({
          error:
            "Invalid location"
        });
      }


      /*
       * Latitude validation.
       */
      if (
        latitude < -90 ||
        latitude > 90
      ) {

        return res.status(400).json({
          error:
            "Invalid latitude"
        });
      }


      /*
       * Longitude validation.
       */
      if (
        longitude < -180 ||
        longitude > 180
      ) {

        return res.status(400).json({
          error:
            "Invalid longitude"
        });
      }


      /*
       * Accuracy validation.
       */
      if (
        accuracy < 0
      ) {

        return res.status(400).json({
          error:
            "Invalid accuracy"
        });
      }


      /*
       * Store presence using the
       * VERIFIED user identity.
       */
      await setPresence(
        session.userId,
        shareId,
        {
          latitude,
          longitude,
          accuracy,
          timestamp: Date.now()
        },
        120
      );


      return res.json({
        success: true,
        expiresIn: 120
      });

    } catch (error) {

      console.error(
        "Presence error:",
        error
      );

      return res.status(500).json({
        error:
          "Failed to update presence"
      });

    }
  }
);


/*
 * --------------------------------------------------
 * SHARE ACCESS
 * --------------------------------------------------
 */
app.post(
  "/share/:shareId/access",
  async (req, res) => {

    try {

      const {
        shareId
      } = req.params;
      /*
      * Get verified identity from session.
      */
      const session =
        await getVerifiedUser(
          req,
          shareId
        );


      if (!session) {

        return res.status(401).json({
          allowed: false,
          reason:
            "Valid verification session is required"
        });
      }

    const userId =
      session.userId;

      /*
       * Find recipient policy in PostgreSQL.
       */
      const recipient =
        await getRecipientAccess(
          shareId,
          userId
        );

      if (!recipient) {

        return res.status(403).json({
          allowed: false,
          reason:
            "User is not authorized for this share"
        });
      }


      /*
       * --------------------------------------------------
       * UNRESTRICTED ACCESS
       * --------------------------------------------------
       *
       * This is important.
       *
       * Person A can ALWAYS access the media.
       *
       * We do not look at Person B's location.
       * We do not look at Redis.
       * We do not perform a proximity check.
       */
      if (
        recipient.access_type ===
        "UNRESTRICTED"
      ) {

        return res.json({
          allowed: true,
          reason:
            "Unrestricted access"
        });
      }


      /*
       * --------------------------------------------------
       * PROXIMITY ACCESS
       * --------------------------------------------------
       */

      /*
       * Get viewer's current location.
       */
      const viewer =
        await getPresence(
          userId,
          shareId
        );

      if (!viewer) {

        return res.status(403).json({
          allowed: false,
          reason:
            "Viewer presence expired or unavailable"
        });
      }


      /*
       * Proximity policy requires
       * a reference user.
       */
      if (
        !recipient.reference_user_id
      ) {

        return res.status(500).json({
          allowed: false,
          reason:
            "Proximity policy has no reference user"
        });
      }


      /*
       * Get reference person's
       * current location.
       */
      const reference =
        await getPresence(
          recipient.reference_user_id,
          shareId
        );

      if (!reference) {

        return res.status(403).json({
          allowed: false,
          reason:
            "Reference person's presence expired or unavailable"
        });
      }


      /*
       * Build authorization policy
       * from PostgreSQL.
       */
      const policy = {

        accessType:
          recipient.access_type,

        maxDistanceMeters:
          recipient.max_distance_meters
          ?? 500,

        maxLocationAgeSeconds:
          recipient.max_location_age_seconds
          // ?? 30,
          ?? 120,

        maxAccuracyMeters:
          100
      };


      /*
       * Perform the actual authorization.
       */
      const result =
        authorize(
          policy,
          viewer,
          reference
        );


      /*
       * Denied.
       */
      if (!result.allowed) {

        return res.status(403).json(
          result
        );
      }


      /*
       * Allowed.
       */
      return res.json(
        result
      );

    } catch (error) {

      console.error(
        "Access authorization error:",
        error
      );

      return res.status(500).json({
        allowed: false,
        reason:
          "Authorization failed"
      });
    }
  }
);


/*
 * --------------------------------------------------
 * SERVER START
 * --------------------------------------------------
 */
async function start() {

  /*
   * Connect to Redis before
   * accepting requests.
   */
  await connectRedis();

  const httpsOptions = {
    key: fs.readFileSync("../web/certs/localhost-key.pem"),
    cert: fs.readFileSync("../web/certs/localhost.pem"),
  };

  https.createServer(
    httpsOptions,
    app
  ).listen(
    4000,
  "0.0.0.0",
    () => {

      console.log(
        "Secure Media API running on https://0.0.0.0:4000"
      );

    }
  );
}

start().catch(
  (error) => {

    console.error(
      "Failed to start API:",
      error
    );

    process.exit(1);
  }
);