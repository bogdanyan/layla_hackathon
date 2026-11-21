import { connection } from "next/server";
import { Suspense } from "react";
import { auth } from "@/auth";
import { connectSpotify, logOut } from "./actions";

// The shell prerenders statically; the session-dependent part streams in
// behind <Suspense> (required by Next 16 cacheComponents).
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 text-center">
      <div>
        <h1 className="text-3xl font-semibold">Layla</h1>
        <p className="mt-2 text-sm opacity-60">Discover your music vibe.</p>
      </div>
      <Suspense fallback={<div className="h-14 w-full animate-pulse rounded-full bg-current/10" />}>
        <Account />
      </Suspense>
    </main>
  );
}

async function Account() {
  // Auth.js generates random values (CSRF token) while reading the session,
  // so this must render at request time, not during prerendering.
  await connection();
  const session = await auth();

  if (!session?.user) {
    return (
      <form className="w-full" action={connectSpotify}>
        <button
          type="submit"
          className="w-full rounded-full bg-[#1db954] py-4 font-semibold text-black active:opacity-80"
        >
          Connect Spotify
        </button>
      </form>
    );
  }

  const { name, image } = session.user;

  return (
    <div className="flex w-full flex-col items-center gap-6">
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="h-24 w-24 rounded-full object-cover" />
      )}
      <div>
        <p className="text-sm opacity-60">Signed in as</p>
        <p className="text-2xl font-semibold">{name ?? "Spotify user"}</p>
      </div>
      <form className="w-full" action={logOut}>
        <button type="submit" className="w-full rounded-full border border-current py-3 text-sm opacity-70">
          Sign out
        </button>
      </form>
    </div>
  );
}
