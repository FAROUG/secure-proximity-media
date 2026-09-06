export interface Coordinates {
  latitude: number;
  longitude: number;
}

export function distanceInMeters(
  a: Coordinates,
  b: Coordinates
): number {
  const earthRadius = 6371000;

  const lat1 = a.latitude * Math.PI / 180;
  const lat2 = b.latitude * Math.PI / 180;

  const deltaLat =
    (b.latitude - a.latitude) * Math.PI / 180;

  const deltaLon =
    (b.longitude - a.longitude) * Math.PI / 180;

  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) *
    Math.cos(lat2) *
    Math.sin(deltaLon / 2) ** 2;

  const c =
    2 * Math.atan2(
      Math.sqrt(h),
      Math.sqrt(1 - h)
    );

  return earthRadius * c;
}