"use client";

import { useEffect, useState } from "react";
import type { NowPlaying as NowPlayingData } from "@/db";
import { Empty, TrackRow } from "./track-row";

const POLL_MS = 30_000;

/** Shows the user's current track and keeps it live by polling /api/now-playing while the tab is visible. */
export function NowPlaying({ initial }: { initial: NowPlayingData | null }) {
  const [now, setNow] = useState(initial);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;

    const poll = async () => {
      try {
        const res = await fetch("/api/now-playing", { cache: "no-store" });
        if (res.ok) setNow((await res.json()).nowPlaying);
      } catch {
        // offline or server restarting: keep showing the last value
      }
    };
    const start = () => {
      clearInterval(timer);
      timer = setInterval(poll, POLL_MS);
    };
    // Pause while the tab is hidden (saves battery and Spotify calls); catch up immediately on return.
    const onVisibility = () => {
      if (document.hidden) clearInterval(timer);
      else {
        poll();
        start();
      }
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return now ? (
    <ul>
      <TrackRow track={now.track} right={now.isPlaying ? "▶︎ playing" : "paused"} />
    </ul>
  ) : (
    <Empty>Nothing playing right now.</Empty>
  );
}
