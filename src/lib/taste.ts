// Server-only. Taste matching by shared artists (Spotify no longer returns genres for our app).
// See docs/agents/taste.md
import { desc, gte, inArray } from "drizzle-orm";
import { cache } from "react";
import { db, plays, spotifySnapshots, users } from "@/db";
import type { SpotifyArtist } from "./spotify";

type Vector = Map<string, { w: number; name: string }>;

/** How much each source counts. Each source is normalized to sum 1 first. */
const SOURCES = {
  "top_artists:short_term": 3,
  "top_artists:medium_term": 2,
  "top_artists:long_term": 1,
} as const;
const PLAYS_WEIGHT = 2;
const PLAYS_DAYS = 30;

function addSource(vec: Vector, items: { id: string; name: string; w: number }[], weight: number) {
  const total = items.reduce((s, i) => s + i.w, 0);
  if (!total) return;
  for (const i of items) {
    const cur = vec.get(i.id);
    vec.set(i.id, { name: i.name, w: (cur?.w ?? 0) + (i.w / total) * weight });
  }
}

/**
 * Artist-weight vector per user, from the latest top-artist snapshots plus recent plays.
 * Computed per request: fine for a few hundred users; cache it if the app grows.
 */
export async function getTasteVectors(): Promise<Map<string, Vector>> {
  const [snapshots, recent] = await Promise.all([
    db
      .selectDistinctOn([spotifySnapshots.userId, spotifySnapshots.kind], {
        userId: spotifySnapshots.userId,
        kind: spotifySnapshots.kind,
        data: spotifySnapshots.data,
      })
      .from(spotifySnapshots)
      .where(inArray(spotifySnapshots.kind, Object.keys(SOURCES)))
      .orderBy(spotifySnapshots.userId, spotifySnapshots.kind, desc(spotifySnapshots.fetchedAt)),
    db
      .select({ userId: plays.userId, artistIds: plays.artistIds, artistNames: plays.artistNames })
      .from(plays)
      .where(gte(plays.playedAt, new Date(Date.now() - PLAYS_DAYS * 24 * 60 * 60 * 1000))),
  ]);

  const vectors = new Map<string, Vector>();
  const vec = (userId: string) => vectors.get(userId) ?? vectors.set(userId, new Map()).get(userId)!;

  for (const s of snapshots) {
    const items = (s.data as { items?: SpotifyArtist[] }).items ?? [];
    addSource(
      vec(s.userId),
      items.map((a, i) => ({ id: a.id, name: a.name, w: 1 - i / items.length })),
      SOURCES[s.kind as keyof typeof SOURCES],
    );
  }

  const counts = new Map<string, Map<string, { id: string; name: string; w: number }>>();
  for (const p of recent) {
    const m = counts.get(p.userId) ?? counts.set(p.userId, new Map()).get(p.userId)!;
    p.artistIds.forEach((id, i) => {
      const cur = m.get(id);
      m.set(id, { id, name: p.artistNames[i] ?? "", w: (cur?.w ?? 0) + 1 });
    });
  }
  for (const [userId, m] of counts) addSource(vec(userId), [...m.values()], PLAYS_WEIGHT);

  return vectors;
}

function norm(v: Vector) {
  let s = 0;
  for (const { w } of v.values()) s += w * w;
  return Math.sqrt(s);
}

/** Cosine similarity, 0..1. */
export function similarity(a: Vector, b: Vector) {
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [id, { w }] of small) dot += w * (big.get(id)?.w ?? 0);
  const n = norm(a) * norm(b);
  return n ? dot / n : 0;
}

/** Artists both users care about, strongest shared first. */
export function sharedArtists(a: Vector, b: Vector, n = 3) {
  return [...a]
    .filter(([id]) => b.has(id))
    .map(([id, { w, name }]) => ({ name, w: Math.min(w, b.get(id)!.w) }))
    .sort((x, y) => y.w - x.w)
    .slice(0, n)
    .map((x) => x.name);
}

export type TasteMatch = {
  userId: string;
  displayName: string | null;
  imageUrl: string | null;
  /** 0-100. sqrt(cosine) so typical partial overlap doesn't read as tiny. */
  score: number;
  shared: string[];
};

/** Everyone in the app ranked by taste similarity to `userId` (score > 0 only). Deduped per request. */
export const getTasteMatches = cache(async (userId: string): Promise<TasteMatch[]> => {
  const vectors = await getTasteVectors();
  const mine = vectors.get(userId);
  if (!mine?.size) return [];

  const scored = [...vectors]
    .filter(([id]) => id !== userId)
    .map(([id, v]) => ({ id, cos: similarity(mine, v), v }))
    .filter((s) => s.cos > 0);
  if (!scored.length) return [];

  const profiles = await db
    .select({ id: users.id, displayName: users.displayName, imageUrl: users.imageUrl })
    .from(users)
    .where(inArray(users.id, scored.map((s) => s.id)));
  const byId = new Map(profiles.map((p) => [p.id, p]));

  return scored
    .filter((s) => byId.has(s.id))
    .map((s) => ({
      userId: s.id,
      displayName: byId.get(s.id)!.displayName,
      imageUrl: byId.get(s.id)!.imageUrl,
      score: Math.round(Math.sqrt(Math.min(s.cos, 1)) * 100),
      shared: sharedArtists(mine, s.v),
    }))
    .sort((a, b) => b.score - a.score);
});
