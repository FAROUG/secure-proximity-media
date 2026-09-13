import path from "node:path";

import {
  createCloudFrontSignedUrl
} from "./cloudfront.js";

import {
  getMediaTextObject
} from "./s3.js";


export async function createSignedHlsManifest(
  manifestKey: string,
  expiresInSeconds = 90
): Promise<string> {
  const manifest =
    await getMediaTextObject(
      manifestKey
    );

  const manifestDirectory =
    path.posix.dirname(
      manifestKey
    );

  const lines =
    manifest.split("\n");

  const signedLines =
    lines.map((line) => {
      const trimmed =
        line.trim();

      // Preserve HLS directives and blank lines.
      if (
        !trimmed ||
        trimmed.startsWith("#")
      ) {
        return line;
      }

      /*
       * Our current playlist contains:
       *
       * segment_000.ts
       * segment_001.ts
       *
       * Convert each into its full S3/CloudFront key:
       *
       * demo/hls/test-video/segment_000.ts
       */
      const segmentKey =
        path.posix.join(
          manifestDirectory,
          trimmed
        );

      return createCloudFrontSignedUrl(
        segmentKey,
        expiresInSeconds
      );
    });

  return signedLines.join("\n");
}