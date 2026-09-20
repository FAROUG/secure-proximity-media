# Media processing worker

The worker polls for UPLOADED media and expired PROCESSING leases. It downloads the original video, transcodes with FFmpeg, uploads segments before the manifest, and publishes the manifest key by transitioning to READY. Each claim uses its own output prefix. SIGTERM cancels active work and returns an owned job to UPLOADED; crashed jobs become eligible after the five-minute lease expires.

Apply migration 001 to an old pre-processing schema, migration 002 for owner login, and migration 003 before starting this worker. Fresh databases use init.sql plus migration 002; init.sql already includes the processing and lease columns. Do not run migration 001 on an initialized new schema because its constraint creation is not repeatable.

From the repository root, `docker compose build media-worker` builds the image. `docker compose up -d media-worker` starts processing queued media and writes to the configured S3 bucket. Review the Compose AWS profile, region, bucket, and read-only credentials mount first. Existing database volumes do not automatically run new migrations. Startup retries database errors; no jobs are accepted after shutdown begins.

For one job, run `node dist/worker/process-media.js <media-id>` after building the API, with DB and AWS environment variables configured. The Docker image includes Node 22 and FFmpeg.

## Validation

Run `WORKER_TEST_DATABASE_URL=postgresql://user:password@localhost:5432/test_database npm run test:worker` from api with local FFmpeg and PostgreSQL available. Use a disposable database; the suite creates and drops a uniquely named schema. It uses real PostgreSQL and FFmpeg, but mocks S3 transfers with local files. It covers claim concurrency, stale/expired claims, renewal/release, conversion success, invalid media, and shutdown recovery.

Live AWS IAM, S3 CORS, CloudFront delivery, and browser playback require separate validation. HLS playback is handled by PR #8. This worker only produces a single H.264/AAC rendition; output objects from abandoned claims are not garbage-collected. Original upload size and processing time are not capped.
