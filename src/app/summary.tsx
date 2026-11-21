import { eq } from "drizzle-orm";
import Link from "next/link";
import { cache, Suspense, type ReactNode } from "react";
import { NowPlaying } from "@/components/now-playing";
import { ShareStory } from "@/components/share-story";
import { Skeleton } from "@/components/skeleton";
import { TimezoneSync } from "@/components/timezone-sync";
import { Img, Row } from "@/components/track-row";
import { db, users } from "@/db";
import { timeAgo } from "@/lib/format";
import { getSummaryFacts, type SummaryFacts } from "@/lib/summary";
import { ensureFresh, getOrCreateSummary } from "@/lib/vibe";
import { refreshSpotify } from "./actions";

// Both LLM sections (hero/profile and trends) read the same summary: fetch it once per request.
const loadSummary = cache(getOrCreateSummary);

/** MVP 1 Summary page: numbers from code (getSummaryFacts), words from the LLM (getOrCreateSummary). */
export async function Summary({ userId }: { userId: string }) {
  await ensureFresh(userId);
  const [facts, [user]] = await Promise.all([
    getSummaryFacts(userId),
    db
      .select({ timezone: users.timezone, nowPlaying: users.nowPlaying, lastSyncedAt: users.lastSyncedAt })
      .from(users)
      .where(eq(users.id, userId)),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <TimezoneSync current={user?.timezone ?? null} />
      <NowPlaying initial={user?.nowPlaying ?? null} />

      <Suspense fallback={<VibeSkeleton />}>
        <VibeAndProfile userId={userId} />
      </Suspense>

      <ThisWeek facts={facts} />

      <Suspense fallback={<Section title="Trends"><Skeleton rows={3} className="h-16" /></Section>}>
        <Trends userId={userId} />
      </Suspense>

      <OnRepeat facts={facts} />
      <YourArtists facts={facts} />
      <Concerts facts={facts} />

      <footer className="flex flex-col items-center gap-3 text-xs opacity-60">
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

// ---------- LLM sections (stream in) ----------

async function VibeAndProfile({ userId }: { userId: string }) {
  const summary = await loadSummary(userId);
  if (!summary) {
    return (
      <section className="rounded-3xl bg-current/5 p-5 text-sm">
        <p className="font-semibold">Your vibe is warming up</p>
        <p className="mt-1 opacity-60">Listen to a few songs on Spotify, then come back. We&apos;ll read your vibe.</p>
      </section>
    );
  }
  const { vibe, profile } = summary;

  return (
    <>
      <section
        className="flex flex-col gap-3 rounded-3xl p-6 text-white shadow-lg"
        style={{ backgroundImage: `linear-gradient(150deg, ${vibe.colors.join(", ")})` }}
      >
        <p className="text-xs font-medium tracking-[0.2em] opacity-80">YOUR VIBE</p>
        <p className="text-5xl leading-none">{vibe.emoji}</p>
        <h1 className="text-3xl leading-tight font-extrabold">{vibe.title}</h1>
        <p className="text-sm opacity-90">{vibe.tagline}</p>
        <div className="flex flex-wrap gap-1.5">
          {vibe.moods.map((m) => (
            <span key={m} className="rounded-full bg-black/25 px-3 py-1 text-xs">
              {m}
            </span>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] opacity-70">Updated {timeAgo(summary.createdAt)}</span>
          <ShareStory version={summary.createdAt.toISOString()} title={vibe.title} />
        </div>
      </section>

      <Section title="You as a listener">
        <p className="text-xl font-bold">{profile.headline}</p>
        <p className="text-sm leading-relaxed opacity-80">{profile.description}</p>
        <div className="mt-1 flex flex-col gap-2">
          {profile.traits.map((t) => (
            <div key={t.label} className="rounded-2xl bg-current/5 p-3">
              <p className="text-sm font-semibold">{t.label}</p>
              <p className="text-xs opacity-70">{t.explanation}</p>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

async function Trends({ userId }: { userId: string }) {
  const summary = await loadSummary(userId);
  if (!summary?.trends.length) return null;
  return (
    <Section title="Trends">
      {summary.trends.map((t) => (
        <div key={t.title} className="flex gap-3 rounded-2xl bg-current/5 p-3">
          <span className="text-2xl leading-none">{t.emoji}</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{t.title}</p>
            <p className="text-xs opacity-70">{t.detail}</p>
          </div>
        </div>
      ))}
    </Section>
  );
}

// ---------- deterministic sections (instant) ----------

function ThisWeek({ facts }: { facts: SummaryFacts }) {
  const { thisWeek: w, lastWeek } = facts;
  const firstWeek = !lastWeek;
  return (
    <Section
      title="This week"
      note={firstWeek && facts.trackingSince ? `Tracking since ${formatDate(facts.trackingSince)}` : undefined}
    >
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Minutes" value={w.minutes.toLocaleString("en")} delta={delta(w.minutes, lastWeek?.minutes)} />
        <Stat label="Plays" value={w.plays.toLocaleString("en")} delta={delta(w.plays, lastWeek?.plays)} />
        <Stat
          label="Top artist"
          value={w.topArtists[0]?.name ?? "—"}
          sub={w.topArtists[0] ? `${w.topArtists[0].plays} plays` : undefined}
        />
        <Stat
          label="Peak time"
          value={w.peak ? capitalize(w.peak.band) : "—"}
          sub={w.peak ? `${w.peak.share}% of plays` : undefined}
        />
      </div>
    </Section>
  );
}

function OnRepeat({ facts }: { facts: SummaryFacts }) {
  const tracks = facts.thisWeek.topTracks;
  if (!tracks.length) return null;
  return (
    <Section title="On repeat">
      <ul className="flex flex-col gap-1">
        {tracks.map((t, i) => (
          <Row
            key={t.trackId}
            rank={i + 1}
            href={`https://open.spotify.com/track/${t.trackId}`}
            images={t.imageUrl ? [{ url: t.imageUrl, width: null, height: null }] : []}
            title={t.name}
            subtitle={t.artist}
            right={`${t.plays} plays`}
          />
        ))}
      </ul>
    </Section>
  );
}

function YourArtists({ facts }: { facts: SummaryFacts }) {
  const artists = facts.topArtists4Weeks;
  if (!artists.length) return null;
  const isNew = new Set(facts.newDiscoveries.map((a) => a.id));
  const isStaple = new Set(facts.staples.map((a) => a.id));
  return (
    <Section title="Your artists" note="Last 4 weeks">
      <div className="grid grid-cols-3 gap-3">
        {artists.map((a) => (
          <a key={a.id} href={a.external_urls.spotify} target="_blank" className="relative min-w-0 text-center">
            <Img images={a.images} className="aspect-square w-full rounded-full" />
            {(isNew.has(a.id) || isStaple.has(a.id)) && (
              <span
                className={`absolute top-0 right-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${isNew.has(a.id) ? "bg-[#1db954] text-black" : "bg-foreground text-background"}`}
              >
                {isNew.has(a.id) ? "new" : "staple"}
              </span>
            )}
            <p className="mt-1 truncate text-xs">{a.name}</p>
          </a>
        ))}
      </div>
    </Section>
  );
}

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

function Stat({ label, value, sub, delta }: { label: string; value: string; sub?: string; delta?: number | null }) {
  return (
    <div className="min-w-0 rounded-2xl bg-current/5 p-3">
      <p className="text-xs opacity-60">{label}</p>
      <p className="truncate text-lg font-bold">{value}</p>
      {delta != null ? (
        <p className={`text-xs ${delta >= 0 ? "text-[#1db954]" : "text-red-500"}`}>
          {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}% vs last week
        </p>
      ) : (
        sub && <p className="truncate text-xs opacity-60">{sub}</p>
      )}
    </div>
  );
}

function VibeSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-3 rounded-3xl bg-current/10 p-6">
      <p className="text-xs tracking-[0.2em] opacity-60">READING YOUR VIBE…</p>
      <div className="h-12 w-12 rounded-full bg-current/10" />
      <div className="h-8 w-3/4 rounded-lg bg-current/10" />
      <div className="h-4 w-full rounded bg-current/10" />
    </div>
  );
}

function delta(now: number, before: number | undefined) {
  return before ? Math.round(((now - before) / before) * 100) : null;
}

const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1);
const formatDate = (d: Date) => d.toLocaleDateString("en", { month: "short", day: "numeric" });
