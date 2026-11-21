import { connection } from "next/server";
import { Suspense } from "react";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { Skeleton } from "@/components/skeleton";
import { connectSpotify } from "./actions";
import { Summary } from "./summary";

// The shell prerenders statically; the session-dependent part streams in
// behind <Suspense> (required by Next 16 cacheComponents).
export default function Home() {
  return (
    <main className="flex flex-1 flex-col px-5 pt-6 pb-12">
      <Suspense fallback={<Skeleton />}>
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

  return (
    <div className="flex flex-col gap-6">
      <AppHeader name={name} image={image} />
      <Suspense fallback={<Skeleton />}>
        <Summary userId={id} />
      </Suspense>
    </div>
  );
}
