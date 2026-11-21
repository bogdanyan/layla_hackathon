// Server-only. Generates the user's "vibe" from stored listening data, cached in the `vibes` table.
// See docs/agents/sync.md
import { createHash } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";
import { db, users, vibes } from "@/db";
import { DEFAULT_MODEL, generateJSON } from "./llm";
import { getLatestSnapshots, getListeningStats, refreshNowPlaying, SYNC_TTL_MS, syncUser } from "./sync";

/** Don't regenerate more often than this, even if listening data changed. */
export const VIBE_TTL_MS = 6 * 60 * 60 * 1000;

// The LLM owner can freely change this schema + prompt; the UI only reads `result`.
export const VibeSchema = z.object({
  title: z.string().describe("2-4 word vibe name, e.g. 'Midnight Indie Drift'"),
  emoji: z.string().describe("one emoji"),
  summary: z.string().describe("1-2 playful sentences addressed to the listener (you...)"),
  moods: z.array(z.string()).describe("3-5 one-word moods"),
  colors: z.array(z.string()).describe("3 hex colors matching the vibe, e.g. #1db954"),
});
export type Vibe = z.infer<typeof VibeSchema>;

const SYSTEM = `You are a music taste analyst for a social music app. Given a listener's recent
listening data (artist and track names, play counts, hours in UTC), describe their current "vibe".
Base it on the actual artists and tracks; be specific, warm and fun, never generic.`;

/** Compact, deterministic input for the LLM. Its hash decides whether we need a new vibe. */
async function buildInput(userId: string) {
  const [stats, snaps] = await Promise.all([getListeningStats(userId, 7), getLatestSnapshots(userId)]);
  return {
    last7Days: {
      plays: stats.totalPlays,
      minutes: stats.totalMinutes,
      topArtists: stats.topArtists.map((a) => `${a.name} (${a.plays})`),
      topTracks: stats.topTracks.map((t) => `${t.name} by ${t.artist} (${t.plays})`),
      playsByHourUTC: Object.fromEntries(stats.byHour.map((h) => [h.hour, h.plays])),
    },
    spotifyTop4Weeks: {
      artists: snaps.get("top_artists:short_term")?.data.items.slice(0, 15).map((a) => a.name) ?? [],
      tracks:
        snaps
          .get("top_tracks:short_term")
          ?.data.items.slice(0, 15)
          .map((t) => `${t.name} by ${t.artists[0]?.name}`) ?? [],
    },
  };
}

/** The latest stored vibe (no LLM call). Use this in pages. */
export async function getLatestVibe(userId: string) {
  const [row] = await db.select().from(vibes).where(eq(vibes.userId, userId)).orderBy(desc(vibes.createdAt)).limit(1);
  return row ? { ...(row.result as Vibe), createdAt: row.createdAt } : null;
}

/**
 * Returns the current vibe, regenerating it only if the input changed AND the last one is older
 * than VIBE_TTL_MS (or `force`). Slow when it calls the LLM: run it in `after()` or the cron route,
 * never while rendering a page.
 */
export async function refreshVibe(userId: string, { force = false } = {}) {
  if (!process.env.ANTHROPIC_API_KEY) return getLatestVibe(userId); // LLM not configured yet

  const input = await buildInput(userId);
  if (!input.last7Days.plays && !input.spotifyTop4Weeks.artists.length) return null; // nothing to analyze

  const inputHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const [last] = await db.select().from(vibes).where(eq(vibes.userId, userId)).orderBy(desc(vibes.createdAt)).limit(1);
  const fresh = last && Date.now() - last.createdAt.getTime() < VIBE_TTL_MS;
  if (last && !force && (last.inputHash === inputHash || fresh)) {
    return { ...(last.result as Vibe), createdAt: last.createdAt };
  }

  const result = await generateJSON(
    `Here is my listening data as JSON:\n${JSON.stringify(input, null, 1)}\n\nWhat's my vibe?`,
    VibeSchema,
    { system: SYSTEM, effort: "low" },
  );
  const [row] = await db
    .insert(vibes)
    .values({ userId, inputHash, model: DEFAULT_MODEL, result })
    .returning({ createdAt: vibes.createdAt });
  return { ...result, createdAt: row.createdAt };
}

/**
 * Call while rendering a page that shows a user's Spotify data. Keeps the DB fresh without
 * making the page wait on Spotify (except the very first sync) or ever on the LLM:
 * - never synced: sync inline, then generate the vibe after the response;
 * - otherwise: refresh now-playing inline (one call, at most once per 25 s), and if the data is
 *   older than SYNC_TTL_MS, sync + refresh the vibe after the response (the next load shows it).
 */
export async function ensureFresh(userId: string) {
  const logError = (e: unknown) => console.error("[sync]", e);
  const [user] = await db.select({ lastSyncedAt: users.lastSyncedAt }).from(users).where(eq(users.id, userId));

  if (!user?.lastSyncedAt) {
    await syncUser(userId).catch(logError);
    after(() => refreshVibe(userId).catch(logError));
    return;
  }
  await refreshNowPlaying(userId).catch(logError);
  if (Date.now() - user.lastSyncedAt.getTime() > SYNC_TTL_MS) {
    after(async () => {
      await syncUser(userId).catch(logError);
      await refreshVibe(userId).catch(logError);
    });
  }
}
