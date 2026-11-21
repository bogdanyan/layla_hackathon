// Server-only. LLM-written Summary (vibe + listener profile + trends), cached in the `vibes` table.
// Facts/numbers come from src/lib/summary.ts; the LLM only writes words. See docs/agents/summary.md
import { createHash } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";
import { db, users, vibes } from "@/db";
import { DEFAULT_MODEL, generateJSON } from "./llm";
import { getSummaryFacts, toLLMInput } from "./summary";
import { refreshNowPlaying, SYNC_TTL_MS, syncUser } from "./sync";

/** Don't regenerate more often than this, even if listening data changed. */
export const VIBE_TTL_MS = 6 * 60 * 60 * 1000;

/** Bump when you change the prompt or schema: invalidates every cached summary. */
const PROMPT_VERSION = 2;

// Plain schema on purpose (no regex/min/max): structured outputs support a limited JSON Schema subset.
// Counts and hex colors are enforced in `clean()` instead.
export const SummarySchema = z.object({
  vibe: z.object({
    title: z.string().describe("2-4 word vibe name, e.g. 'Midnight Indie Drift'"),
    emoji: z.string().describe("exactly one emoji"),
    tagline: z.string().describe("one punchy sentence to the listener, max ~15 words"),
    moods: z.array(z.string()).describe("3-5 one-word moods"),
    colors: z
      .array(z.string())
      .describe("exactly 3 hex colors like #1a2b3c matching the vibe, readable with white text on top"),
  }),
  profile: z.object({
    headline: z.string().describe("listener archetype, 3-6 words, e.g. 'The Loyal Synth Romantic'"),
    description: z.string().describe("2-3 sentences in second person explaining their taste, naming real artists"),
    traits: z
      .array(
        z.object({
          label: z.string().describe("1-3 words"),
          explanation: z.string().describe("one sentence grounded in the data"),
        }),
      )
      .describe("exactly 3 traits"),
  }),
  trends: z
    .array(
      z.object({
        emoji: z.string().describe("one emoji"),
        title: z.string().describe("3-6 words"),
        detail: z.string().describe("one sentence citing specific names/numbers from the data"),
      }),
    )
    .describe("2-4 notable recent trends"),
});
export type Summary = z.infer<typeof SummarySchema> & { createdAt: Date };

const SYSTEM = `You write the Summary screen of Layla, a social music app. You get facts about one
listener as JSON and turn them into a vibe, a listener profile and recent trends.

Rules:
- Use only the facts given. Every artist, track and number you mention must appear in the input.
  You may infer styles/genres from artist names you know, but never invent stats, concerts or events.
- Talk to the listener as "you": warm, witty and specific. No generic filler like "eclectic taste".
- Play counts come from history we recorded starting at recordedHistoryStarts. If that is within the
  last 7 days, last7Days is incomplete: don't call it low listening. previous7Days = null means no
  data to compare, so don't claim week-over-week changes.
- spotifyTop lists are Spotify's own rankings: compare last4Weeks with last6Months/lastYear to spot
  shifts. newDiscoveries are new in the top lists; longtimeStaples appear in every range.
- Times of day are in the listener's timezone.
- With little data, say it's early days instead of over-interpreting.`;

const HEX = /^#[0-9a-f]{6}$/i;
const FALLBACK_COLORS = ["#1db954", "#191414", "#535353"];

/** Enforce the counts/format the schema can't express. */
function clean(s: z.infer<typeof SummarySchema>): z.infer<typeof SummarySchema> {
  const colors = s.vibe.colors.filter((c) => HEX.test(c)).slice(0, 3);
  return {
    vibe: {
      ...s.vibe,
      moods: s.vibe.moods.slice(0, 5),
      colors: [...colors, ...FALLBACK_COLORS].slice(0, 3),
    },
    profile: { ...s.profile, traits: s.profile.traits.slice(0, 3) },
    trends: s.trends.slice(0, 4),
  };
}

async function latestValidRow(userId: string) {
  const [row] = await db.select().from(vibes).where(eq(vibes.userId, userId)).orderBy(desc(vibes.createdAt)).limit(1);
  const parsed = row && SummarySchema.safeParse(row.result);
  return row && parsed?.success ? { row, summary: { ...parsed.data, createdAt: row.createdAt } } : null;
}

/** The latest stored summary (DB only, no LLM call). null if none or stored in an older format. */
export async function getLatestSummary(userId: string): Promise<Summary | null> {
  return (await latestValidRow(userId))?.summary ?? null;
}

// One generation per user at a time (e.g. page render + after() on a first visit). Per server process.
const inflight = new Map<string, Promise<Summary | null>>();

/**
 * Returns the current summary, calling the LLM only if the input changed AND the last summary is older
 * than VIBE_TTL_MS (or `force`, or there's no valid summary yet). No-op without ANTHROPIC_API_KEY.
 */
export function refreshSummary(userId: string, { force = false } = {}): Promise<Summary | null> {
  const running = inflight.get(userId);
  if (running) return running;
  const p = generate(userId, force).finally(() => inflight.delete(userId));
  inflight.set(userId, p);
  return p;
}

async function generate(userId: string, force: boolean): Promise<Summary | null> {
  const last = await latestValidRow(userId);
  if (!process.env.ANTHROPIC_API_KEY) return last?.summary ?? null;

  const input = toLLMInput(await getSummaryFacts(userId));
  if (!input.last7Days.plays && !input.spotifyTop.last4Weeks.artists.length) return last?.summary ?? null;

  const inputHash = createHash("sha256").update(`${PROMPT_VERSION}:${JSON.stringify(input)}`).digest("hex");
  const fresh = last && Date.now() - last.row.createdAt.getTime() < VIBE_TTL_MS;
  if (last && !force && (last.row.inputHash === inputHash || fresh)) return last.summary;

  const result = clean(
    await generateJSON(
      `Facts about me as JSON:\n${JSON.stringify(input, null, 1)}\n\nWrite my summary.`,
      SummarySchema,
      { system: SYSTEM, effort: "low" },
    ),
  );
  const [row] = await db
    .insert(vibes)
    .values({ userId, inputHash, model: DEFAULT_MODEL, result })
    .returning({ createdAt: vibes.createdAt });
  return { ...result, createdAt: row.createdAt };
}

/**
 * For pages: the cached summary instantly (refreshing it in the background if old), or, when none
 * exists yet, generate it now. Render inside <Suspense> so the rest of the page doesn't wait.
 */
export async function getOrCreateSummary(userId: string): Promise<Summary | null> {
  const latest = await getLatestSummary(userId);
  if (latest) {
    if (Date.now() - latest.createdAt.getTime() > VIBE_TTL_MS) {
      after(() => refreshSummary(userId).catch((e) => console.error("[summary]", e)));
    }
    return latest;
  }
  return refreshSummary(userId).catch((e) => {
    console.error("[summary]", e);
    return null;
  });
}

// Old names, still used by the cron route and actions.
export const refreshVibe = refreshSummary;
export const getLatestVibe = getLatestSummary;

/**
 * Call while rendering a page that shows a user's Spotify data. Keeps the DB fresh without
 * making the page wait on Spotify (except the very first sync) or ever on the LLM:
 * - never synced: sync inline, then generate the summary after the response;
 * - otherwise: refresh now-playing inline (one call, at most once per 25 s), and if the data is
 *   older than SYNC_TTL_MS, sync + refresh the summary after the response (the next load shows it).
 */
export async function ensureFresh(userId: string) {
  const logError = (e: unknown) => console.error("[sync]", e);
  const [user] = await db.select({ lastSyncedAt: users.lastSyncedAt }).from(users).where(eq(users.id, userId));

  if (!user?.lastSyncedAt) {
    await syncUser(userId).catch(logError);
    after(() => refreshSummary(userId).catch(logError));
    return;
  }
  await refreshNowPlaying(userId).catch(logError);
  if (Date.now() - user.lastSyncedAt.getTime() > SYNC_TTL_MS) {
    after(async () => {
      await syncUser(userId).catch(logError);
      await refreshSummary(userId).catch(logError);
    });
  }
}
