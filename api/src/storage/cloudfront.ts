import {
  getSignedCookies,
  getSignedUrl
} from "@aws-sdk/cloudfront-signer";

import fs from "node:fs";
import path from "node:path";

const CLOUDFRONT_DOMAIN =
  process.env.CLOUDFRONT_DOMAIN;

const CLOUDFRONT_KEY_PAIR_ID =
  process.env.CLOUDFRONT_KEY_PAIR_ID;

const CLOUDFRONT_PRIVATE_KEY_PATH =
  process.env.CLOUDFRONT_PRIVATE_KEY_PATH;

function getPrivateKey(): string {
  if (!CLOUDFRONT_PRIVATE_KEY_PATH) {
    throw new Error(
      "CLOUDFRONT_PRIVATE_KEY_PATH is not configured"
    );
  }

  const privateKeyPath =
    path.resolve(
      process.cwd(),
      CLOUDFRONT_PRIVATE_KEY_PATH
    );

  return fs.readFileSync(
    privateKeyPath,
    "utf8"
  );
}

function getCloudFrontDomain(): string {
  if (!CLOUDFRONT_DOMAIN) {
    throw new Error(
      "CLOUDFRONT_DOMAIN is not configured"
    );
  }

  return CLOUDFRONT_DOMAIN
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
}

function getKeyPairId(): string {
  if (!CLOUDFRONT_KEY_PAIR_ID) {
    throw new Error(
      "CLOUDFRONT_KEY_PAIR_ID is not configured"
    );
  }

  return CLOUDFRONT_KEY_PAIR_ID;
}

export function createCloudFrontSignedUrl(
  storageKey: string,
  expiresInSeconds = 60
): string {
  const normalizedKey =
    storageKey.replace(
      /^\/+/,
      ""
    );

  const url =
    `https://${getCloudFrontDomain()}/${normalizedKey}`;

  const dateLessThan =
    new Date(
        Date.now() +
        expiresInSeconds * 1000
    ).toISOString();

  return getSignedUrl({
    url,
    keyPairId:
      getKeyPairId(),
    privateKey:
      getPrivateKey(),
    dateLessThan
  });
}

export function createCloudFrontHlsCookies(
  hlsPrefix: string
) {
  const normalizedPrefix =
    hlsPrefix
      .replace(/^\/+/, "")
      .replace(/\/+$/, "");

  const resource =
    `https://${getCloudFrontDomain()}/${normalizedPrefix}/*`;

  const expiresAt =
    Math.floor(
      (Date.now() + 60 * 1000) / 1000
    );

  const policy =
    JSON.stringify({
      Statement: [
        {
          Resource: resource,
          Condition: {
            DateLessThan: {
              "AWS:EpochTime":
                expiresAt
            }
          }
        }
      ]
    });

  const cookies =
    getSignedCookies({
      keyPairId:
        getKeyPairId(),
      privateKey:
        getPrivateKey(),
      policy
    });

  return {
    playlistUrl:
      `https://${getCloudFrontDomain()}/${normalizedPrefix}/master.m3u8`,

    resource,

    expiresAt,

    cookies
  };
}