import { eq } from "drizzle-orm";
import Link from "next/link";
import { cache, Suspense, type ReactNode } from "react";
import { NowPlaying } from "@/components/now-playing";
import { ShareStory } from "@/components/share-story";
import { TimezoneSync } from "@/components/timezone-sync";
import { Img } from "@/components/track-row";
import { db, users } from "@/db";
import { albumArt, cardGradient, type CardKind } from "@/lib/cards";
import { timeAgo } from "@/lib/format";
import { getSummaryFacts, type SummaryFacts } from "@/lib/summary";
import { ensureFresh, getLatestSummary, getOrCreateSummary, type Summary as SummaryData } from "@/lib/vibe";
import { refreshSpotify } from "./actions";

// The LLM cards (vibe, listener, trends) read the same summary: fetch it once per request.
const loadSummary = cache(getOrCreateSummary);

/**
 * MVP 1 Summary page: a stack of shareable cards (each has a matching story image in /api/story),
 * then plain sections. Numbers come from getSummaryFacts; words from the LLM (getOrCreateSummary).
 */
export async function Summary({ userId }: { userId: string }) {
  await ensureFresh(userId);
  const [facts, [user], cached] = await Promise.all([
    getSummaryFacts(userId),
    db
      .select({ timezone: users.timezone, nowPlaying: users.nowPlaying, lastSyncedAt: users.lastSyncedAt })
      .from(users)
      .where(eq(users.id, userId)),
    getLatestSummary(userId), // DB only: lets the (instant) week card use the vibe colors when they exist
  ]);

  return (
    <div className="flex flex-col gap-6">
      <TimezoneSync current={user?.timezone ?? null} />
      <NowPlaying initial={user?.nowPlaying ?? null} />

      <Suspense fallback={<CardSkeleton label="Reading your vibe…" tall />}>
        <VibeCard userId={userId} facts={facts} />
      </Suspense>

      <WeekCard facts={facts} colors={cached?.vibe.colors} version={user?.lastSyncedAt?.toISOString() ?? "0"} />

      <Suspense fallback={<CardSkeleton label="Getting to know you…" />}>
        <ListenerCard userId={userId} />
      </Suspense>

      <Suspense fallback={<CardSkeleton label="Spotting trends…" />}>
        <TrendsCard userId={userId} />
      </Suspense>

      <div className="mt-4">
        <Concerts facts={facts} />
      </div>

      <footer className="mt-2 flex flex-col items-center gap-3 text-xs opacity-60">
        <Link href="/data" className="underline underline-offset-2">
          All my Spotify data →
        </Link>
        <form action={refreshSpotify} className="flex gap-2">
          <span>{user?.lastSyncedAt ? `Synced ${timeAgo(user.lastSyncedAt)}` : "Not synced yet"}</span>·
          <button type="submit" className="underline underline-offset-2">
            Refresh
          </button>
        </form>
      </footer>
    </div>
  );
}

// ---------- cards ----------

const LABEL: Record<CardKind, string> = {
  vibe: "Your vibe",
  week: "Your week in music",
  listener: "You as a listener",
  trends: "Your trends",
};

/** Gradient card with a label and a footer holding the Share button (same look as the story image). */
function Card({
  card,
  colors,
  version,
  title,
  footnote,
  children,
}: {
  card: CardKind;
  colors?: string[];
  version: string;
  title: string;
  footnote?: string;
  children: ReactNode;
}) {
  return (
    <section
      className="flex flex-col gap-4 rounded-3xl p-6 text-white shadow-lg"
      style={{ backgroundImage: cardGradient(colors, card) }}
    >
      <p className="text-xs font-medium tracking-[0.2em] uppercase opacity-80">{LABEL[card]}</p>
      {children}
      <div className="mt-1 flex items-center justify-between gap-3">
        <span className="truncate text-[11px] opacity-70">{footnote}</span>
        <ShareStory card={card} version={version} title={title} />
      </div>
    </section>
  );
}

function NoSummary() {
  return (
    <section className="rounded-3xl bg-current/5 p-5 text-sm">
      <p className="font-semibold">Your vibe is warming up</p>
      <p className="mt-1 opacity-60">Listen to a few songs on Spotify, then come back. We&apos;ll read your vibe.</p>
    </section>
  );
}

const version = (s: SummaryData) => s.createdAt.toISOString();

async function VibeCard({ userId, facts }: { userId: string; facts: SummaryFacts }) {
  const summary = await loadSummary(userId);
  if (!summary) return <NoSummary />;
  const { vibe } = summary;
  return (
    <Card card="vibe" colors={vibe.colors} version={version(summary)} title={vibe.title} footnote={`Updated ${timeAgo(summary.createdAt)}`}>
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/85 text-4xl">{vibe.emoji}</div>
      <h1 className="text-3xl leading-tight font-extrabold">{vibe.title}</h1>
      <p className="text-sm font-medium opacity-95">{vibe.tagline}</p>
      <p className="text-sm opacity-80">{vibe.description}</p>
      <div className="flex flex-wrap gap-1.5">
        {vibe.moods.map((m) => (
          <span key={m} className="rounded-full bg-black/25 px-3 py-1 text-xs">
            {m}
          </span>
        ))}
      </div>
      {facts.intoRightNow.length > 0 && (
        <div className="mt-1 flex flex-col gap-2">
          <p className="text-[11px] tracking-[0.2em] opacity-70">INTO RIGHT NOW</p>
          {facts.intoRightNow.map((t) => (
            <CardTrack key={t.id} id={t.id} name={t.name} artist={t.artist} imageUrl={t.imageUrl} />
          ))}
        </div>
      )}
    </Card>
  );
}

function WeekCard({ facts, colors, version }: { facts: SummaryFacts; colors?: string[]; version: string }) {
  const { thisWeek: w, lastWeek } = facts;
  const note = !lastWeek && facts.trackingSince ? `Tracking since ${formatDate(facts.trackingSince)}` : undefined;
  return (
    <Card card="week" colors={colors} version={version} title="My week in music" footnote={note}>
      <div className="flex items-baseline gap-2">
        <span className="text-6xl leading-none font-extrabold">{w.minutes.toLocaleString("en")}</span>
        <span className="text-sm opacity-80">minutes</span>
        <Delta value={delta(w.minutes, lastWeek?.minutes)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <CardStat label="Plays" value={w.plays.toLocaleString("en")} delta={delta(w.plays, lastWeek?.plays)} />
        <CardStat label="Peak time" value={w.peak ? capitalize(w.peak.band) : "—"} sub={w.peak ? `${w.peak.share}% of plays` : undefined} />
        <div className="col-span-2">
          <CardStat
            label="Top artist"
            value={w.topArtists[0]?.name ?? "—"}
            sub={w.topArtists[0] ? `${w.topArtists[0].plays} plays` : undefined}
          />
        </div>
      </div>
      {w.topTracks.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] tracking-[0.2em] opacity-70">ON REPEAT</p>
          {w.topTracks.slice(0, 3).map((t) => (
            <CardTrack key={t.trackId} id={t.trackId} name={t.name} artist={t.artist} imageUrl={t.imageUrl} right={`${t.plays}×`} />
          ))}
        </div>
      )}
    </Card>
  );
}

async function ListenerCard({ userId }: { userId: string }) {
  const summary = await loadSummary(userId);
  if (!summary) return null;
  const { profile } = summary;
  return (
    <Card card="listener" colors={summary.vibe.colors} version={version(summary)} title={profile.headline}>
      <h2 className="text-2xl leading-tight font-extrabold">{profile.headline}</h2>
      <p className="text-sm leading-relaxed opacity-90">{profile.description}</p>
      <div className="flex flex-col gap-2">
        {profile.traits.map((t) => (
          <div key={t.label} className="rounded-2xl bg-black/20 p-3">
            <p className="text-sm font-semibold">{t.label}</p>
            <p className="text-xs opacity-80">{t.explanation}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

async function TrendsCard({ userId }: { userId: string }) {
  const summary = await loadSummary(userId);
  if (!summary?.trends.length) return null;
  return (
    <Card card="trends" colors={summary.vibe.colors} version={version(summary)} title="My music trends">
      <div className="flex flex-col gap-2">
        {summary.trends.map((t) => (
          <div key={t.title} className="flex gap-3 rounded-2xl bg-black/20 p-3">
            <span className="text-2xl leading-none">{t.emoji}</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">{t.title}</p>
              <p className="text-xs opacity-80">{t.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function CardTrack({ id, name, artist, imageUrl, right }: { id: string; name: string; artist: string; imageUrl: string | null; right?: string }) {
  const src = albumArt(imageUrl);
  return (
    <a href={`https://open.spotify.com/track/${id}`} target="_blank" className="flex items-center gap-3">
      <Img images={src ? [{ url: src, width: 300, height: 300 }] : []} className="h-11 w-11 shrink-0 rounded-md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{name}</p>
        <p className="truncate text-xs opacity-75">{artist}</p>
      </div>
      {right && <span className="shrink-0 text-xs opacity-75">{right}</span>}
    </a>
  );
}

function CardStat({ label, value, sub, delta }: { label: string; value: string; sub?: string; delta?: number | null }) {
  return (
    <div className="min-w-0 rounded-2xl bg-black/20 p-3">
      <p className="text-[11px] tracking-wider uppercase opacity-70">{label}</p>
      <p className="truncate text-lg font-bold">{value}</p>
      {delta != null ? <Delta value={delta} /> : sub && <p className="truncate text-xs opacity-75">{sub}</p>}
    </div>
  );
}

function Delta({ value }: { value: number | null }) {
  if (value == null) return null;
  return (
    <span className="text-xs font-semibold opacity-90">
      {value >= 0 ? "▲" : "▼"} {Math.abs(value)}% vs last week
    </span>
  );
}

function CardSkeleton({ label, tall }: { label: string; tall?: boolean }) {
  return (
    <div className={`flex animate-pulse flex-col gap-3 rounded-3xl bg-current/10 p-6 ${tall ? "min-h-96" : "min-h-56"}`}>
      <p className="text-xs tracking-[0.2em] uppercase opacity-60">{label}</p>
      <div className="h-8 w-3/4 rounded-lg bg-current/10" />
      <div className="h-4 w-full rounded bg-current/10" />
      <div className="h-4 w-5/6 rounded bg-current/10" />
    </div>
  );
}

// ---------- plain sections ----------

function Concerts({ facts }: { facts: SummaryFacts }) {
  const top = facts.topArtists4Weeks.slice(0, 3);
  return (
    <Section title="Concerts">
      <div className="rounded-2xl border border-dashed border-current/20 p-4 text-sm">
        <p className="font-semibold">🎟️ Concert picks are coming soon</p>
        <p className="mt-1 text-xs opacity-60">
          {top.length
            ? `We'll look for upcoming shows by ${top.map((a) => a.name).join(", ")} and more near you.`
            : "We'll look for upcoming shows by your favourite artists near you."}
        </p>
      </div>
    </Section>
  );
}

// ---------- helpers ----------

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-baseline justify-between text-lg font-semibold">
        {title}
        {note && <span className="text-xs font-normal opacity-50">{note}</span>}
      </h2>
      {children}
    </section>
  );
}

function delta(now: number, before: number | undefined) {
  return before ? Math.round(((now - before) / before) * 100) : null;
}

const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1);
const formatDate = (d: Date) => d.toLocaleDateString("en", { month: "short", day: "numeric" });
