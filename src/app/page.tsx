/* eslint-disable @next/next/no-img-element */
import { connection } from "next/server";
import { Suspense } from "react";
import { auth } from "@/auth";
import type { TimeRange } from "@/lib/spotify";
import { ensureFresh } from "@/lib/vibe";
import { connectSpotify, logOut } from "./actions";
import { parseRange, SpotifyOverview } from "./spotify-overview";

// The shell prerenders statically; the session-dependent part streams in
// behind <Suspense> (required by Next 16 cacheComponents).
export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <main className="flex flex-1 flex-col px-5 pt-6 pb-12">
      <Suspense fallback={<Skeleton />}>
        <Account searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Account({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  // Auth.js generates random values (CSRF token) while reading the session,
  // so this must render at request time, not during prerendering.
  await connection();
  const session = await auth();

  if (!session?.user) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
        <div>
          <h1 className="text-3xl font-semibold">Layla</h1>
          <p className="mt-2 text-sm opacity-60">Discover your music vibe.</p>
        </div>
        <form className="w-full" action={connectSpotify}>
          <button
            type="submit"
            className="w-full rounded-full bg-[#1db954] py-4 font-semibold text-black active:opacity-80"
          >
            Connect Spotify
          </button>
        </form>
      </div>
    );
  }

  const { name, image, id } = session.user;
  const range = parseRange((await searchParams).range);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-center gap-3">
        {image ? (
          <img src={image} alt="" className="h-12 w-12 rounded-full object-cover" />
        ) : (
          <div className="h-12 w-12 rounded-full bg-current/10" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs opacity-60">Layla</p>
          <p className="truncate text-lg font-semibold">{name ?? "Spotify user"}</p>
        </div>
        <form action={logOut}>
          <button type="submit" className="rounded-full border border-current/30 px-3 py-1.5 text-xs opacity-70">
            Sign out
          </button>
        </form>
      </header>

      <Suspense key={range} fallback={<Skeleton />}>
        <SyncedOverview userId={id} range={range} />
      </Suspense>
    </div>
  );
}

/** Keeps the stored Spotify data fresh, then renders it from the DB. */
async function SyncedOverview({ userId, range }: { userId: string; range: TimeRange }) {
  await ensureFresh(userId);
  return <SpotifyOverview userId={userId} range={range} />;
}

function Skeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-3">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="h-12 rounded-xl bg-current/10" />
      ))}
    </div>
  );
}
