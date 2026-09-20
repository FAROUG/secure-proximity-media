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
  createSignedHlsManifest
} from "./storage/hls.js";

import {
  createPendingMediaUpload,
  getMediaById,
  markMediaUploaded,
  getShareMedia
} from "./repositories/media.js";

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


import { createOwnerVerificationCode, verifyOwnerCode } from "./repositories/owner-verification.js";
import { createOwnerSession } from "./repositories/sessions.js";

import crypto from "crypto";
import { getAuthenticatedOwner } from "./owner-authentication.js";
import { createMediaUploadUrl, getUploadedMediaMetadata } from "./storage/s3.js";

const app = express();


app.use(
  cors()
);


app.use(
  express.json()
);


/*
 * --------------------------------------------------
 * HEALTH CHECK
 * --------------------------------------------------
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
 * OWNER LOGIN - REQUEST VERIFICATION CODE
 * --------------------------------------------------
 */
app.post(
  "/owner/verify/request",
  async (req, res) => {
    try {
      const { email } = req.body ?? {};

      if (
        typeof email !== "string" ||
        !email.trim()
      ) {
        return res.status(400).json({
          error: "Email is required"
        });
      }

      const normalizedEmail =
        email.trim().toLowerCase();

      const result = await query<{
        user_id: string;
        email: string;
      }>(
        `
        SELECT
          u.id AS user_id,
          u.email
        FROM users u
        WHERE LOWER(u.email) = $1
          AND (
            EXISTS (
              SELECT 1
              FROM media m
              WHERE m.owner_id = u.id
            )
            OR EXISTS (
              SELECT 1
              FROM shares s
              WHERE s.owner_id = u.id
            )
          )
        LIMIT 1
        `,
        [normalizedEmail]
      );

      const owner = result.rows[0];

      /*
       * Return the same response whether or not
       * the email belongs to an existing owner.
       */
      if (!owner) {
        return res.status(200).json({
          success: true,
          message:
            "If this email is authorized, a verification code has been sent."
        });
      }

      const verification =
        await createOwnerVerificationCode(
          owner.user_id
        );

      /*
       * LOCAL DEVELOPMENT ONLY.
       *
       * The code is printed to the API terminal.
       * This is not email delivery and must not
       * be enabled in a deployed environment.
       */
      if (process.env.NODE_ENV !== "development") {
        return res.status(503).json({
          error:
            "Owner email delivery is not configured"
        });
      }

      console.log(
        "========================================"
      );
      console.log("OWNER VERIFICATION CODE");
      console.log(`Email: ${owner.email}`);
      console.log(`Code: ${verification.code}`);
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
        "Owner verification request error:",
        error
      );

      return res.status(500).json({
        error: "Failed to request verification code"
      });
    }
  }
);


/*
 * --------------------------------------------------
 * OWNER LOGIN - CONFIRM VERIFICATION CODE
 * --------------------------------------------------
 */
app.post(
  "/owner/verify/confirm",
  async (req, res) => {
    try {
      const { email, code } = req.body ?? {};

      if (
        typeof email !== "string" ||
        !email.trim() ||
        typeof code !== "string" ||
        !/^\d{6}$/.test(code)
      ) {
        return res.status(400).json({
          error:
            "A valid email and 6-digit verification code are required"
        });
      }

      const normalizedEmail =
        email.trim().toLowerCase();

      const result = await query<{
        user_id: string;
      }>(
        `
        SELECT u.id AS user_id
        FROM users u
        WHERE LOWER(u.email) = $1
          AND (
            EXISTS (
              SELECT 1
              FROM media m
              WHERE m.owner_id = u.id
            )
            OR EXISTS (
              SELECT 1
              FROM shares s
              WHERE s.owner_id = u.id
            )
          )
        LIMIT 1
        `,
        [normalizedEmail]
      );

      const owner = result.rows[0];

      if (!owner) {
        return res.status(403).json({
          verified: false,
          error: "Verification failed"
        });
      }

      const verification =
        await verifyOwnerCode(
          owner.user_id,
          code
        );

      if (!verification.verified) {
        return res.status(403).json({
          verified: false,
          error: "Verification failed"
        });
      }

      const session =
        await createOwnerSession(
          owner.user_id
        );

      return res.status(200).json({
        verified: true,
        sessionId: session.sessionId,
        expiresIn: session.expiresIn
      });
    } catch (error) {
      console.error(
        "Owner verification confirmation error:",
        error
      );

      return res.status(500).json({
        verified: false,
        error: "Verification failed"
      });
    }
  }
);


/*
 * --------------------------------------------------
 * MEDIA UPLOAD - INITIALIZE
 * --------------------------------------------------
 */
app.post(
  "/media/uploads",
  async (req, res) => {
    try {
      /*
       * Identify the owner using the server-issued
       * owner session, not an ownerId in the request.
       */
      const owner = await getAuthenticatedOwner(req);

      if (!owner) {
        return res.status(401).json({
          error: "Owner authentication required"
        });
      }

      const { filename, contentType } = req.body ?? {};

      if (
        typeof filename !== "string" ||
        !filename.trim() ||
        filename.length > 500 ||
        typeof contentType !== "string" ||
        !["video/mp4", "video/quicktime"].includes(contentType)
      ) {
        return res.status(400).json({
          error:
            "A filename and supported video content type are required"
        });
      }

      const mediaId = crypto.randomUUID();

      /*
       * Generate the storage key on the server.
       * Never accept an arbitrary S3 key from the client.
       */
      const originalStorageKey =
        `media/${owner.userId}/${mediaId}/original`;

      const uploadUrl = await createMediaUploadUrl(
        originalStorageKey,
        contentType
      );

      await createPendingMediaUpload(
        mediaId,
        owner.userId,
        filename.trim(),
        originalStorageKey,
        contentType
      );

      return res.status(201).json({
        mediaId,
        uploadUrl,
        method: "PUT",
        headers: {
          "Content-Type": contentType
        },
        expiresIn: 300
      });
    } catch (error) {
      console.error(
        "Media upload initialization error:",
        error
      );

      return res.status(500).json({
        error: "Failed to initialize media upload"
      });
    }
  }
);


/*
 * --------------------------------------------------
 * MEDIA UPLOAD - COMPLETE
 * --------------------------------------------------
 */
app.post(
  "/media/uploads/:mediaId/complete",
  async (req, res) => {
    try {
      const owner = await getAuthenticatedOwner(req);

      if (!owner) {
        return res.status(401).json({
          error: "Owner authentication required"
        });
      }

      const { mediaId } = req.params;

      const media = await getMediaById(mediaId);

      if (!media || media.owner_id !== owner.userId) {
        return res.status(404).json({
          error: "Media not found"
        });
      }

      if (media.processing_status !== "PENDING_UPLOAD") {
        return res.status(409).json({
          error: "Media is not pending upload"
        });
      }

      if (!media.original_storage_key) {
        return res.status(409).json({
          error: "Original storage key is missing"
        });
      }

      /*
       * Confirm that the object actually exists in S3.
       */
      let metadata: Awaited<
        ReturnType<typeof getUploadedMediaMetadata>
      >;

      try {
        metadata = await getUploadedMediaMetadata(
          media.original_storage_key
        );
      } catch (error) {
        console.error(
          "Uploaded media S3 verification error:",
          error
        );

        return res.status(409).json({
          error: "Uploaded media could not be verified"
        });
      }

      if (
        metadata.contentType !== media.media_type ||
        !metadata.contentLength ||
        metadata.contentLength <= 0
      ) {
        return res.status(409).json({
          error: "Uploaded media metadata is invalid"
        });
      }

      /*
       * Update only the authenticated owner's media.
       */
      const updatedMedia = await markMediaUploaded(
        media.id,
        owner.userId
      );

      if (!updatedMedia) {
        return res.status(409).json({
          error: "Media upload status has changed"
        });
      }

      return res.status(200).json({
        mediaId: updatedMedia.id,
        processingStatus: updatedMedia.processing_status,
        sizeBytes: metadata.contentLength,
        contentType: metadata.contentType
      });
    } catch (error) {
      console.error(
        "Media upload completion error:",
        error
      );

      return res.status(500).json({
        error: "Failed to complete media upload"
      });
    }
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
       * VERIFY CODE
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
 * Stores the VERIFIED user's
 * current location in Redis.
 */
app.post(
  "/shares/:shareId/presence",
  async (req, res) => {

    try {

      const {
        shareId
      } = req.params;


      /*
       * Authenticate verified session.
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


      if (
        latitude < -90 ||
        latitude > 90
      ) {

        return res.status(400).json({
          error:
            "Invalid latitude"
        });

      }


      if (
        longitude < -180 ||
        longitude > 180
      ) {

        return res.status(400).json({
          error:
            "Invalid longitude"
        });

      }


      if (
        accuracy < 0
      ) {

        return res.status(400).json({
          error:
            "Invalid accuracy"
        });

      }


      /*
       * Store presence using
       * verified identity.
       */
      await setPresence(
        session.userId,
        shareId,
        {
          latitude,
          longitude,
          accuracy,
          timestamp:
            Date.now()
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
 *
 * This endpoint ONLY answers whether
 * the current verified user is allowed.
 *
 * It does not return media.
 */
app.post(
  "/share/:shareId/access",
  async (req, res) => {

    try {

      const {
        shareId
      } = req.params;


      /*
       * Get verified identity
       * from Redis session.
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
       * Find recipient policy.
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


      if (
        !recipient.reference_user_id
      ) {

        return res.status(500).json({
          allowed: false,
          reason:
            "Proximity policy has no reference user"
        });

      }


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


      const policy = {

        accessType:
          recipient.access_type,

        maxDistanceMeters:
          recipient.max_distance_meters
          ?? 500,

        maxLocationAgeSeconds:
          recipient.max_location_age_seconds
          ?? 120,

        maxAccuracyMeters:
          100

      };


      const result =
        authorize(
          policy,
          viewer,
          reference
        );


      if (!result.allowed) {

        return res.status(403).json(
          result
        );

      }


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
 * PROTECTED MEDIA
 * --------------------------------------------------
 *
 * This endpoint:
 *
 * 1. Verifies the session.
 * 2. Checks recipient policy.
 * 3. Performs proximity authorization if required.
 * 4. Confirms the share has valid media.
 * 5. Reads the private HLS manifest from S3.
 * 6. Rewrites HLS segment references with
 *    short-lived CloudFront signed URLs.
 * 7. Returns the protected HLS manifest.
 *
 * Uses the processed manifest stored on READY media.
 */
app.get(
  "/share/:shareId/media",
  async (req, res) => {

    try {

      const {
        shareId
      } = req.params;


      /*
       * --------------------------------------------------
       * VERIFY SESSION
       * --------------------------------------------------
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
       * --------------------------------------------------
       * GET RECIPIENT POLICY
       * --------------------------------------------------
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
       * FETCH SHARE MEDIA
       * --------------------------------------------------
       *
       * Validate that this share references valid media.
       */
      const media =
        await getShareMedia(
          shareId
        );


      if (!media) {

        return res.status(404).json({
          allowed: false,
          reason:
            "Media not found"
        });

      }

      if (
        media.processing_status !== "READY" ||
        !media.storage_key
      ) {
        return res.status(409).json({
          allowed: false,
          reason: "Media is not ready for playback"
        });
      }

      /*
       * --------------------------------------------------
       * UNRESTRICTED RECIPIENT
       * --------------------------------------------------
       */
      if (
        recipient.access_type ===
        "UNRESTRICTED"
      ) {

        const signedManifest =
          await createSignedHlsManifest(
            media.storage_key,
            600
          );


        /*
         * Do not cache an authorization-dependent
         * playlist in the browser or an intermediary.
         */
        res.setHeader(
          "Cache-Control",
          "private, no-store, max-age=0"
        );


        return res
          .status(200)
          .type(
            "application/vnd.apple.mpegurl"
          )
          .send(
            signedManifest
          );

      }


      /*
       * --------------------------------------------------
       * PROXIMITY RECIPIENT
       * --------------------------------------------------
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


      if (
        !recipient.reference_user_id
      ) {

        return res.status(500).json({
          allowed: false,
          reason:
            "Proximity policy has no reference user"
        });

      }


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


      const policy = {

        accessType:
          recipient.access_type,

        maxDistanceMeters:
          recipient.max_distance_meters
          ?? 500,

        maxLocationAgeSeconds:
          recipient.max_location_age_seconds
          ?? 120,

        maxAccuracyMeters:
          100

      };


      const authorizationResult =
        authorize(
          policy,
          viewer,
          reference
        );


      if (
        !authorizationResult.allowed
      ) {

        return res.status(403).json(
          authorizationResult
        );

      }


      /*
       * --------------------------------------------------
       * CREATE PROTECTED HLS MANIFEST
       * --------------------------------------------------
       *
       * Each .ts segment inside the returned manifest
       * receives a short-lived CloudFront signed URL.
       *
       * Uses the processed manifest for this media record.
       */
      const signedManifest =
        await createSignedHlsManifest(
          media.storage_key,
          90
        );


      res.setHeader(
        "Cache-Control",
        "private, no-store, max-age=0"
      );


      return res
        .status(200)
        .type(
          "application/vnd.apple.mpegurl"
        )
        .send(
          signedManifest
        );

    } catch (error) {

      console.error(
        "Protected media error:",
        error
      );


      return res.status(500).json({
        allowed: false,
        reason:
          "Failed to retrieve media"
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

    key:
      fs.readFileSync(
        "../web/certs/localhost-key.pem"
      ),

    cert:
      fs.readFileSync(
        "../web/certs/localhost.pem"
      )

  };


  https
    .createServer(
      httpsOptions,
      app
    )
    .listen(
      4000,
      "0.0.0.0",
      () => {

        console.log(
          "🔒 Secure Media API running on:"
        );

        console.log(
          "  - Local:   https://localhost:4000"
        );

        console.log(
          "  - Network: https://MacBook-Pro.local:4000"
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