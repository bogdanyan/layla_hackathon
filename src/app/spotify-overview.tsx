import { eq } from "drizzle-orm";
import Link from "next/link";
import type { ReactNode } from "react";
import { NowPlaying } from "@/components/now-playing";
import { Empty, Img, Row, TrackRow } from "@/components/track-row";
import { db, users, type User } from "@/db";
import type { TimeRange } from "@/lib/spotify";
import { getLatestSnapshots, getRecentPlays, type SnapshotKind } from "@/lib/sync";
import { getLatestVibe } from "@/lib/vibe";
import { connectSpotify, refreshSpotify } from "./actions";

const RANGES: { value: TimeRange; label: string }[] = [
  { value: "short_term", label: "4 weeks" },
  { value: "medium_term", label: "6 months" },
  { value: "long_term", label: "1 year" },
];

export function parseRange(value: unknown): TimeRange {
  return RANGES.some((r) => r.value === value) ? (value as TimeRange) : "short_term";
}

type SyncError = NonNullable<User["syncErrors"]>[string];

/** Everything we've synced from Spotify for this user (read from the DB, not live). */
export async function SpotifyOverview({ userId, range }: { userId: string; range: TimeRange }) {
  const [[user], snaps, recent, vibe] = await Promise.all([
    db
      .select({ lastSyncedAt: users.lastSyncedAt, syncErrors: users.syncErrors, nowPlaying: users.nowPlaying })
      .from(users)
      .where(eq(users.id, userId)),
    getLatestSnapshots(userId),
    getRecentPlays(userId, 50),
    getLatestVibe(userId),
  ]);
  const errors = user?.syncErrors ?? {};
  const err = (kind: SnapshotKind | "recent"): SyncError | undefined => errors[kind];
  const needsReauth = Object.values(errors).some((e) => e.needsReauth);

  const me = snaps.get("profile")?.data;
  const topArtists = snaps.get(`top_artists:${range}`)?.data;
  const topTracks = snaps.get(`top_tracks:${range}`)?.data;
  const liked = snaps.get("liked")?.data;
  const playlists = snaps.get("playlists")?.data;
  const albums = snaps.get("albums")?.data;
  const following = snaps.get("following")?.data;
  const shows = snaps.get("shows")?.data;
  const now = user?.nowPlaying;

  return (
    <div className="flex flex-col gap-8">
      <form action={refreshSpotify} className="-mt-4 flex items-center justify-between text-xs opacity-60">
        <span>{user?.lastSyncedAt ? `Synced ${timeAgo(user.lastSyncedAt)}` : "Not synced yet"}</span>
        <button type="submit" className="underline underline-offset-2">
          Refresh
        </button>
      </form>

      {needsReauth && (
        <form action={connectSpotify} className="rounded-2xl bg-amber-400/15 p-4 text-sm">
          <p>Some sections need extra Spotify permissions.</p>
          <button type="submit" className="mt-3 w-full rounded-full bg-[#1db954] py-2.5 font-semibold text-black">
            Reconnect Spotify
          </button>
        </form>
      )}

      {vibe && (
        <section
          className="rounded-3xl p-5 text-white"
          style={{ background: `linear-gradient(135deg, ${vibe.colors.slice(0, 3).join(", ")})` }}
        >
          <p className="text-xs uppercase tracking-wider opacity-80">Your vibe</p>
          <h2 className="mt-1 text-2xl font-bold">
            {vibe.emoji} {vibe.title}
          </h2>
          <p className="mt-2 text-sm opacity-90">{vibe.summary}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {vibe.moods.map((m) => (
              <span key={m} className="rounded-full bg-black/20 px-2.5 py-1 text-xs">
                {m}
              </span>
            ))}
          </div>
        </section>
      )}

      <Section title="Profile" value={me} error={err("profile")}>
        {(u) => (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Field label="Name" value={u.display_name} />
            <Field label="Email" value={u.email} />
            <Field label="Country" value={u.country} />
            <Field label="Plan" value={u.product} />
            <Field label="Followers" value={u.followers?.total} />
            <Field label="Spotify ID" value={u.id} />
          </dl>
        )}
      </Section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Now playing</h2>
        <NowPlaying initial={now ?? null} />
      </section>

      <div className="flex flex-col gap-4">
        <div className="flex rounded-full bg-current/10 p-1 text-xs font-medium">
          {RANGES.map((r) => (
            <Link
              key={r.value}
              href={`/?range=${r.value}`}
              scroll={false}
              className={`flex-1 rounded-full py-2 text-center ${r.value === range ? "bg-foreground text-background" : "opacity-70"}`}
            >
              {r.label}
            </Link>
          ))}
        </div>

        <Section title="Top artists" value={topArtists} error={err(`top_artists:${range}`)}>
          {(p) =>
            p.items.length ? (
              <div className="grid grid-cols-3 gap-3">
                {p.items.slice(0, 21).map((a, i) => (
                  <a key={a.id} href={a.external_urls.spotify} target="_blank" className="min-w-0 text-center">
                    <Img images={a.images} className="aspect-square w-full rounded-full" />
                    <p className="mt-1 truncate text-xs">
                      <span className="opacity-50">{i + 1}.</span> {a.name}
                    </p>
                  </a>
                ))}
              </div>
            ) : (
              <Empty>Not enough listening history yet.</Empty>
            )
          }
        </Section>

        <Section title="Top tracks" value={topTracks} error={err(`top_tracks:${range}`)}>
          {(p) => (
            <List empty="Not enough listening history yet.">
              {p.items.slice(0, 20).map((t, i) => (
                <TrackRow key={t.id} track={t} rank={i + 1} />
              ))}
            </List>
          )}
        </Section>
      </div>

      <Section title="Recently played" value={recent} error={err("recent")}>
        {(r) => (
          <List empty="No recent plays.">
            {r.map((it) => (
              <TrackRow key={it.playedAt.toISOString()} track={it.track} right={timeAgo(it.playedAt)} />
            ))}
          </List>
        )}
      </Section>

      <Section title="Liked songs" value={liked} error={err("liked")} count={(p) => p.total}>
        {(p) => (
          <List empty="No liked songs.">
            {p.items.slice(0, 20).map((it) => (
              <TrackRow key={it.track.id + it.added_at} track={it.track} right={timeAgo(it.added_at)} />
            ))}
          </List>
        )}
      </Section>

      <Section title="Playlists" value={playlists} error={err("playlists")} count={(p) => p.total}>
        {(p) => (
          <List empty="No playlists.">
            {p.items.slice(0, 20).map((pl) => (
              <Row
                key={pl.id}
                href={pl.external_urls.spotify}
                images={pl.images ?? undefined}
                title={pl.name}
                subtitle={`by ${pl.owner.display_name ?? "unknown"}`}
                right={`${pl.tracks?.total ?? "?"} songs`}
              />
            ))}
          </List>
        )}
      </Section>

      <Section title="Saved albums" value={albums} error={err("albums")} count={(p) => p.total}>
        {(p) => (
          <List empty="No saved albums.">
            {p.items.slice(0, 20).map(({ album }) => (
              <Row
                key={album.id}
                href={album.external_urls.spotify}
                images={album.images}
                title={album.name}
                subtitle={album.artists.map((a) => a.name).join(", ")}
                right={album.release_date?.slice(0, 4)}
              />
            ))}
          </List>
        )}
      </Section>

      <Section title="Followed artists" value={following} error={err("following")} count={(f) => f.total}>
        {(f) => (
          <List empty="Not following any artists.">
            {f.items.slice(0, 20).map((a) => (
              <Row key={a.id} href={a.external_urls.spotify} images={a.images} title={a.name} round />
            ))}
          </List>
        )}
      </Section>

      <Section title="Saved podcasts" value={shows} error={err("shows")} count={(p) => p.total}>
        {(p) => (
          <List empty="No saved podcasts.">
            {p.items.slice(0, 20).map(({ show }) => (
              <Row
                key={show.id}
                href={show.external_urls.spotify}
                images={show.images}
                title={show.name}
                subtitle={show.publisher}
              />
            ))}
          </List>
        )}
      </Section>
    </div>
  );
}

// ---------- small presentational helpers ----------

function Section<T>({
  title,
  value,
  error,
  count,
  children,
}: {
  title: string;
  value: T | undefined;
  error?: SyncError;
  count?: (value: T) => number;
  children: (value: T) => ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-baseline justify-between text-lg font-semibold">
        {title}
        {value !== undefined && count && <span className="text-xs font-normal opacity-50">{count(value)} total</span>}
      </h2>
      {value !== undefined ? (
        children(value)
      ) : error ? (
        <p className="rounded-xl bg-red-500/10 p-3 text-xs text-red-500">
          {error.needsReauth
            ? `Missing permission (${error.status}: ${error.message}). Reconnect Spotify above.`
            : `Spotify error${error.status ? ` ${error.status}` : ""}: ${error.message}`}
        </p>
      ) : (
        <Empty>Not synced yet.</Empty>
      )}
    </section>
  );
}

function List({ children, empty }: { children: ReactNode[]; empty: string }) {
  return children.length ? <ul className="flex flex-col gap-1">{children}</ul> : <Empty>{empty}</Empty>;
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="min-w-0">
      <dt className="text-xs opacity-50">{label}</dt>
      <dd className="truncate">{value}</dd>
    </div>
  );
}

function timeAgo(date: Date | string) {
  const mins = Math.round((Date.now() - new Date(date).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
