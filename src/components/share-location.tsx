"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { stopSharingLocation, updateMyLocation } from "@/app/location-actions";

type Status = "idle" | "loading" | "sharing" | "denied" | "error" | "unsupported";

// Round on the client too, so precise coords never leave the device.
const round = (n: number) => Math.round(n * 100) / 100;

export function ShareLocation() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");

  const share = useCallback(() => {
    if (!("geolocation" in navigator)) return setStatus("unsupported");
    setStatus("loading");
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          await updateMyLocation(round(coords.latitude), round(coords.longitude));
          setStatus("sharing");
          router.refresh();
        } catch {
          setStatus("error");
        }
      },
      (err) => setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "error"),
      { enableHighAccuracy: false, maximumAge: 10 * 60 * 1000, timeout: 10_000 },
    );
  }, [router]);

  // If permission was already granted, refresh silently on mount.
  useEffect(() => {
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((p) => {
        if (p.state === "granted") share();
        else if (p.state === "denied") setStatus("denied");
      })
      .catch(() => {});
  }, [share]);

  async function stop() {
    await stopSharingLocation();
    setStatus("idle");
    router.refresh();
  }

  if (status === "sharing") {
    return (
      <div className="flex items-center justify-between rounded-xl bg-green-500/10 px-4 py-3 text-sm">
        <span>📍 Sharing approximate location (~1 km)</span>
        <button onClick={stop} className="font-medium underline">
          Stop
        </button>
      </div>
    );
  }

  const message = {
    idle: null,
    loading: null,
    denied: "Location is off, so you won't appear nearby. Enable it in your browser settings.",
    error: "Couldn't get your location. Try again.",
    unsupported: "Your browser doesn't support location.",
  }[status];

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={share}
        disabled={status === "loading" || status === "unsupported"}
        className="rounded-full bg-green-500 px-4 py-3 font-semibold text-black disabled:opacity-50"
      >
        {status === "loading" ? "Locating…" : "📍 Share my approximate location"}
      </button>
      {message && <p className="text-center text-xs opacity-70">{message}</p>}
    </div>
  );
}
