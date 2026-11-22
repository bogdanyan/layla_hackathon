/* eslint-disable @next/next/no-img-element -- Spotify CDN images */
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { AutoRefresh } from "@/components/auto-refresh";
import { BottomNav } from "@/components/bottom-nav";
import { ShareLocation } from "@/components/share-location";
import { Skeleton } from "@/components/skeleton";
import { Empty, TrackRow } from "@/components/track-row";
import { timeAgo } from "@/lib/format";
import { DEFAULT_RADIUS_KM, getDistanceLabels, isSharingLocation, RADII_KM } from "@/lib/location";
import { getTasteMatches, type TasteMatch } from "@/lib/taste";
import { getNearbyListening, type NearbyListener } from "@/lib/nearby";
import { ensureFresh } from "@/lib/vibe";

/** Listening screen: what people within X km are playing now or played last. */
export default function NearbyPage({ searchParams }: PageProps<"/nearby">) {
  return (
    <main className="flex flex-1 flex-col px-5 pt-6 pb-24">
      <Suspense fallback={<Skeleton />}>
        <Content searchParams={searchParams} />
      </Suspense>
      <BottomNav />
    </main>
  );
}

function parseRadius(r: string | string[] | undefined): number {
  const n = Number(Array.isArray(r) ? r[0] : r);
  return (RADII_KM as readonly number[]).includes(n) ? n : DEFAULT_RADIUS_KM;
}

async function Content({ searchParams }: { searchParams: PageProps<"/nearby">["searchParams"] }) {
  await connection(); // auth() must run at request time (see page.tsx)
  const session = await auth();
  if (!session?.user) redirect("/");
  const radius = parseRadius((await searchParams).r);

  return (
    <div className="flex flex-col gap-6">
      <AppHeader name={session.user.name} image={session.user.image} />
      <div>
        <h1 className="text-2xl font-semibold">Playing around you</h1>
        <p className="mt-1 text-sm opacity-60">What people nearby are listening to.</p>
      </div>
      <ShareLocation />
      <Suspense fallback={<Skeleton rows={1} className="h-36" />}>
        <TasteTwins userId={session.user.id} />
      </Suspense>
      <div className="flex gap-2">
        {RADII_KM.map((r) => (
          <Link
            key={r}
            href={`?r=${r}`}
            replace
            scroll={false}
            className={`flex-1 rounded-full border py-1.5 text-center text-sm ${
              r === radius ? "border-transparent bg-foreground font-semibold text-background" : "border-current/20 opacity-70"
            }`}
          >
            {r} km
          </Link>
        ))}
      </div>
      <Suspense key={radius} fallback={<Skeleton rows={4} className="h-16" />}>
        <Listeners userId={session.user.id} radius={radius} />
      </Suspense>
    </div>
  );
}

async function Listeners({ userId, radius }: { userId: string; radius: number }) {
  const [, sharing, people, matches] = await Promise.all([
    ensureFresh(userId),
    isSharingLocation(userId),
    getNearbyListening(userId, radius),
    getTasteMatches(userId),
  ]);
  const matchById = new Map(matches.map((m) => [m.userId, m]));

  return (
    <section className="flex flex-col gap-3">
      <AutoRefresh />
      {!sharing ? (
        <Empty>Share your location to see who&apos;s listening around you.</Empty>
      ) : people.length === 0 ? (
        <Empty>Nobody within {radius} km right now. Try a bigger radius.</Empty>
      ) : (
        <ul className="flex flex-col gap-3">
          {people.map((p) => (
            <Listener key={p.userId} p={p} match={matchById.get(p.userId)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Listener({ p, match }: { p: NearbyListener; match?: TasteMatch }) {
  const status =
    p.status === "playing"
      ? "▶︎ now"
      : p.status === "paused"
        ? "paused"
        : p.status === "recent" && p.playedAt
          ? timeAgo(p.playedAt)
          : undefined;

  return (
    <li className="rounded-xl bg-current/5 px-3 py-2.5">
      <div className="flex items-center gap-2">
        {p.imageUrl ? (
          <img src={p.imageUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
        ) : (
          <div className="h-6 w-6 rounded-full bg-current/10" />
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.displayName ?? "Spotify user"}</span>
        {p.status === "playing" && <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />}
        {match && <MatchPill score={match.score} />}
        <span className="shrink-0 text-xs opacity-50">{p.distanceLabel}</span>
        <SayHi userId={p.userId} />
      </div>
      {p.track ? (
        <ul className="mt-1">
          <TrackRow track={p.track} right={status} />
        </ul>
      ) : (
        <p className="mt-1 text-xs opacity-50">Nothing played yet.</p>
      )}
      {match && match.score >= 40 && match.shared.length > 0 && (
        <p className="mt-1 truncate text-xs opacity-60">You both: {match.shared.join(", ")}</p>
      )}
    </li>
  );
}

function SayHi({ userId }: { userId: string }) {
  return (
    <Link
      href={`/chat/${userId}`}
      className="shrink-0 rounded-full border border-current/20 px-2 py-0.5 text-[11px] font-medium active:bg-current/10"
      aria-label="Chat"
    >
      💬 Hi
    </Link>
  );
}

function MatchPill({ score }: { score: number }) {
  return (
    <span className="shrink-0 rounded-full bg-green-500/15 px-2 py-0.5 text-[11px] font-semibold text-green-600 dark:text-green-400">
      {score}% match
    </span>
  );
}

/** Top taste matches across the whole app, regardless of distance. */
async function TasteTwins({ userId }: { userId: string }) {
  const matches = (await getTasteMatches(userId)).slice(0, 5);
  const distances = await getDistanceLabels(userId, matches.map((m) => m.userId));

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">Your taste twins</h2>
      {matches.length === 0 ? (
        <Empty>Still learning your taste. Check back after some listening.</Empty>
      ) : (
        <ul className="-mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-1">
          {matches.map((m) => (
            <li key={m.userId} className="flex w-36 shrink-0 snap-start flex-col gap-1.5 rounded-xl bg-current/5 p-3">
              <div className="flex items-center justify-between">
                {m.imageUrl ? (
                  <img src={m.imageUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-current/10" />
                )}
                <span className="text-xl font-bold text-green-600 dark:text-green-400">{m.score}%</span>
              </div>
              <p className="truncate text-sm font-medium">{m.displayName ?? "Spotify user"}</p>
              <p className="line-clamp-2 text-xs opacity-60">You both: {m.shared.join(", ")}</p>
              <div className="mt-auto flex items-center justify-between gap-1">
                <span className="truncate text-[11px] opacity-50">
                  {distances.get(m.userId) ? `📍 ${distances.get(m.userId)}` : ""}
                </span>
                <SayHi userId={m.userId} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
