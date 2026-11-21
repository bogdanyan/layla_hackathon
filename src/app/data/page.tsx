import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { Skeleton } from "@/components/skeleton";
import type { TimeRange } from "@/lib/spotify";
import { ensureFresh } from "@/lib/vibe";
import { parseRange, SpotifyOverview } from "../spotify-overview";

/** "All my Spotify data": the raw synced data, section by section. */
export default function DataPage({ searchParams }: PageProps<"/data">) {
  return (
    <main className="flex flex-1 flex-col px-5 pt-6 pb-12">
      <Suspense fallback={<Skeleton />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/data">["searchParams"] }) {
  await connection(); // see page.tsx: auth() must run at request time
  const session = await auth();
  if (!session?.user) redirect("/");
  const range = parseRange((await searchParams).range);

  return (
    <div className="flex flex-col gap-8">
      <AppHeader name={session.user.name} image={session.user.image} back />
      <Suspense key={range} fallback={<Skeleton />}>
        <SyncedOverview userId={session.user.id} range={range} />
      </Suspense>
    </div>
  );
}

async function SyncedOverview({ userId, range }: { userId: string; range: TimeRange }) {
  await ensureFresh(userId);
  return <SpotifyOverview userId={userId} range={range} />;
}
