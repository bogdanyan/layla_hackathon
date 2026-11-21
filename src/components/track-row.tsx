/* eslint-disable @next/next/no-img-element -- Spotify CDN images, no need for next/image here */
// Presentational rows for tracks/artists/albums. No server or client APIs, so both
// server components and "use client" components can use them.
import type { ReactNode } from "react";
import type { StoredTrack } from "@/db";
import type { SpotifyImage } from "@/lib/spotify";

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm opacity-50">{children}</p>;
}

export function TrackRow({ track, rank, right }: { track: StoredTrack; rank?: number; right?: string }) {
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

export function Row({
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

export function Img({ images, className }: { images?: SpotifyImage[]; className: string }) {
  // Spotify sorts images largest first: take the smallest one that's still >= 64px.
  const src = images?.filter((i) => (i.width ?? 640) >= 64).at(-1)?.url ?? images?.[0]?.url;
  return src ? (
    <img src={src} alt="" loading="lazy" className={`object-cover ${className}`} />
  ) : (
    <div className={`bg-current/10 ${className}`} />
  );
}

export function formatDuration(ms: number) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
