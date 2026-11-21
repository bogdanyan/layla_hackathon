/* eslint-disable @next/next/no-img-element -- Spotify CDN images, no need for next/image here */
import Link from "next/link";
import type { ReactNode } from "react";
import {
  spotify,
  SpotifyApiError,
  type SpotifyImage,
  type SpotifyTrack,
  type TimeRange,
} from "@/lib/spotify";
import { connectSpotify } from "./actions";

const RANGES: { value: TimeRange; label: string }[] = [
  { value: "short_term", label: "4 weeks" },
  { value: "medium_term", label: "6 months" },
  { value: "long_term", label: "1 year" },
];

export function parseRange(value: unknown): TimeRange {
  return RANGES.some((r) => r.value === value) ? (value as TimeRange) : "short_term";
}

/** Everything the Spotify API gives us for this user, one section per endpoint. */
export async function SpotifyOverview({ userId, range }: { userId: string; range: TimeRange }) {
  // Fetch in parallel; each section handles its own failure.
  const [me, now, recent, topArtists, topTracks, liked, albums, playlists, following, shows] =
    await Promise.allSettled([
      spotify.me(userId),
      spotify.currentlyPlaying(userId),
      spotify.recentlyPlayed(userId, 50),
      spotify.topArtists(userId, range, 20),
      spotify.topTracks(userId, range, 20),
      spotify.savedTracks(userId, 20),
      spotify.savedAlbums(userId, 20),
      spotify.playlists(userId, 20),
      spotify.followedArtists(userId, 20),
      spotify.savedShows(userId, 20),
    ]);

  const needsReauth = [me, now, recent, topArtists, topTracks, liked, albums, playlists, following, shows].some(
    (r) => r.status === "rejected" && r.reason instanceof SpotifyApiError && r.reason.needsReauth,
  );

  return (
    <div className="flex flex-col gap-8">
      {needsReauth && (
        <form action={connectSpotify} className="rounded-2xl bg-amber-400/15 p-4 text-sm">
          <p>Some sections need extra Spotify permissions.</p>
          <button type="submit" className="mt-3 w-full rounded-full bg-[#1db954] py-2.5 font-semibold text-black">
            Reconnect Spotify
          </button>
        </form>
      )}

      <Section title="Profile" result={me}>
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

      <Section title="Now playing" result={now}>
        {(n) =>
          n?.item ? (
            <TrackRow track={n.item} right={n.is_playing ? "▶︎ playing" : "paused"} />
          ) : (
            <Empty>Nothing playing right now.</Empty>
          )
        }
      </Section>

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

        <Section title="Top artists" result={topArtists}>
          {(p) =>
            p.items.length ? (
              <div className="grid grid-cols-3 gap-3">
                {p.items.map((a, i) => (
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

        <Section title="Top tracks" result={topTracks}>
          {(p) => (
            <List empty="Not enough listening history yet.">
              {p.items.map((t, i) => (
                <TrackRow key={t.id} track={t} rank={i + 1} />
              ))}
            </List>
          )}
        </Section>
      </div>

      <Section title="Recently played" result={recent}>
        {(r) => (
          <List empty="No recent plays.">
            {r.items.map((it) => (
              <TrackRow key={it.played_at} track={it.track} right={timeAgo(it.played_at)} />
            ))}
          </List>
        )}
      </Section>

      <Section title="Liked songs" result={liked} count={(p) => p.total}>
        {(p) => (
          <List empty="No liked songs.">
            {p.items.map((it) => (
              <TrackRow key={it.track.id + it.added_at} track={it.track} right={timeAgo(it.added_at)} />
            ))}
          </List>
        )}
      </Section>

      <Section title="Playlists" result={playlists} count={(p) => p.total}>
        {(p) => (
          <List empty="No playlists.">
            {p.items.filter(Boolean).map((pl) => (
              <Row
                key={pl.id}
                href={pl.external_urls.spotify}
                images={pl.images ?? undefined}
                title={pl.name}
                subtitle={`by ${pl.owner.display_name ?? "unknown"}`}
                right={`${pl.tracks?.total ?? pl.items?.total ?? "?"} songs`}
              />
            ))}
          </List>
        )}
      </Section>

      <Section title="Saved albums" result={albums} count={(p) => p.total}>
        {(p) => (
          <List empty="No saved albums.">
            {p.items.map(({ album }) => (
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

      <Section title="Followed artists" result={following} count={(f) => f.artists.total}>
        {(f) => (
          <List empty="Not following any artists.">
            {f.artists.items.map((a) => (
              <Row key={a.id} href={a.external_urls.spotify} images={a.images} title={a.name} round />
            ))}
          </List>
        )}
      </Section>

      <Section title="Saved podcasts" result={shows} count={(p) => p.total}>
        {(p) => (
          <List empty="No saved podcasts.">
            {p.items.map(({ show }) => (
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
  result,
  count,
  children,
}: {
  title: string;
  result: PromiseSettledResult<T>;
  count?: (value: T) => number;
  children: (value: T) => ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-baseline justify-between text-lg font-semibold">
        {title}
        {result.status === "fulfilled" && count && (
          <span className="text-xs font-normal opacity-50">{count(result.value)} total</span>
        )}
      </h2>
      {result.status === "fulfilled" ? (
        children(result.value)
      ) : (
        <p className="rounded-xl bg-red-500/10 p-3 text-xs text-red-500">{errorText(result.reason)}</p>
      )}
    </section>
  );
}

function errorText(err: unknown) {
  if (err instanceof SpotifyApiError) {
    return err.needsReauth
      ? `Missing permission (${err.status}: ${err.message}). Reconnect Spotify above.`
      : `Spotify error ${err.status}: ${err.message}`;
  }
  return err instanceof Error ? err.message : String(err);
}

function List({ children, empty }: { children: ReactNode[]; empty: string }) {
  return children.length ? <ul className="flex flex-col gap-1">{children}</ul> : <Empty>{empty}</Empty>;
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm opacity-50">{children}</p>;
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

function TrackRow({ track, rank, right }: { track: SpotifyTrack; rank?: number; right?: string }) {
  return (
    <Row
      href={track.external_urls.spotify}
      images={track.album.images}
      rank={rank}
      title={track.name + (track.explicit ? " 🅴" : "")}
      subtitle={`${track.artists.map((a) => a.name).join(", ")} · ${track.album.name}`}
      right={right ?? formatDuration(track.duration_ms)}
    />
  );
}

function Row({
  href,
  images,
  title,
  subtitle,
  right,
  rank,
  round,
}: {
  href: string;
  images?: SpotifyImage[];
  title: string;
  subtitle?: string;
  right?: string;
  rank?: number;
  round?: boolean;
}) {
  return (
    <li>
      <a href={href} target="_blank" className="flex items-center gap-3 rounded-lg py-1.5 active:bg-current/5">
        {rank !== undefined && <span className="w-5 shrink-0 text-right text-xs opacity-50">{rank}</span>}
        <Img images={images} className={`h-11 w-11 shrink-0 ${round ? "rounded-full" : "rounded"}`} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">{title}</p>
          {subtitle && <p className="truncate text-xs opacity-60">{subtitle}</p>}
        </div>
        {right && <span className="shrink-0 text-xs opacity-50">{right}</span>}
      </a>
    </li>
  );
}

function Img({ images, className }: { images?: SpotifyImage[]; className: string }) {
  // Spotify sorts images largest first: take the smallest one that's still >= 64px.
  const src = images?.filter((i) => (i.width ?? 640) >= 64).at(-1)?.url ?? images?.[0]?.url;
  return src ? (
    <img src={src} alt="" loading="lazy" className={`object-cover ${className}`} />
  ) : (
    <div className={`bg-current/10 ${className}`} />
  );
}

function formatDuration(ms: number) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
