// Server-only. "Playing around you": nearby users joined with what they're playing now or played last.
// See docs/agents/listening.md
import { desc, inArray } from "drizzle-orm";
import { db, plays, users, type StoredTrack } from "@/db";
import { getNearbyUsers } from "./location";
import { playToTrack, refreshNowPlaying } from "./sync";

const MAX_USERS = 30;
/** A stored nowPlaying older than this is treated as stale (e.g. the user's token stopped working). */
const NOW_PLAYING_FRESH_MS = 10 * 60 * 1000;

export type NearbyListener = {
  userId: string;
  displayName: string | null;
  imageUrl: string | null;
  distanceLabel: string;
  track: StoredTrack | null;
  status: "playing" | "paused" | "recent" | "none";
  /** When the recent track was played (status "recent" only). */
  playedAt: Date | null;
};

/** Demo users (scripts/seed-demo.mts) have no tokens; their seeded nowPlaying never goes stale. */
export const DEMO_PREFIX = "demo:";
const isDemoUser = (spotifyId: string) => spotifyId.startsWith(DEMO_PREFIX);

const ORDER = { playing: 0, paused: 1, recent: 2, none: 3 } as const;

export async function getNearbyListening(userId: string, radiusKm: number): Promise<NearbyListener[]> {
  const nearby = (await getNearbyUsers(userId, radiusKm)).slice(0, MAX_USERS);
  if (!nearby.length) return [];
  const ids = nearby.map((u) => u.userId);

  // We hold everyone's tokens, so refresh their now-playing live. The 25s TTL claim in
  // refreshNowPlaying keeps this cheap when many viewers poll at once.
  await Promise.allSettled(ids.map((id) => refreshNowPlaying(id)));

  const [nowRows, lastPlays] = await Promise.all([
    db
      .select({ id: users.id, spotifyId: users.spotifyId, nowPlaying: users.nowPlaying, nowPlayingAt: users.nowPlayingAt })
      .from(users)
      .where(inArray(users.id, ids)),
    db
      .selectDistinctOn([plays.userId])
      .from(plays)
      .where(inArray(plays.userId, ids))
      .orderBy(plays.userId, desc(plays.playedAt)),
  ]);
  const now = new Map(nowRows.map((r) => [r.id, r]));
  const last = new Map(lastPlays.map((p) => [p.userId, p]));
  const freshAfter = Date.now() - NOW_PLAYING_FRESH_MS;

  return nearby
    .map((u): NearbyListener => {
      const base = { userId: u.userId, displayName: u.displayName, imageUrl: u.imageUrl, distanceLabel: u.distanceLabel };
      const n = now.get(u.userId);
      const fresh = n?.nowPlayingAt && (n.nowPlayingAt.getTime() > freshAfter || isDemoUser(n.spotifyId));
      if (n?.nowPlaying && fresh) {
        return { ...base, track: n.nowPlaying.track, status: n.nowPlaying.isPlaying ? "playing" : "paused", playedAt: null };
      }
      const p = last.get(u.userId);
      if (p) return { ...base, track: playToTrack(p), status: "recent", playedAt: p.playedAt };
      return { ...base, track: null, status: "none", playedAt: null };
    })
    // Playing first, then by distance (Array.sort is stable and getNearbyUsers is sorted by distance).
    .sort((a, b) => ORDER[a.status] - ORDER[b.status]);
}
