// Server-only. Deterministic listening facts for the Summary page.
// Numbers come from here (shown directly in the UI); the LLM only gets them as input to write words.
// See docs/agents/summary.md
import { eq, sql } from "drizzle-orm";
import { db, plays, users } from "@/db";
import type { SpotifyArtist } from "./spotify";
import { getLatestSnapshots, getListeningStats } from "./sync";

const DAY_MS = 24 * 60 * 60 * 1000;

const BANDS = [
  { band: "late night", from: 0, to: 5 },
  { band: "morning", from: 6, to: 11 },
  { band: "afternoon", from: 12, to: 17 },
  { band: "evening", from: 18, to: 23 },
] as const;

/** Which part of the day has the most plays, and what share of plays it has. */
function peakTime(byHour: { hour: number; plays: number }[]) {
  const total = byHour.reduce((n, h) => n + h.plays, 0);
  if (!total) return null;
  const bands = BANDS.map((b) => ({
    band: b.band,
    plays: byHour.filter((h) => h.hour >= b.from && h.hour <= b.to).reduce((n, h) => n + h.plays, 0),
  }));
  const top = bands.reduce((a, b) => (b.plays > a.plays ? b : a));
  const peakHour = byHour.reduce((a, b) => (b.plays > a.plays ? b : a)).hour;
  return { band: top.band, share: Math.round((top.plays / total) * 100), peakHour };
}

export type SummaryFacts = Awaited<ReturnType<typeof getSummaryFacts>>;

export async function getSummaryFacts(userId: string) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const twoWeeksAgo = new Date(now.getTime() - 14 * DAY_MS);

  const [thisWeek, lastWeek, snaps, [meta]] = await Promise.all([
    getListeningStats(userId, { from: weekAgo, to: now }),
    getListeningStats(userId, { from: twoWeeksAgo, to: weekAgo }),
    getLatestSnapshots(userId),
    db
      .select({
        timezone: users.timezone,
        trackingSince: sql<string | null>`(select min(${plays.playedAt}) from ${plays} where ${plays.userId} = ${userId})`,
      })
      .from(users)
      .where(eq(users.id, userId)),
  ]);

  const short = snaps.get("top_artists:short_term")?.data.items ?? [];
  const medium = snaps.get("top_artists:medium_term")?.data.items ?? [];
  const long = snaps.get("top_artists:long_term")?.data.items ?? [];
  const mediumIds = new Set(medium.map((a) => a.id));
  const longIds = new Set(long.map((a) => a.id));

  // Spotify's own top lists (computed by Spotify over ~4 weeks / 6 months / 1 year).
  const newDiscoveries = short.filter((a) => !mediumIds.has(a.id) && !longIds.has(a.id)).slice(0, 5);
  const staples = short.filter((a) => mediumIds.has(a.id) && longIds.has(a.id)).slice(0, 5);

  // Week-over-week, from our own recorded plays (only meaningful once we have last week's history).
  const hasLastWeek = lastWeek.totalPlays > 0;
  const lastWeekByArtist = new Map(lastWeek.topArtists.map((a) => [a.name, a.plays]));
  const rising = hasLastWeek
    ? thisWeek.topArtists
        .map((a) => ({ name: a.name, plays: a.plays, lastWeek: lastWeekByArtist.get(a.name) ?? 0 }))
        .filter((a) => a.plays >= 3 && a.plays >= a.lastWeek * 1.5 + 1)
        .slice(0, 3)
    : [];

  const likedThisWeek = (snaps.get("liked")?.data.items ?? []).filter(
    (i) => new Date(i.added_at) >= weekAgo,
  ).length;

  const longTracks = snaps.get("top_tracks:long_term")?.data.items ?? [];
  const shortTracks = snaps.get("top_tracks:short_term")?.data.items ?? [];

  return {
    timezone: meta?.timezone ?? "UTC",
    /** When our recorded play history starts. Week stats before this date are incomplete. */
    trackingSince: meta?.trackingSince ? new Date(meta.trackingSince) : null,
    thisWeek: {
      plays: thisWeek.totalPlays,
      minutes: thisWeek.totalMinutes,
      topArtists: thisWeek.topArtists.slice(0, 8),
      topTracks: thisWeek.topTracks.slice(0, 5),
      peak: peakTime(thisWeek.byHour),
    },
    lastWeek: hasLastWeek ? { plays: lastWeek.totalPlays, minutes: lastWeek.totalMinutes } : null,
    rising,
    likedThisWeek,
    newDiscoveries,
    staples,
    /** Spotify's top artists for the last ~4 weeks (with images, for the UI). */
    topArtists4Weeks: short.slice(0, 9),
    topTracks4Weeks: shortTracks.slice(0, 10),
    topArtists6Months: medium.slice(0, 10),
    topArtists1Year: long.slice(0, 10),
    topTracks1Year: longTracks.slice(0, 5),
  };
}

const names = (artists: SpotifyArtist[]) => artists.map((a) => a.name);

/** Compact, deterministic LLM input: names and counts only. Its hash decides when to regenerate. */
export function toLLMInput(f: SummaryFacts) {
  return {
    timezone: f.timezone,
    recordedHistoryStarts: f.trackingSince?.toISOString().slice(0, 10) ?? null,
    last7Days: {
      plays: f.thisWeek.plays,
      minutes: f.thisWeek.minutes,
      topArtists: f.thisWeek.topArtists.map((a) => `${a.name} (${a.plays} plays)`),
      topTracks: f.thisWeek.topTracks.map((t) => `${t.name} by ${t.artist} (${t.plays} plays)`),
      peakListening: f.thisWeek.peak && `${f.thisWeek.peak.band} (${f.thisWeek.peak.share}% of plays)`,
      likedSongsAdded: f.likedThisWeek,
    },
    previous7Days: f.lastWeek,
    risingArtists: f.rising.map((a) => `${a.name}: ${a.lastWeek} → ${a.plays} plays`),
    spotifyTop: {
      last4Weeks: { artists: names(f.topArtists4Weeks), tracks: f.topTracks4Weeks.map((t) => `${t.name} by ${t.artists[0]?.name}`) },
      last6Months: { artists: names(f.topArtists6Months) },
      lastYear: { artists: names(f.topArtists1Year), tracks: f.topTracks1Year.map((t) => `${t.name} by ${t.artists[0]?.name}`) },
    },
    newDiscoveries: names(f.newDiscoveries),
    longtimeStaples: names(f.staples),
  };
}
