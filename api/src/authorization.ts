import { distanceInMeters } from "./geo.js";

export interface Location {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

export interface Policy {
  accessType: "UNRESTRICTED" | "PROXIMITY";
  maxDistanceMeters?: number;
  maxLocationAgeSeconds?: number;
  maxAccuracyMeters?: number;
}

export interface AuthorizationResult {
  allowed: boolean;
  reason: string;
  distanceMeters?: number;
}

export function authorize(
  policy: Policy,
  viewerLocation: Location | null,
  referenceLocation?: Location | null
): AuthorizationResult {

  /*
   * Person has unrestricted access.
   *
   * IMPORTANT:
   * This returns immediately.
   *
   * Therefore Person A is not affected
   * by Person B's location.
   */
  if (policy.accessType === "UNRESTRICTED") {
    return {
      allowed: true,
      reason: "User has unrestricted access"
    };
  }

  /*
   * Proximity access requires the viewer's
   * current location.
   */
  if (!viewerLocation) {
    return {
      allowed: false,
      reason: "Viewer location unavailable"
    };
  }

  /*
   * Proximity access requires the reference
   * person's current location.
   */
  if (!referenceLocation) {
    return {
      allowed: false,
      reason: "Reference user location unavailable"
    };
  }

  const now = Date.now();

  const viewerAge =
    (now - viewerLocation.timestamp) / 1000;

  const referenceAge =
    (now - referenceLocation.timestamp) / 1000;

  const maxAge =
    policy.maxLocationAgeSeconds ?? 30;

  /*
   * Reject stale viewer location.
   */
  if (viewerAge > maxAge) {
    return {
      allowed: false,
      reason: "Viewer location is too old"
    };
  }

  /*
   * Reject stale reference location.
   */
  if (referenceAge > maxAge) {
    return {
      allowed: false,
      reason: "Reference person's location is too old"
    };
  }

  const maxAccuracy =
    policy.maxAccuracyMeters ?? 100;

  /*
   * Reject inaccurate viewer GPS.
   */
  if (viewerLocation.accuracy > maxAccuracy) {
    return {
      allowed: false,
      reason: "Viewer location accuracy is insufficient"
    };
  }

  /*
   * Reject inaccurate reference GPS.
   */
  if (referenceLocation.accuracy > maxAccuracy) {
    return {
      allowed: false,
      reason: "Reference person's location accuracy is insufficient"
    };
  }

  const distance = distanceInMeters(
    viewerLocation,
    referenceLocation
  );

  const allowedDistance =
    policy.maxDistanceMeters ?? 500;

  /*
   * Viewer is outside allowed radius.
   */
  if (distance > allowedDistance) {
    return {
      allowed: false,
      reason:
        `Viewer is ${Math.round(distance)}m away`,
      distanceMeters: distance
    };
  }

  /*
   * Viewer is inside allowed radius.
   */
  return {
    allowed: true,
    reason:
      `Viewer is within ${Math.round(distance)}m`,
    distanceMeters: distance
  };
}