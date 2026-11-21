// Server-only. Copies Spotify data into Postgres so pages and the LLM read from the DB.
// See docs/agents/sync.md
import { createHash } from "node:crypto";
import { and, desc, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { db, plays, spotifySnapshots, users, type NowPlaying, type StoredTrack } from "@/db";
import {
  spotify,
  SpotifyApiError,
  type Paging,
  type SpotifyAlbum,
  type SpotifyArtist,
  type SpotifyImage,
  type SpotifyPlaylist,
  type SpotifyShow,
  type SpotifyTrack,
  type SpotifyUser,
  type TimeRange,
} from "./spotify";

export const SYNC_TTL_MS = 15 * 60 * 1000;
export const NOW_PLAYING_TTL_MS = 25 * 1000; // just under the 30s client poll

const RANGES: TimeRange[] = ["short_term", "medium_term", "long_term"];

// ---------- snapshot kinds and their stored shapes ----------

type List<T> = { total: number; items: T[] };

/** Shape of `spotify_snapshots.data` for each kind. */
export type SnapshotData = {
  profile: SpotifyUser;
  [k: `top_artists:${string}`]: List<SpotifyArtist>;
  [k: `top_tracks:${string}`]: List<StoredTrack>;
  liked: List<{ added_at: string; track: StoredTrack }>;
  playlists: List<SpotifyPlaylist>;
  albums: List<{ added_at: string; album: SpotifyAlbum }>;
  following: List<SpotifyArtist>;
  shows: List<{ show: SpotifyShow }>;
};
export type SnapshotKind = keyof SnapshotData;

// ---------- trimming (keep only what we render / feed to the LLM) ----------

/** Keep a single image: the smallest one that's still >= 64px. */
function img(images?: SpotifyImage[] | null): SpotifyImage[] {
  const pick = images?.filter((i) => (i.width ?? 640) >= 64).at(-1) ?? images?.[0];
  return pick ? [pick] : [];
}

function trimTrack(t: SpotifyTrack): StoredTrack {
  return {
    id: t.id,
    name: t.name,
    explicit: t.explicit,
    duration_ms: t.duration_ms,
    artists: t.artists.map((a) => ({ id: a.id, name: a.name })),
    album: { name: t.album.name, images: img(t.album.images) },
    external_urls: { spotify: t.external_urls.spotify },
  };
}

function trimArtist(a: SpotifyArtist): SpotifyArtist {
  return {
    id: a.id,
    name: a.name,
    images: img(a.images),
    external_urls: { spotify: a.external_urls.spotify },
    // Not returned for new Spotify apps today, but keep them if they ever come back.
    ...(a.genres?.length ? { genres: a.genres } : {}),
    ...(a.popularity !== undefined ? { popularity: a.popularity } : {}),
  };
}

function list<T, U>(p: Paging<T>, map: (item: T) => U): List<U> {
  return { total: p.total, items: p.items.filter(Boolean).map(map) };
}

// ---------- sync ----------

type Fetcher = () => Promise<unknown>;

function fetchers(userId: string): Record<SnapshotKind, Fetcher> {
  const f: Record<string, Fetcher> = {
    profile: async () => {
      const u = await spotify.me(userId);
      return { ...u, images: img(u.images) };
    },
    liked: async () => list(await spotify.savedTracks(userId, 50), (i) => ({ added_at: i.added_at, track: trimTrack(i.track) })),
    playlists: async () =>
      list(await spotify.playlists(userId, 50), (p) => ({
        id: p.id,
        name: p.name,
        images: img(p.images),
        owner: { display_name: p.owner.display_name },
        tracks: { total: p.tracks?.total ?? p.items?.total ?? 0 },
        external_urls: { spotify: p.external_urls.spotify },
      })),
    albums: async () =>
      list(await spotify.savedAlbums(userId, 50), (i) => ({
        added_at: i.added_at,
        album: {
          id: i.album.id,
          name: i.album.name,
          images: img(i.album.images),
          release_date: i.album.release_date,
          artists: i.album.artists.map((a) => ({ id: a.id, name: a.name })),
          external_urls: { spotify: i.album.external_urls.spotify },
        },
      })),
    following: async () => list((await spotify.followedArtists(userId, 50)).artists, trimArtist),
    shows: async () =>
      list(await spotify.savedShows(userId, 50), (i) => ({
        show: {
          id: i.show.id,
          name: i.show.name,
          publisher: i.show.publisher,
          images: img(i.show.images),
          external_urls: { spotify: i.show.external_urls.spotify },
        },
      })),
  };
  for (const r of RANGES) {
    f[`top_artists:${r}`] = async () => list(await spotify.topArtists(userId, r, 50), trimArtist);
    f[`top_tracks:${r}`] = async () => list(await spotify.topTracks(userId, r, 50), trimTrack);
  }
  return f as Record<SnapshotKind, Fetcher>;
}

/** Content hash for change detection. Ignores image URLs: Spotify rotates some (e.g. playlist covers) on every request. */
const hashOf = (data: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(data, (key, value) => (key === "images" ? undefined : value)))
    .digest("hex");

/**
 * Claims the user for syncing (atomically, so parallel page loads don't double-sync), then copies
 * recent plays + all snapshot kinds into the DB. Returns false if a sync ran within SYNC_TTL_MS.
 */
export async function syncUser(userId: string, { force = false } = {}): Promise<boolean> {
  const staleBefore = new Date(Date.now() - SYNC_TTL_MS);
  const claimed = await db
    .update(users)
    .set({ lastSyncedAt: new Date() })
    .where(
      force
        ? eq(users.id, userId)
        : and(eq(users.id, userId), or(isNull(users.lastSyncedAt), lt(users.lastSyncedAt, staleBefore))),
    )
    .returning({ id: users.id });
  if (!claimed.length) return false;

  const errors: NonNullable<(typeof users.$inferSelect)["syncErrors"]> = {};
  const recordError = (kind: string, err: unknown) => {
    errors[kind] =
      err instanceof SpotifyApiError
        ? { status: err.status, message: err.message, needsReauth: err.needsReauth }
        : { message: err instanceof Error ? err.message : String(err) };
    console.error(`[sync] ${userId} ${kind}:`, errors[kind].message);
  };

  const kinds = Object.entries(fetchers(userId));
  const [recent, ...results] = await Promise.allSettled([
    spotify.recentlyPlayed(userId, 50),
    ...kinds.map(([, fetch]) => fetch()),
  ]);

  // 1. Plays: append-only, duplicates ignored.
  if (recent.status === "fulfilled") {
    const rows = recent.value.items.map(({ track: t, played_at }) => ({
      userId,
      playedAt: new Date(played_at),
      trackId: t.id,
      trackName: t.name,
      artistIds: t.artists.map((a) => a.id),
      artistNames: t.artists.map((a) => a.name),
      albumName: t.album.name,
      imageUrl: img(t.album.images)[0]?.url ?? null,
      durationMs: t.duration_ms,
      explicit: t.explicit,
    }));
    if (rows.length) await db.insert(plays).values(rows).onConflictDoNothing();
  } else recordError("recent", recent.reason);

  // 2. Snapshots: insert only when content changed.
  const latest = await latestSnapshotRows(userId);
  const newRows = [];
  for (const [i, [kind]] of kinds.entries()) {
    const r = results[i];
    if (r.status === "rejected") {
      recordError(kind, r.reason);
      continue;
    }
    const hash = hashOf(r.value);
    if (latest.get(kind)?.hash !== hash) newRows.push({ userId, kind, data: r.value, hash });
  }
  if (newRows.length) await db.insert(spotifySnapshots).values(newRows);

  await db.update(users).set({ syncErrors: errors }).where(eq(users.id, userId));
  await refreshNowPlaying(userId, { force: true });
  return true;
}

/** Cheap, frequent refresh of users.nowPlaying (one Spotify call). Skips if refreshed within NOW_PLAYING_TTL_MS. */
export async function refreshNowPlaying(userId: string, { force = false } = {}): Promise<void> {
  const staleBefore = new Date(Date.now() - NOW_PLAYING_TTL_MS);
  const claimed = await db
    .update(users)
    .set({ nowPlayingAt: new Date() })
    .where(
      force
        ? eq(users.id, userId)
        : and(eq(users.id, userId), or(isNull(users.nowPlayingAt), lt(users.nowPlayingAt, staleBefore))),
    )
    .returning({ id: users.id });
  if (!claimed.length) return;

  try {
    const n = await spotify.currentlyPlaying(userId);
    const nowPlaying: NowPlaying | null =
      n?.item && n.currently_playing_type === "track"
        ? { isPlaying: n.is_playing, progressMs: n.progress_ms, track: trimTrack(n.item) }
        : null;
    await db.update(users).set({ nowPlaying }).where(eq(users.id, userId));
  } catch (err) {
    console.error(`[sync] ${userId} now_playing:`, err instanceof Error ? err.message : err);
  }
}

// ---------- reads ----------

async function latestSnapshotRows(userId: string) {
  const rows = await db
    .selectDistinctOn([spotifySnapshots.kind])
    .from(spotifySnapshots)
    .where(eq(spotifySnapshots.userId, userId))
    .orderBy(spotifySnapshots.kind, desc(spotifySnapshots.fetchedAt));
  return new Map(rows.map((r) => [r.kind, r]));
}

/** Latest stored data for every snapshot kind, plus when it was fetched. Missing kinds = never synced. */
export async function getLatestSnapshots(userId: string) {
  const rows = await latestSnapshotRows(userId);
  return {
    get<K extends SnapshotKind>(kind: K): { data: SnapshotData[K]; fetchedAt: Date } | undefined {
      const r = rows.get(kind);
      return r && { data: r.data as SnapshotData[K], fetchedAt: r.fetchedAt };
    },
  };
}

/** Stored plays, newest first. Rows are mapped back to a track shape the UI can render. */
export async function getRecentPlays(userId: string, limit = 50) {
  const rows = await db
    .select()
    .from(plays)
    .where(eq(plays.userId, userId))
    .orderBy(desc(plays.playedAt))
    .limit(limit);
  return rows.map((p) => ({
    playedAt: p.playedAt,
    track: {
      id: p.trackId,
      name: p.trackName,
      explicit: p.explicit,
      duration_ms: p.durationMs ?? 0,
      artists: p.artistIds.map((id, i) => ({ id, name: p.artistNames[i] ?? "" })),
      album: { name: p.albumName ?? "", images: p.imageUrl ? [{ url: p.imageUrl, width: null, height: null }] : [] },
      external_urls: { spotify: `https://open.spotify.com/track/${p.trackId}` },
    } satisfies StoredTrack,
  }));
}

/** Aggregates over stored plays in the last `days` days: what the vibe and trends are built from. */
export async function getListeningStats(userId: string, days = 7) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const where = and(eq(plays.userId, userId), gte(plays.playedAt, since));

  const [topArtists, topTracks, byHour, [totals]] = await Promise.all([
    db
      .execute<{ name: string; plays: number }>(sql`
        select a.name, count(*)::int as plays
        from ${plays}, unnest(${plays.artistNames}) as a(name)
        where ${where}
        group by a.name order by plays desc limit 15`)
      .then((rows) => [...rows]),
    db
      .select({
        name: plays.trackName,
        artist: sql<string>`${plays.artistNames}[1]`,
        plays: sql<number>`count(*)::int`,
      })
      .from(plays)
      .where(where)
      .groupBy(plays.trackId, plays.trackName, sql`${plays.artistNames}[1]`)
      .orderBy(sql`3 desc`)
      .limit(15),
    db
      .select({
        // UTC hour: we don't know the user's timezone yet.
        hour: sql<number>`extract(hour from ${plays.playedAt} at time zone 'UTC')::int`,
        plays: sql<number>`count(*)::int`,
      })
      .from(plays)
      .where(where)
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({
        plays: sql<number>`count(*)::int`,
        minutes: sql<number>`coalesce(round(sum(${plays.durationMs}) / 60000.0), 0)::int`,
      })
      .from(plays)
      .where(where),
  ]);
  return { days, totalPlays: totals.plays, totalMinutes: totals.minutes, topArtists, topTracks, byHour };
}
