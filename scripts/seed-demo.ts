// Seeds demo users around a location so the Listening screen (/nearby) has people to show.
//   npm run db:seed-demo              -> around the most recently located real user
//   npm run db:seed-demo -- 52.52 13.40   -> around explicit coords
//   npm run db:seed-demo -- --clear   -> remove demo users
// Re-run it daily: locations expire after 24h and the "x min ago" times age.
// Demo users have spotify_id "demo:*" and no tokens. See docs/agents/listening.md
import { and, desc, eq, inArray, isNotNull, like, not } from "drizzle-orm";
import { db, plays, spotifySnapshots, users, type StoredTrack } from "@/db";
import type { SpotifyArtist } from "@/lib/spotify";

const PREFIX = "demo:";

// [name, dLat, dLng, status, minutesAgo, tasteOverlap]. 0.01° lat ≈ 1.1 km.
// tasteOverlap = share of the viewer's top artists in their top list (drives the match %).
// Lena and Omar are ~300 km away: only visible in "Your taste twins", not the nearby list.
const DEMO = [
  ["Mia", 0, 0, "playing", 0, 0.8],
  ["Leo", 0.02, 0, "playing", 0, 0.3],
  ["Sofia", -0.01, 0.03, "paused", 0, 0.6],
  ["Jonas", 0.03, -0.03, "recent", 7, 0.1],
  ["Aylin", -0.08, 0.05, "recent", 45, 0.5],
  ["Noah", 0.15, 0.1, "recent", 190, 0.4],
  ["Lena", 2.7, 0.5, "recent", 20, 0.9],
  ["Omar", -2.5, -1, "playing", 0, 0.7],
] as const;

async function main() {
  const args = process.argv.slice(2);
  await db.delete(users).where(like(users.spotifyId, `${PREFIX}%`)); // cascades to plays
  if (args.includes("--clear")) return console.log("Removed demo users.");

  let lat: number, lng: number;
  let viewerId: string | undefined;
  if (args.length >= 2) {
    [lat, lng] = args.map(Number);
  } else {
    const [me] = await db
      .select({ id: users.id, lat: users.lat, lng: users.lng, name: users.displayName })
      .from(users)
      .where(and(isNotNull(users.lat), not(like(users.spotifyId, `${PREFIX}%`))))
      .orderBy(desc(users.locationUpdatedAt))
      .limit(1);
    if (me?.lat == null || me.lng == null) {
      throw new Error("No user has shared a location. Share it on /nearby first, or pass: -- <lat> <lng>");
    }
    ({ lat, lng } = me as { lat: number; lng: number });
    viewerId = me.id;
    console.log(`Seeding around ${me.name}`);
  }

  // Real tracks (with album art) from existing plays; fallback to a placeholder.
  const source = await db.selectDistinctOn([plays.trackId]).from(plays).where(isNotNull(plays.imageUrl)).limit(50);
  source.sort(() => Math.random() - 0.5);
  const track = (i: number): StoredTrack => {
    const p = source[i % Math.max(source.length, 1)];
    if (!p) {
      return {
        id: `demo${i}`, name: "Demo Song", explicit: false, duration_ms: 200_000,
        artists: [{ id: "demo", name: "Demo Artist" }], album: { name: "Demo Album", images: [] },
        external_urls: { spotify: "https://open.spotify.com" },
      };
    }
    return {
      id: p.trackId, name: p.trackName, explicit: p.explicit, duration_ms: p.durationMs ?? 0,
      artists: p.artistIds.map((id, j) => ({ id, name: p.artistNames[j] ?? "" })),
      album: { name: p.albumName ?? "", images: p.imageUrl ? [{ url: p.imageUrl, width: null, height: null }] : [] },
      external_urls: { spotify: `https://open.spotify.com/track/${p.trackId}` },
    };
  };

  // The viewer's top artists per range, to build demo top lists with a controlled overlap.
  const KINDS = ["top_artists:short_term", "top_artists:medium_term", "top_artists:long_term"] as const;
  const viewerArtists = new Map<string, SpotifyArtist[]>();
  if (viewerId) {
    const snaps = await db
      .selectDistinctOn([spotifySnapshots.kind], { kind: spotifySnapshots.kind, data: spotifySnapshots.data })
      .from(spotifySnapshots)
      .where(and(eq(spotifySnapshots.userId, viewerId), inArray(spotifySnapshots.kind, [...KINDS])))
      .orderBy(spotifySnapshots.kind, desc(spotifySnapshots.fetchedAt));
    for (const sn of snaps) viewerArtists.set(sn.kind, (sn.data as { items?: SpotifyArtist[] }).items ?? []);
  }
  // Deterministic: keeps the viewer's artist at rank j for an evenly spread `overlap` share of ranks,
  // and puts a made-up artist everywhere else, so the match % follows `overlap`.
  const topList = (kind: string, name: string, overlap: number) => {
    const items = (viewerArtists.get(kind) ?? []).map((a, j) =>
      Math.ceil((j + 1) * overlap) > Math.ceil(j * overlap)
        ? a
        : { id: `${PREFIX}${name}-artist-${j}`, name: `Demo Artist ${j + 1}` },
    );
    return { total: items.length, items };
  };

  const round = (n: number) => Math.round(n * 100) / 100;
  for (const [i, [name, dLat, dLng, status, minutesAgo, overlap]] of DEMO.entries()) {
    const t = track(i);
    const [u] = await db
      .insert(users)
      .values({
        spotifyId: `${PREFIX}${name.toLowerCase()}`,
        displayName: name,
        imageUrl: `https://i.pravatar.cc/150?img=${i + 10}`,
        lat: round(lat + dLat),
        lng: round(lng + dLng),
        locationUpdatedAt: new Date(),
        nowPlaying: status === "recent" ? null : { isPlaying: status === "playing", progressMs: 60_000, track: t },
        nowPlayingAt: status === "recent" ? null : new Date(),
      })
      .returning({ id: users.id });

    // A few plays each: the latest is shown for "recent" users; the rest is history for later taste matching.
    const history = [t, track(i + DEMO.length), track(i + 2 * DEMO.length)];
    await db.insert(plays).values(
      history.map((h, j) => ({
        userId: u.id,
        playedAt: new Date(Date.now() - (minutesAgo + j * 30 + (status === "recent" ? 0 : 5)) * 60_000),
        trackId: h.id,
        trackName: h.name,
        artistIds: h.artists.map((a) => a.id),
        artistNames: h.artists.map((a) => a.name),
        albumName: h.album.name,
        imageUrl: h.album.images[0]?.url ?? null,
        durationMs: h.duration_ms,
        explicit: h.explicit,
      })),
    );
    await db.insert(spotifySnapshots).values(
      KINDS.map((kind) => ({
        userId: u.id,
        kind,
        data: topList(kind, name.toLowerCase(), overlap),
        hash: "demo",
      })),
    );
    console.log(`  ${name}: ${status} — ${t.name} (overlap ${overlap})`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
