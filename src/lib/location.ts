import { and, between, eq, gt, inArray, ne } from "drizzle-orm";
import { db, users, type NowPlaying } from "@/db";

// Approximate location: coords are snapped to a 0.01° grid (~1.1 km) before
// storage, and other users only ever see a distance bucket, never coordinates.

export const LOCATION_TTL_MS = 24 * 60 * 60 * 1000;

/** Radius options on the Listening screen. */
export const RADII_KM = [1, 5, 10, 25] as const;
export const DEFAULT_RADIUS_KM = 5;

export function roundCoord(n: number) {
  return Math.round(n * 100) / 100;
}

export function isValidLatLng(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

export async function setLocation(userId: string, lat: number, lng: number) {
  await db
    .update(users)
    .set({ lat: roundCoord(lat), lng: roundCoord(lng), locationUpdatedAt: new Date() })
    .where(eq(users.id, userId));
}

export async function clearLocation(userId: string) {
  await db
    .update(users)
    .set({ lat: null, lng: null, locationUpdatedAt: null })
    .where(eq(users.id, userId));
}

/** True if the user shared a location within the last 24h. */
export async function isSharingLocation(userId: string) {
  const [me] = await db
    .select({ at: users.locationUpdatedAt })
    .from(users)
    .where(eq(users.id, userId));
  return !!me?.at && me.at.getTime() > Date.now() - LOCATION_TTL_MS;
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

function distanceLabel(km: number) {
  if (km < 1.5) return "< 1 km";
  if (km < 3.5) return "~2 km";
  if (km < 7.5) return "~5 km";
  if (km < 15) return "~10 km";
  if (km < 40) return "~25 km";
  return "far away";
}

export type NearbyUser = {
  userId: string;
  displayName: string | null;
  imageUrl: string | null;
  distanceLabel: string;
  nowPlaying: NowPlaying | null;
  nowPlayingAt: Date | null;
};

/** Users who shared a location in the last 24h within `radiusKm`, closest first. */
export async function getNearbyUsers(userId: string, radiusKm = 10): Promise<NearbyUser[]> {
  const [me] = await db
    .select({ lat: users.lat, lng: users.lng })
    .from(users)
    .where(eq(users.id, userId));
  if (me?.lat == null || me.lng == null) return [];

  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.max(Math.cos((me.lat * Math.PI) / 180), 0.01));

  const rows = await db
    .select({
      userId: users.id,
      displayName: users.displayName,
      imageUrl: users.imageUrl,
      nowPlaying: users.nowPlaying,
      nowPlayingAt: users.nowPlayingAt,
      lat: users.lat,
      lng: users.lng,
    })
    .from(users)
    .where(
      and(
        ne(users.id, userId),
        gt(users.locationUpdatedAt, new Date(Date.now() - LOCATION_TTL_MS)),
        between(users.lat, me.lat - dLat, me.lat + dLat),
        between(users.lng, me.lng - dLng, me.lng + dLng),
      ),
    );

  return rows
    .map((r) => ({ ...r, km: haversineKm(me.lat!, me.lng!, r.lat!, r.lng!) }))
    .filter((r) => r.km <= radiusKm)
    .sort((a, b) => a.km - b.km)
    .map(({ userId, displayName, imageUrl, nowPlaying, nowPlayingAt, km }) => ({
      userId,
      displayName,
      imageUrl,
      nowPlaying: nowPlaying ?? null,
      nowPlayingAt,
      distanceLabel: distanceLabel(km),
    }));
}

/** Distance bucket from the viewer to each of `ids`, for users (and a viewer) sharing a location in the last 24h. */
export async function getDistanceLabels(viewerId: string, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const rows = await db
    .select({ id: users.id, lat: users.lat, lng: users.lng })
    .from(users)
    .where(
      and(
        inArray(users.id, [viewerId, ...ids]),
        gt(users.locationUpdatedAt, new Date(Date.now() - LOCATION_TTL_MS)),
      ),
    );
  const me = rows.find((r) => r.id === viewerId);
  if (me?.lat == null || me.lng == null) return out;
  for (const r of rows) {
    if (r.id === viewerId || r.lat == null || r.lng == null) continue;
    out.set(r.id, distanceLabel(haversineKm(me.lat, me.lng, r.lat, r.lng)));
  }
  return out;
}
