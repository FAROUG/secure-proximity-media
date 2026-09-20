
import "dotenv/config";

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  claimMediaForProcessing,
  getNextUploadedMedia,
  markMediaProcessingFailed,
  markMediaReady,
  releaseMediaProcessingClaim,
  renewMediaProcessingLease
} from "../repositories/media.js";

import {
  downloadMediaObject,
  getUploadedMediaMetadata,
  uploadMediaObject
} from "../storage/s3.js";

import { pool } from "../db.js";

const POLL_INTERVAL_MS = 5_000;
const LEASE_RENEW_INTERVAL_MS = 60_000;
let shutdownRequested = false;
let activeProcessingController: AbortController | null = null;

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function runFfmpeg(
  inputPath: string,
  outputDirectory: string,
  signal: AbortSignal
): Promise<void> {
  signal.throwIfAborted();

  const manifestPath = path.join(
    outputDirectory,
    "index.m3u8"
  );

  const segmentPattern = path.join(
    outputDirectory,
    "segment_%03d.ts"
  );

  await new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn(
      "ffmpeg",
      [
        "-hide_banner",
        "-nostdin",
        "-y",
        "-i",
        inputPath,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-f",
        "hls",
        "-hls_time",
        "4",
        "-hls_playlist_type",
        "vod",
        "-hls_segment_filename",
        segmentPattern,
        manifestPath
      ],
      {
        stdio: ["ignore", "ignore", "pipe"],
        signal
      }
    );

    let errorOutput = "";
    let spawnError: Error | undefined;

    ffmpeg.stderr.on("data", (chunk: Buffer) => {
      errorOutput += chunk.toString();

      if (errorOutput.length > 16_000) {
        errorOutput = errorOutput.slice(-16_000);
      }
    });

    ffmpeg.on("error", (error: Error) => {
      spawnError = error;
    });

    ffmpeg.on("close", (exitCode) => {
      if (spawnError) {
        reject(spawnError);
      } else if (signal.aborted) {
        reject(new Error("FFmpeg cancelled: processing lease lost"));
      } else if (exitCode === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `FFmpeg exited with code ${exitCode}: ${errorOutput}`
          )
        );
      }
    });
  });

  signal.throwIfAborted();
}

async function processMedia(mediaId: string): Promise<boolean> {
  const claimId = randomUUID();

  const media = await claimMediaForProcessing(
    mediaId,
    claimId
  );

  if (!media) {
    return false;
  }

  console.log("Claimed media:", {
    mediaId: media.id,
    claimId
  });

  const processingController = new AbortController();
  const signal = processingController.signal;

  activeProcessingController = processingController;

  if (shutdownRequested) {
    processingController.abort(
      new Error("Media processing cancelled: worker shutting down")
    );
  }

  let temporaryDirectory: string | undefined;
  let leaseError: Error | undefined;
  let renewalInProgress = false;
  let processingCompleted = false;

  /*
   * A failed renewal means this worker must stop.
   * Never allow overlapping renewal requests.
   */
  const renewalTimer = setInterval(() => {
    if (renewalInProgress || signal.aborted) {
      return;
    }

    renewalInProgress = true;

    void renewMediaProcessingLease(media.id, claimId)
      .then((renewed) => {
        if (!renewed) {
          throw new Error(
            `Processing lease lost for media ${media.id}`
          );
        }
      })
      .catch((error: unknown) => {
        leaseError = new Error(
          `Could not renew processing lease: ${errorMessage(error)}`
        );

        processingController.abort(leaseError);
      })
      .finally(() => {
        renewalInProgress = false;
      });
  }, LEASE_RENEW_INTERVAL_MS);

  function checkLease(): void {
    if (leaseError) {
      throw leaseError;
    }

    signal.throwIfAborted();
  }

  try {
    if (!media.original_storage_key) {
      throw new Error("Original storage key is missing");
    }

    checkLease();

    const metadata = await getUploadedMediaMetadata(
      media.original_storage_key
    );

    checkLease();

    if (
      !metadata.contentLength ||
      metadata.contentLength <= 0
    ) {
      throw new Error("Original media object is empty");
    }

    if (
      metadata.contentType !== "video/mp4" &&
      metadata.contentType !== "video/quicktime"
    ) {
      throw new Error(
        `Unsupported content type: ${metadata.contentType}`
      );
    }

    temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), "secure-media-")
    );

    const inputPath = path.join(
      temporaryDirectory,
      "original"
    );

    const outputDirectory = path.join(
      temporaryDirectory,
      "hls"
    );

    await mkdir(outputDirectory);

    checkLease();

    console.log("Downloading original media from S3");

    await downloadMediaObject(
      media.original_storage_key,
      inputPath,
      signal
    );

    checkLease();

    console.log("Generating HLS with FFmpeg");

    await runFfmpeg(
      inputPath,
      outputDirectory,
      signal
    );

    checkLease();

    const outputFiles = await readdir(outputDirectory);

    const segmentFiles = outputFiles
      .filter((filename) => /^segment_\d{3,}\.ts$/.test(filename))
      .sort();

    if (
      !outputFiles.includes("index.m3u8") ||
      segmentFiles.length === 0
    ) {
      throw new Error(
        "FFmpeg did not generate a manifest and segments"
      );
    }

    /*
     * Every claim writes to a different prefix.
     * An abandoned worker cannot overwrite the
     * replacement worker's HLS objects.
     */
    const hlsPrefix =
      `media/${media.owner_id}/${media.id}/hls/${claimId}`;

    for (const filename of segmentFiles) {
      checkLease();

      await uploadMediaObject(
        `${hlsPrefix}/${filename}`,
        path.join(outputDirectory, filename),
        "video/mp2t",
        signal
      );
    }

    checkLease();

    /*
     * Upload the manifest after all segments.
     * The database does not expose this manifest
     * to playback until markMediaReady succeeds.
     */
    const manifestKey = `${hlsPrefix}/index.m3u8`;

    await uploadMediaObject(
      manifestKey,
      path.join(outputDirectory, "index.m3u8"),
      "application/vnd.apple.mpegurl",
      signal
    );

    checkLease();

    const readyMedia = await markMediaReady(
      media.id,
      claimId,
      manifestKey
    );

    if (!readyMedia) {
      throw new Error(
        "Could not mark media READY: processing claim is no longer valid"
      );
    }

    processingCompleted = true;

    console.log("Media processing completed:", {
      mediaId: media.id,
      processingStatus: readyMedia.processing_status,
      manifestKey,
      segmentCount: segmentFiles.length
    });
  } catch (error) {
    const shutdownCancellation =
      shutdownRequested &&
      signal.aborted &&
      !leaseError &&
      signal.reason instanceof Error &&
      signal.reason.message ===
        "Media processing cancelled: worker shutting down";

    if (shutdownCancellation) {
      console.log(
        "Media processing cancelled during worker shutdown:",
        media.id
      );
    } else {
      const message = leaseError
        ? leaseError.message
        : errorMessage(error);

      /*
       * Only the current, unexpired claim holder
       * can mark a processing job FAILED.
       */
      try {
        const failedMedia = await markMediaProcessingFailed(
          media.id,
          claimId,
          message.slice(0, 2000)
        );

        if (!failedMedia) {
          console.warn(
            "Could not mark media FAILED; claim may have expired:",
            media.id
          );
        }
      } catch (statusError) {
        console.error(
          "Could not record media processing failure:",
          statusError
        );
      }

      throw error;
    }
  } finally {
    clearInterval(renewalTimer);

    /*
     * Do not allow another shutdown signal to target
     * this job while it is finishing cleanup.
     */
    if (activeProcessingController === processingController) {
      activeProcessingController = null;
    }

    if (!processingCompleted && !signal.aborted) {
      processingController.abort(
        new Error("Media processing stopped")
      );
    }

    if (temporaryDirectory) {
      try {
        await rm(temporaryDirectory, {
          recursive: true,
          force: true
        });
      } catch (cleanupError) {
        console.error(
          "Could not remove temporary media files:",
          cleanupError
        );
      }
    }

    /*
     * Release only a job cancelled by worker shutdown.
     * The repository checks that this worker still owns
     * the unexpired claim and that its status is PROCESSING.
     */
    if (
      shutdownRequested &&
      signal.aborted &&
      !leaseError &&
      signal.reason instanceof Error &&
      signal.reason.message ===
        "Media processing cancelled: worker shutting down" &&
      !processingCompleted
    ) {
      try {
        const released = await releaseMediaProcessingClaim(
          media.id,
          claimId
        );

        if (released) {
          console.log(
            "Cancelled media processing and returned job to queue:",
            media.id
          );
        } else {
          console.warn(
            "Could not release processing claim; lease recovery may be required:",
            media.id
          );
        }
      } catch (releaseError) {
        console.error(
          "Could not release processing claim:",
          releaseError
        );
      }
    }
  }

  return true;
}


function requestShutdown(signal: string): void {
  if (shutdownRequested) {
    return;
  }

  shutdownRequested = true;

  console.log(
    `${signal} received. Stopping new jobs and cancelling active processing.`
  );

  activeProcessingController?.abort(
    new Error("Media processing cancelled: worker shutting down")
  );
}

process.once("SIGTERM", () => {
  requestShutdown("SIGTERM");
});

process.once("SIGINT", () => {
  requestShutdown("SIGINT");
});

async function main(): Promise<void> {
  const mediaId = process.argv[2];

  if (mediaId) {
    if (shutdownRequested) {
      return;
    }

    const claimed = await processMedia(mediaId);

    if (!claimed) {
      throw new Error(
        "Media not found or not eligible for processing"
      );
    }

    return;
  }

  console.log(
    "Media worker started. Checking for uploaded videos every 5 seconds."
  );

  while (!shutdownRequested) {
    try {
      const media = await getNextUploadedMedia();

      // A shutdown signal may arrive while querying PostgreSQL.
      // Do not claim another job after receiving it.
      if (shutdownRequested) {
        break;
      }

      if (media) {
        await processMedia(media.id);
      } else {
        await sleep(POLL_INTERVAL_MS);
      }
    } catch (error) {
      console.error("Media worker error:", error);

      if (!shutdownRequested) {
        await sleep(POLL_INTERVAL_MS);
      }
    }
  }

  console.log(
    "Media worker stopped accepting jobs."
  );
}

main()
  .catch((error) => {
    console.error("Media worker failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    console.log("Closing PostgreSQL connection pool.");

    try {
      await pool.end();
      console.log("PostgreSQL connection pool closed.");
    } catch (error) {
      console.error(
        "Failed to close PostgreSQL connection pool:",
        error
      );

      process.exitCode = 1;
    }

    console.log("Media worker shutdown complete.");
  });
