"use client";

import { useEffect, useRef, useState } from "react";
import type { CardKind } from "@/lib/cards";

/**
 * "Share to story" for one Summary card: shares a 1080x1920 PNG from /api/story?card=… via the native
 * share sheet, or downloads it where file sharing isn't supported (desktop, http on phones).
 * The PNG is prefetched once the button is near the viewport: iOS only allows navigator.share()
 * right after the tap, so there's no time to generate it on click.
 */
export function ShareStory({ card, version, title }: { card: CardKind; version: string; title: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch(`/api/story?card=${card}&v=${encodeURIComponent(version)}`)
        .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(String(res.status)))))
        .then((blob) => !cancelled && setFile(new File([blob], `layla-${card}.png`, { type: "image/png" })))
        .catch(() => !cancelled && setError(true));

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          observer.disconnect();
          load();
        }
      },
      { rootMargin: "300px" },
    );
    if (ref.current) observer.observe(ref.current);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [card, version]);

  async function share() {
    if (!file) return;
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: `My Layla: ${title}` });
      } catch {
        // user closed the share sheet
      }
      return;
    }
    const url = URL.createObjectURL(file);
    const a = Object.assign(document.createElement("a"), { href: url, download: file.name });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      ref={ref}
      type="button"
      onClick={share}
      disabled={!file}
      className="shrink-0 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
    >
      {error ? "Unavailable" : file ? "Share ↗" : "Preparing…"}
    </button>
  );
}
