import "dotenv/config";

import express from "express";
import cors from "cors";

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
 * PRESENCE
 * --------------------------------------------------
 *
 * Stores a user's current location in Redis.
 *
 * IMPORTANT:
 * This endpoint currently accepts userId
 * directly from the request.
 *
 * This is ONLY for our MVP testing.
 *
 * Step 4 will replace this with Cognito
 * authentication so the backend determines
 * the user identity from a verified token.
 */
app.post(
  "/shares/:shareId/presence/:userId",
  async (req, res) => {

    try {

      const {
        shareId,
        userId
      } = req.params;

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
          error: "Invalid location"
        });
      }

      /*
       * Basic coordinate validation.
       */
      if (
        latitude < -90 ||
        latitude > 90
      ) {
        return res.status(400).json({
          error: "Invalid latitude"
        });
      }

      if (
        longitude < -180 ||
        longitude > 180
      ) {
        return res.status(400).json({
          error: "Invalid longitude"
        });
      }

      if (accuracy < 0) {
        return res.status(400).json({
          error: "Invalid accuracy"
        });
      }

      /*
       * Store location in Redis.
       *
       * TTL = 30 seconds.
       */
      await setPresence(
        userId,
        shareId,
        {
          latitude,
          longitude,
          accuracy,
          timestamp: Date.now()
        },
        // 30
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

      const {
        userId
      } = req.body;

      /*
       * Validate user ID.
       *
       * NOTE:
       * This will be replaced by Cognito
       * in Step 4.
       */
      if (!userId) {
        return res.status(400).json({
          error:
            "userId is required"
        });
      }

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

  app.listen(
    4000,
  "0.0.0.0",
    () => {

      console.log(
        "Secure Media API running on http://0.0.0.0:4000"
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